import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { entryFromLink, toEntry, cleanList, localList, addEntry, removeEntry, moveEntry, setTitle, queueOf, nextIndex, rowLabel, youtubeUrl, MAX_ENTRIES } from '../src/focus/playlist.mjs';
import { DEFAULT_MUSIC } from '../../shared/youtube.js';
const tools = createRequire(import.meta.url)('../electron/tools.cjs');

const e = (id, videoId, listId = null) => ({ id, url: youtubeUrl({ videoId, listId }), videoId, listId, title: '' });

test('links become entries with a canonical YouTube https url; other links do not', () => {
  assert.deepEqual(entryFromLink('https://youtu.be/7NOSDKb0HlU?t=3', 'a'), { id: 'a', url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU', videoId: '7NOSDKb0HlU', listId: null, title: '' });
  assert.equal(entryFromLink('https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', 'b').url, 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  assert.equal(entryFromLink('https://www.youtube.com/watch?v=7NOSDKb0HlU&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG', 'c').url, 'https://www.youtube.com/watch?v=7NOSDKb0HlU&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  assert.equal(entryFromLink('https://vimeo.com/123'), null);
  assert.equal(entryFromLink(''), null);
  // The account side only takes these https links.
  assert.match(entryFromLink('http://m.youtube.com/watch?v=7NOSDKb0HlU').url, /^https:\/\/(www\.)?youtube\.com\//);
});

test('stored lists are cleaned; old settings.music items gain a url and the built-in picks are left out of the local list', () => {
  assert.deepEqual(toEntry({ id: 'x', videoId: 'n61ULEU7CO0', title: 'Lofi' }), { id: 'x', url: 'https://www.youtube.com/watch?v=n61ULEU7CO0', videoId: 'n61ULEU7CO0', listId: null, title: 'Lofi' });
  assert.equal(toEntry({ id: 'y', url: 'https://example.com/a' }), null);
  assert.equal(toEntry({ id: 'z', videoId: 'bad' }), null);
  assert.equal(cleanList([null, 3, { url: 'https://youtu.be/7NOSDKb0HlU' }]).length, 1);
  assert.equal(cleanList(Array.from({ length: 250 }, (_, i) => e(String(i), '7NOSDKb0HlU'))).length, MAX_ENTRIES);
  const mine = { id: 'mine', videoId: '5yx6BWlEVcY', listId: null, title: '' };
  assert.deepEqual(localList([...DEFAULT_MUSIC, mine]).map((x) => x.id), ['mine']);
  assert.deepEqual(localList(undefined), []);
});

test('add, remove, reorder and titles', () => {
  const a = e('a', '7NOSDKb0HlU'), b = e('b', 'n61ULEU7CO0'), c = e('c', null, 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  let r = addEntry([], a); assert.deepEqual(r, { list: [a], index: 0 });
  r = addEntry(r.list, b); assert.equal(r.index, 1);
  const again = addEntry(r.list, { ...a, id: 'dup' }); assert.equal(again.list, r.list); assert.equal(again.index, 0);
  assert.equal(addEntry(Array.from({ length: MAX_ENTRIES }, (_, i) => e(String(i), 'Dx5qFachd3A', 'PL' + String(i).padStart(10, '0'))), a).index, -1);
  const list = [a, b, c];
  assert.deepEqual(removeEntry(list, 'b').map((x) => x.id), ['a', 'c']);
  assert.deepEqual(moveEntry(list, 0, 2).map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(moveEntry(list, 2, 0).map((x) => x.id), ['c', 'a', 'b']);
  assert.equal(moveEntry(list, 0, -1), list); assert.equal(moveEntry(list, 2, 3), list); assert.equal(moveEntry(list, 1, 1), list);
  assert.equal(setTitle(list, 'a', 'Song')[0].title, 'Song');
  assert.equal(setTitle([{ ...a, title: 'Kept' }], 'a', 'Other')[0].title, 'Kept');
  assert.equal(rowLabel(c), 'youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
  assert.equal(rowLabel({ ...a, title: 'Song' }), 'Song');
});

test('plays down the list and wraps to the top; an empty list plays the built-in picks', () => {
  const list = [e('a', '7NOSDKb0HlU'), e('b', 'n61ULEU7CO0'), e('c', '5yx6BWlEVcY')];
  assert.equal(queueOf([]), DEFAULT_MUSIC);
  assert.equal(queueOf(list), list);
  assert.equal(nextIndex(list, 'a', 0), 1);
  assert.equal(nextIndex(list, 'c', 2), 0);
  assert.equal(nextIndex([list[0]], 'a', 0), 0);
  // The playing row was removed: the row that took its place plays next (wrapping when it was last).
  assert.equal(nextIndex(removeEntry(list, 'b'), 'b', 1), 1);
  assert.equal(nextIndex(removeEntry(list, 'c'), 'c', 2), 0);
  // A built-in pick was playing when the first link was added.
  assert.equal(nextIndex([list[0]], DEFAULT_MUSIC[3].id, 3), 0);
  assert.equal(nextIndex([], 'a', 0), -1);
});

test('tools actions: the playlist is read and saved through the account, only YouTube links; titles come from oEmbed', async () => {
  let saved = null;
  const client = { playlist: async () => [e('a', '7NOSDKb0HlU'), { id: 'bad', url: 'https://evil.example/x' }], savePlaylist: async (list) => { saved = list; } };
  assert.deepEqual((await tools.run(client, 'playlist')).playlist.map((x) => x.id), ['a']);
  assert.deepEqual(await tools.run(client, 'savePlaylist', { list: [e('a', '7NOSDKb0HlU'), { id: 'x', url: 'javascript:alert(1)' }] }), { ok: true });
  assert.deepEqual(saved.map((x) => x.id), ['a']);
  assert.equal((await tools.run(client, 'savePlaylist', { list: 'nope' })).ok, false);
  assert.equal((await tools.run(client, 'savePlaylist', { list: Array(201).fill(e('a', '7NOSDKb0HlU')) })).ok, false);
  assert.equal((await tools.run(null, 'playlist')).ok, false);
  let asked = null;
  const fetch = async (url) => { asked = url; return { ok: true, json: async () => ({ title: 'lofi radio' }) }; };
  assert.deepEqual(await tools.musicTitle({ url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU' }, fetch), { title: 'lofi radio' });
  assert.equal(asked, 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=7NOSDKb0HlU'));
  await assert.rejects(tools.musicTitle({ url: 'https://evil.example/' }, fetch));
  assert.deepEqual(await tools.musicTitle({ url: 'https://www.youtube.com/watch?v=7NOSDKb0HlU' }, async () => ({ ok: false })), { title: '' });
});
