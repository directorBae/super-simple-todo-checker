// 회의록 저장소 = 로컬 저장소: a done memo as a markdown file under the person's documents — "Work 회의록/<팀>/<날짜> <제목>
// [<id>].md" — and opening that folder. The same memo always gets the same file, so saving again is harmless.
const { app, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const shared = (name) => { try { return require('../shared/' + name); } catch { return require('../../shared/' + name); } };
const { MEMO_FOLDER, safeName, memoFileName, memoMarkdown } = shared('memo-file.cjs');

const root = () => path.join(app.getPath('documents'), MEMO_FOLDER);
const teamDir = (team) => path.join(root(), safeName(team) || '팀');

async function save({ team, memo, names } = {}) {
  if (!memo || typeof memo !== 'object' || !memo.id) return { ok: false, error: '메모가 비어 있어요.' };
  try {
    const dir = teamDir(team);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, memoFileName(memo));
    const existed = await fs.access(file).then(() => true, () => false);
    if (!existed) await fs.writeFile(file, memoMarkdown(memo, { team, names: names || {} }), 'utf8');
    return { ok: true, path: file, dir, folder: `${MEMO_FOLDER}/${safeName(team) || '팀'}`, existed };
  } catch (e) { return { ok: false, error: '회의록 파일을 저장하지 못했어요: ' + e.message }; }
}
// Only paths inside the 회의록 folder are opened (the renderer asks).
function show(p) {
  const target = path.resolve(String(p || ''));
  if (!target.startsWith(root())) return { ok: false };
  shell.showItemInFolder(target);
  return { ok: true };
}
module.exports = { save, show, root };
