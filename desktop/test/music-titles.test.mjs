// Music rows show a title, not the link: a title that never came (YouTube did not answer when the row was added, or
// the row came from the other platform with the bare link as its title) is recognised as missing on both platforms,
// asked for again, and filled in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTitle, untitled, rowLabel, setTitle } from '../src/focus/playlist.mjs';
import { tidy, fetchTitle, entryOf } from '../../mobile/src/playlist.js';

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

test('music (PC/web): a link as a title counts as no title — the row shows the link, and the title can still be set', () => {
  const rows = [{ id: '1', url, title: '' }, { id: '2', url, title: url }, { id: '3', url, title: 'Never Gonna Give You Up' }];
  assert.deepEqual(rows.map(hasTitle), [false, false, true]);
  assert.deepEqual(untitled(rows).map((x) => x.id), ['1', '2']);
  assert.equal(rowLabel(rows[1]), 'youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(rowLabel(rows[2]), 'Never Gonna Give You Up');
  const filled = setTitle(setTitle(rows, '1', 'One'), '2', 'Two');
  assert.deepEqual(filled.map((x) => x.title), ['One', 'Two', 'Never Gonna Give You Up']);
  assert.equal(setTitle(rows, '3', 'Other')[2].title, 'Never Gonna Give You Up', 'a real title is never overwritten');
});

test('music (phone): a new link keeps the link as its title until YouTube answers; a row saved without a title does too', async () => {
  const entry = entryOf(url);
  assert.equal(entry.title, entry.url);
  assert.equal(tidy([{ id: 'x', url, title: '' }])[0].title, url, 'empty title → the link, so the screen knows to ask');
  const ok = async () => ({ ok: true, json: async () => ({ title: '  Never Gonna Give You Up  ' }) });
  assert.equal(await fetchTitle(url, ok), 'Never Gonna Give You Up');
  assert.equal(await fetchTitle(url, async () => ({ ok: false })), null, 'no answer → nothing (asked again later)');
  assert.equal(await fetchTitle(url, () => new Promise(() => {}), 20), null, 'a hang is given up on');
});
