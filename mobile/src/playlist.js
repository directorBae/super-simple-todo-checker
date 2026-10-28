// The music playlist: one list per person (saved to the account; without login, on this phone in settings.music).
// Pure helpers only, so they can be tested without React Native.
import { parseYouTube, DEFAULT_MUSIC } from '../../shared/youtube.js';

export const MAX_ENTRIES = 200;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// The one URL saved for an entry (the server only keeps https YouTube links).
export const urlOf = ({ videoId, listId }) =>
  videoId ? `https://www.youtube.com/watch?v=${videoId}${listId ? '&list=' + listId : ''}` : listId ? `https://www.youtube.com/playlist?list=${listId}` : null;

// A pasted link → a new entry (its title is the link until the real one arrives), or null when it is not YouTube.
export function entryOf(link, id = newId()) {
  const parsed = parseYouTube(link);
  if (!parsed) return null;
  const url = urlOf(parsed);
  return { id, url, videoId: parsed.videoId, listId: parsed.listId, title: url };
}

// Entries as stored: always ids + canonical URL (older phone entries had only the ids; others may have only the URL).
export function tidy(list) {
  return (Array.isArray(list) ? list : []).map((x) => {
    if (!x) return null;
    const ids = x.videoId || x.listId ? { videoId: x.videoId || null, listId: x.listId || null } : parseYouTube(x.url);
    if (!ids) return null;
    const url = urlOf(ids);
    return { id: String(x.id || newId()), url, videoId: ids.videoId || null, listId: ids.listId || null, title: String(x.title || '') || url };
  }).filter(Boolean).slice(0, MAX_ENTRIES);
}

// This phone's own list: what was saved in settings.music, minus the built-in picks the old version kept there.
const BUILT_IN = new Set(DEFAULT_MUSIC.map((x) => x.id));
export const localList = (music) => tidy((Array.isArray(music) ? music : []).filter((x) => x && !BUILT_IN.has(x.id)));

// What actually plays: my list, or the built-in music while it is empty.
export const queueOf = (list) => (list.length ? list : DEFAULT_MUSIC);

// Where to go when something ends: the entry after the one playing, wrapping to the top. If the playing entry was
// removed meanwhile, the one that moved into its place.
export function nextIndex(queue, playingId, lastIndex = -1) {
  const n = queue.length;
  if (!n) return -1;
  const at = queue.findIndex((x) => x.id === playingId);
  return at >= 0 ? (at + 1) % n : Math.max(0, lastIndex) % n;
}

export function moveItem(list, from, to) {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = list.slice(), [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// The slot a row dragged by dy lands in.
export const dropIndex = (from, dy, rowHeight, count) => Math.max(0, Math.min(count - 1, from + Math.round(dy / rowHeight)));

// Signing in for the first time: an empty account list takes this phone's own links, once.
export function seedFrom(remote, localMusic, alreadySeeded) {
  if (alreadySeeded || remote.length) return null;
  const local = localList(localMusic);
  return local.length ? local : null;
}

// Titles from YouTube's oEmbed (works for videos and playlists); null when it can't be read.
export async function fetchTitle(url, request = globalThis.fetch, ms = 6000) {
  let timer;
  try {
    const res = await Promise.race([
      request(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
    ]);
    if (!res.ok) return null;
    const title = (await res.json())?.title;
    return typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// Saves the latest list ms after the last change; saves run one at a time. A failed save waits for the next
// push/flush. busy() is true while a change is not yet on the server (a reload then must not overwrite it).
export function createSaver(save, ms = 500) {
  let timer = null, waiting = null, chain = Promise.resolve(), running = 0;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!waiting) return chain;
    const list = waiting;
    waiting = null; running++;
    chain = chain.then(() => save(list)).catch(() => { if (!waiting) waiting = list; }).finally(() => { running--; });
    return chain;
  };
  return {
    push(list) { waiting = list; if (timer) clearTimeout(timer); timer = setTimeout(flush, ms); },
    flush,
    busy: () => !!timer || !!waiting || running > 0,
  };
}
