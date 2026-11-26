// The packaged app (electron-builder) carries only the shared files its `files` filter lets through. Every shared
// file the main process asks for — shared('x.cjs') / sharedFile('x.mjs') in electron/*.cjs — must get through, or
// the installed app dies at start with "Cannot find module '../../shared/x.cjs'" (1.5.0 did, on Mac and Windows).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// What the filter lets through, out of what is really in ../shared (globs like *.cjs, or exact names).
function packagedShared() {
  const rule = pkg.build.files.find((f) => f && typeof f === 'object' && f.from === '../shared');
  assert.ok(rule, 'package.json build.files must copy ../shared into the app');
  const names = fs.readdirSync(path.join(root, '..', 'shared'));
  const matches = (pattern, name) => new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name);
  return new Set(names.filter((n) => (rule.filter || ['*']).some((p) => matches(p, n))));
}
// The shared files the main process loads at run time.
function requiredShared() {
  const wanted = new Set();
  for (const file of fs.readdirSync(path.join(root, 'electron')).filter((f) => f.endsWith('.cjs'))) {
    const text = fs.readFileSync(path.join(root, 'electron', file), 'utf8');
    for (const m of text.matchAll(/\b(?:shared|sharedFile)\(\s*'([^']+)'\s*\)/g)) wanted.add(m[1]);
    for (const m of text.matchAll(/require\(\s*'\.\.\/\.\.\/shared\/([^']+)'\s*\)/g)) wanted.add(m[1]);
  }
  return wanted;
}

test('every shared file the main process loads is packaged into the app', () => {
  const packaged = packagedShared(), wanted = requiredShared();
  assert.ok(wanted.size >= 5, 'the main process loads shared files: ' + [...wanted].join(', '));
  for (const name of wanted) {
    assert.ok(fs.existsSync(path.join(root, '..', 'shared', name)), `shared/${name} exists`);
    assert.ok(packaged.has(name), `shared/${name} must pass the package.json build.files filter (it would be missing from the installed app)`);
  }
});
