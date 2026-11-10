#!/usr/bin/env node
// 빌드 전 필수 검사 — the gate every build and update goes through: the PC installer (npm run dist), the Mac build,
// the iPhone build (npm run build:ios) and the over-the-air update (npm run update:prod).
// Everything the apps can check without a device: the unit tests (server functions, shared math, the apps' pure
// modules), the PC/web renderer build, the PC screen checks in a hidden, muted Electron window, and the phone bundle.
//   node scripts/preflight.cjs            everything (a few minutes)
//   node scripts/preflight.cjs --quick    tests and the renderer build only
// Stops at the first failure with a non-zero exit, so a chained build does not run.
const { spawnSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), os = require('node:os');

const root = path.resolve(__dirname, '..'), desktop = path.join(root, 'desktop'), mobile = path.join(root, 'mobile');
const quick = process.argv.includes('--quick');
// The Electron checks need a real Electron, not Electron-as-Node (set when run from inside an Electron app).
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;

const steps = [
  { name: '단위 테스트 — 서버 함수·공유 수학·앱 순수 모듈', cmd: 'node --test', cwd: desktop },
  { name: 'PC·웹 화면 빌드', cmd: 'npx vite build', cwd: desktop },
];
if (!quick) {
  steps.push(
    { name: 'PC 화면 점검 — 체커 (할 일·팀·달력·연결)', cmd: 'node scripts/run-ui-smoke.cjs', cwd: desktop },
    { name: 'PC 화면 점검 — 펫·시계·게임', cmd: 'node scripts/run-ui-smoke.cjs focus-smoke.cjs', cwd: desktop },
    { name: 'PC 화면 점검 — 팀원 창·👁 비공개', cmd: 'npx electron scripts/member-probe.cjs', cwd: desktop },
    { name: 'PC 화면 점검 — 방·음악 제목', cmd: 'npx electron scripts/work-smoke.cjs', cwd: desktop },
    { name: '아이폰 번들 — JS가 컴파일되는지', cmd: `npx expo export --platform ios --output-dir "${fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-expo-'))}"`, cwd: mobile },
  );
}

const started = Date.now();
console.log(`\n빌드 전 필수 검사 ${quick ? '(빠르게: 테스트·빌드만)' : ''}— ${steps.length}단계\n`);
for (const [i, s] of steps.entries()) {
  const t = Date.now();
  console.log(`[${i + 1}/${steps.length}] ${s.name}`);
  const r = spawnSync(s.cmd, { cwd: s.cwd, env, stdio: 'inherit', shell: true, windowsHide: true });
  if (r.status !== 0) {
    console.error(`\n✗ 실패: ${s.name} (${s.cmd})\n  고치기 전에는 빌드·업데이트를 올리지 않아요.`);
    process.exit(r.status || 1);
  }
  console.log(`    ✓ ${((Date.now() - t) / 1000).toFixed(1)}초\n`);
}
console.log(`모두 통과 — ${((Date.now() - started) / 1000).toFixed(0)}초. 빌드해도 돼요.`);
