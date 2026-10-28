import test from 'node:test';
import assert from 'node:assert/strict';
import { entryOf, tidy, localList, queueOf, nextIndex, moveItem, dropIndex, seedFrom, fetchTitle, createSaver, urlOf } from '../src/playlist.js';
import { DEFAULT_MUSIC } from '../../shared/youtube.js';
import toolsClient from '../../shared/tools-client.cjs';

const V = 'dQw4w9WgXcQ', L = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

test('a pasted link becomes an entry with a canonical URL the server keeps', () => {
  const v = entryOf(`https://youtu.be/${V}?si=abc`, 'a');
  assert.deepEqual(v, { id: 'a', url: `https://www.youtube.com/watch?v=${V}`, videoId: V, listId: null, title: `https://www.youtube.com/watch?v=${V}` });
  const p = entryOf(`http://m.youtube.com/playlist?list=${L}`, 'b');
  assert.equal(p.url, `https://www.youtube.com/playlist?list=${L}`);
  assert.equal(entryOf(`https://www.youtube.com/watch?v=${V}&list=${L}`).url, `https://www.youtube.com/watch?v=${V}&list=${L}`);
  assert.equal(entryOf('https://vimeo.com/1'), null);
  assert.equal(entryOf(''), null);
  // cleanPlaylist on the server side must not drop what we make (youtube-nocookie and http links included)
  const made = ['https://www.youtube-nocookie.com/embed/' + V, 'http://youtube.com/shorts/' + V].map((u) => entryOf(u));
  assert.equal(toolsClient.cleanPlaylist(made).length, 2);
});

test('tidy fills URLs of old phone entries and ids of URL-only entries', () => {
  const out = tidy([{ id: 'old', videoId: V, listId: null, title: '' }, { id: 'u', url: `https://www.youtube.com/playlist?list=${L}`, title: '목록' }, { id: 'bad', url: 'https://x.com' }, null]);
  assert.deepEqual(out.map((x) => [x.id, x.url, x.videoId, x.listId, x.title]), [
    ['old', urlOf({ videoId: V }), V, null, urlOf({ videoId: V })],
    ['u', `https://www.youtube.com/playlist?list=${L}`, null, L, '목록'],
  ]);
  assert.equal(tidy(Array.from({ length: 250 }, (_, i) => ({ id: String(i), videoId: V }))).length, 200);
});

test('the local list leaves out the built-in picks; an empty list plays the built-in music', () => {
  assert.deepEqual(localList(undefined), []);
  assert.deepEqual(localList([...DEFAULT_MUSIC, { id: 'mine', videoId: V, listId: null, title: '내 곡' }]).map((x) => x.id), ['mine']);
  assert.equal(queueOf([]), DEFAULT_MUSIC);
  const mine = [entryOf(`https://youtu.be/${V}`)];
  assert.equal(queueOf(mine), mine);
});

test('playback goes down the list and wraps to the top', () => {
  const q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextIndex(q, 'a'), 1);
  assert.equal(nextIndex(q, 'c'), 0);
  assert.equal(nextIndex([{ id: 'a' }], 'a'), 0); // a single entry repeats
  assert.equal(nextIndex(q, 'gone', 1), 1); // the playing one was removed: the one that took its place
  assert.equal(nextIndex(q, 'gone', 3), 0);
  assert.equal(nextIndex(q, null, -1), 0);
  assert.equal(nextIndex([], 'a'), -1);
});

test('reordering', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b'], 1, 9), ['a', 'b']);
  assert.equal(dropIndex(0, 55, 40, 4), 1);
  assert.equal(dropIndex(2, -1000, 40, 4), 0);
  assert.equal(dropIndex(1, 1000, 40, 4), 3);
  assert.equal(dropIndex(1, 10, 40, 4), 1);
});

test('the account list is seeded from this phone once, and only when empty', () => {
  const phone = [...DEFAULT_MUSIC, { id: 'mine', videoId: V, listId: null, title: '내 곡' }];
  assert.deepEqual(seedFrom([], phone, false).map((x) => x.id), ['mine']);
  assert.equal(seedFrom([], phone, true), null);
  assert.equal(seedFrom([{ id: 'x' }], phone, false), null);
  assert.equal(seedFrom([], DEFAULT_MUSIC, false), null);
  assert.equal(seedFrom([], undefined, false), null);
});

test('titles come from oEmbed, else null', async () => {
  let asked;
  const ok = (body) => async (url) => { asked = url; return { ok: true, json: async () => body }; };
  assert.equal(await fetchTitle(`https://www.youtube.com/watch?v=${V}`, ok({ title: ' 노래 ' })), '노래');
  assert.equal(asked, `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${V}`)}&format=json`);
  assert.equal(await fetchTitle('u', async () => ({ ok: false })), null);
  assert.equal(await fetchTitle('u', async () => { throw new Error('offline'); }), null);
  assert.equal(await fetchTitle('u', () => new Promise(() => {}), 20), null);
  assert.equal(await fetchTitle('u', ok({})), null);
});

test('saving waits for the last change, runs one at a time and retries after a failure', async () => {
  const saved = [];
  let fail = false;
  const saver = createSaver(async (l) => { if (fail) throw new Error('offline'); saved.push(l); }, 20);
  saver.push([1]); saver.push([1, 2]);
  assert.equal(saver.busy(), true);
  await new Promise((r) => setTimeout(r, 40));
  await saver.flush();
  assert.deepEqual(saved, [[1, 2]]);
  assert.equal(saver.busy(), false);
  fail = true;
  saver.push([3]);
  await saver.flush();
  assert.equal(saver.busy(), true); // still waiting to go up
  fail = false;
  await saver.flush();
  assert.deepEqual(saved, [[1, 2], [3]]);
  assert.equal(saver.busy(), false);
});
