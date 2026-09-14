"""Package only the demo executable, clean server runtime and iOS build sources."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESKTOP_VERSION = json.loads((ROOT / "desktop/package.json").read_text(encoding="utf-8"))["version"]
VERSION = json.loads((ROOT / "mobile/package.json").read_text(encoding="utf-8"))["version"]
OUT = ROOT / "artifacts" / f"demo-2026-09-14-v{VERSION}"
OUT.mkdir(parents=True, exist_ok=True)

installer = ROOT / f"desktop/release/demo/todo-checker-demo-Setup-{DESKTOP_VERSION}.exe"
if not installer.is_file():
    raise SystemExit("Run npm run dist:demo in desktop first")
shutil.copy2(installer, OUT / installer.name)

server = OUT / "todo-checker-demo-server"
server.mkdir(exist_ok=True)
for name in ["index.js", "package.json", "package-lock.json", ".env.example", "allow-lan.ps1", "allow-phone-connection.cmd", "start-server.cmd", "start-server.ps1"]:
    shutil.copy2(ROOT / "server" / name, server / name)
for name in ["lib", "node_modules"]:
    shutil.copytree(ROOT / "server" / name, server / name, dirs_exist_ok=True)
runtime = server / "runtime"
runtime.mkdir(exist_ok=True)
node = Path(shutil.which("node")).resolve()
shutil.copy2(node, runtime / "node.exe")
shutil.copy2(node.parent / "LICENSE", runtime / "NODE-LICENSE.txt")

def archive(folder, target, include):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in folder.rglob("*"):
            if path.is_file() and include(path.relative_to(folder)):
                z.write(path, str(Path(folder.name) / path.relative_to(folder)))

# A user might have run the extracted server before re-packaging. Never include its data.
archive(server, OUT / "todo-checker-demo-server-windows-x64.zip",
        lambda p: p.parts[0] in {"runtime", "lib", "node_modules"} or str(p) in {"index.js", "package.json", "package-lock.json", ".env.example", "start-server.cmd", "start-server.ps1", "allow-lan.ps1", "allow-phone-connection.cmd"})
mobile_files = {"App.js", "index.js", "app.json", "app.config.js", "eas.json", "package.json", "package-lock.json", ".gitignore", ".easignore", "LICENSE"}
archive(ROOT / "mobile", OUT / "todo-checker-ios-build-project.zip",
        lambda p: p.parts[0] in {"src", "assets", "scripts"} or str(p) in mobile_files)
for name in ["demo-build-install.md", "integration-setup.md", "accounts-and-installers.md", f"uiux-{VERSION}.md"]:
    shutil.copy2(ROOT / "docs" / name, OUT / name)
files = []
for p in OUT.iterdir():
    if p.is_file() and p.suffix in {".exe", ".zip", ".apk", ".ipa", ".md"}:
        files.append({"file": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT / "manifest.json").write_text(json.dumps({
    "builtAt": "2026-09-14", "serverNodeVersion": subprocess.check_output([str(node), "--version"], text=True).strip(),
    "iosStatus": "Signed ad hoc IPA included; install using the EAS link on a registered iPhone." if any(f["file"].endswith(".ipa") for f in files) else "Source project only. Linked to @teamblco/todo-checker; IPA build pending.", "files": files,
}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(files, ensure_ascii=False, indent=2))
