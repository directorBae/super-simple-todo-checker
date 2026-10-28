import { parseYouTube, DEFAULT_MUSIC } from '../../../shared/youtube.js';

// 음악 재생목록 — one per person, saved to the account (or settings.music when signed out).
// Entries: { id, url, videoId, listId, title }. Plain functions so node tests can run them.
export const MAX_ENTRIES = 200;
const DEFAULT_IDS = new Set(DEFAULT_MUSIC.map((x) => x.id));

// The link we keep: canonical https://www.youtube.com/… (the account side accepts only YouTube https links).
export function youtubeUrl({ videoId, listId }) {
  if (videoId) return 'https://www.youtube.com/watch?v=' + videoId + (listId ? '&list=' + listId : '');
  return listId ? 'https://www.youtube.com/playlist?list=' + listId : null;
}
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// A pasted link → an entry (null when it isn't a YouTube video or playlist).
export function entryFromLink(text, id = newId()) {
  const parsed = parseYouTube(text);
  return parsed ? { id, url: youtubeUrl(parsed), videoId: parsed.videoId, listId: parsed.listId, title: '' } : null;
}
// Anything stored (older settings.music items had no url) → a clean entry, or null.
export function toEntry(x) {
  if (!x || typeof x !== 'object') return null;
  const parsed = x.videoId || x.listId ? { videoId: x.videoId || null, listId: x.listId || null } : parseYouTube(x.url);
  if (!parsed || (parsed.videoId && !/^[\w-]{11}$/.test(parsed.videoId)) || (parsed.listId && !/^[\w-]{10,64}$/.test(parsed.listId))) return null;
  return { id: String(x.id || newId()).slice(0, 64), url: youtubeUrl(parsed), videoId: parsed.videoId, listId: parsed.listId, title: typeof x.title === 'string' ? x.title.slice(0, 200) : '' };
}
export const cleanList = (list) => (Array.isArray(list) ? list : []).map(toEntry).filter(Boolean).slice(0, MAX_ENTRIES);
// This device's own links in settings.music (the built-in picks that used to be stored with them are left out).
export const localList = (music) => cleanList((Array.isArray(music) ? music : []).filter((x) => !DEFAULT_IDS.has(x?.id)));

const same = (a, b) => a.videoId === b.videoId && a.listId === b.listId;
// Adds at the end; a link already in the list isn't added twice. Answers the list and where the entry sits.
export function addEntry(list, entry) {
  const at = list.findIndex((x) => same(x, entry));
  if (at >= 0) return { list, index: at };
  if (list.length >= MAX_ENTRIES) return { list, index: -1 };
  return { list: [...list, entry], index: list.length };
}
export const removeEntry = (list, id) => list.filter((x) => x.id !== id);
export function moveEntry(list, from, to) {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list], [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export const setTitle = (list, id, title) => list.map((x) => (x.id === id && title && !x.title ? { ...x, title: String(title).slice(0, 200) } : x));

// What actually plays: the playlist, or the built-in picks when it is empty.
export const queueOf = (list) => (list.length ? list : DEFAULT_MUSIC);
// The row after the one playing, wrapping to the top. If the playing row was removed, the row that took its place.
export function nextIndex(queue, playingId, lastIndex = 0, delta = 1) {
  const n = queue.length;
  if (!n) return -1;
  const at = queue.findIndex((x) => x.id === playingId);
  if (at < 0) return ((Math.max(0, lastIndex) % n) + n) % n;
  return (((at + delta) % n) + n) % n;
}
// What a row shows: its title, or the link itself.
export const rowLabel = (x) => x.title || (x.url || '').replace(/^https:\/\/(www\.)?/, '');
// The oEmbed address that answers a link's title.
export const oembedUrl = (url) => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url);
