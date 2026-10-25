// Accepts youtu.be, watch, shorts, embed, live, music.youtube.com and playlist links.
// Plain regexes rather than URL: React Native's URL support is partial.
export function parseYouTube(input) {
  const match = /^https?:\/\/(?:(?:www|m|music)\.)?(youtu\.be|youtube\.com|youtube-nocookie\.com)(\/[^?#]*)?(\?[^#]*)?/i.exec(String(input || '').trim());
  if (!match) return null;
  const [, host, path = '/', query = ''] = match;
  const param = (name) => (new RegExp('[?&]' + name + '=([^&#]*)').exec(query) || [])[1] || null;
  const id = (value) => (/^[\w-]{11}$/.test(value || '') ? value : null);
  const listId = /^[\w-]{10,}$/.test(param('list') || '') ? param('list') : null;
  const [kind, value] = path.split('/').filter(Boolean);
  const videoId = host.toLowerCase() === 'youtu.be' ? id(kind) : kind === 'watch' ? id(param('v')) : ['shorts', 'embed', 'live', 'v'].includes(kind) ? id(value) : null;
  return videoId || listId ? { videoId, listId } : null;
}

// Ready-made focus music so the list is never empty on first use (each one checked to actually play in an embedded player).
// Used until the person edits the list; an emptied list stays empty.
export const DEFAULT_MUSIC = [
  { id: 'lofi-study', videoId: '7NOSDKb0HlU', listId: null, title: 'lofi hip hop radio · beats to study/relax to (Chillhop)' },
  { id: 'lofi-2021', videoId: 'n61ULEU7CO0', listId: null, title: 'Best of lofi hip hop 2021 (Lofi Girl)' },
  { id: 'chillhop', videoId: '5yx6BWlEVcY', listId: null, title: 'Chillhop Radio · jazzy & lofi hip hop beats' },
  { id: 'jazz-piano', videoId: 'Dx5qFachd3A', listId: null, title: 'Relaxing Jazz Piano Radio' },
  { id: 'synthwave', videoId: '4xDzrJKXOOY', listId: null, title: 'synthwave radio · beats to chill/game to (Lofi Girl)' },
  { id: 'study-1am', videoId: 'lTRiuFIWV54', listId: null, title: '1 A.M Study Session (Lofi Girl)' },
  { id: 'rain', videoId: 'mPZkdNFkNps', listId: null, title: '창가에 내리는 빗소리 · 천둥' },
  { id: 'dark-ambient', videoId: 'S_MOd40zlYU', listId: null, title: 'dark ambient radio (Lofi Girl)' },
];
