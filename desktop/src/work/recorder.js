// 녹음: the call's sound — the person's microphone and everyone else's voices — mixed with WebAudio and recorded in
// pieces (MediaRecorder, a piece every PIECE_MS) that go to the server as they come, so a long call is written
// down while it goes on and nothing big has to be sent at the end. New voices joining later are picked up too.
export const PIECE_MS = 45_000;

const MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const recordingSupported = () => typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';

// tracks(): the MediaStreamTracks to mix right now (asked again every few seconds). onPiece(blob, index) is called
// for each piece in order. Returns { stop() → Promise (after the last piece), since }.
export function startRecording({ tracks, onPiece }) {
  const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination(), wired = new Map();
  const wire = () => {
    for (const t of tracks() || []) {
      if (wired.has(t) || t.readyState === 'ended') continue;
      try { const src = ctx.createMediaStreamSource(new MediaStream([t])); src.connect(dest); wired.set(t, src); } catch { /* a track that cannot be mixed */ }
    }
    for (const [t, src] of wired) if (t.readyState === 'ended') { try { src.disconnect(); } catch { /* gone */ } wired.delete(t); }
  };
  wire();
  const poll = setInterval(wire, 3000);
  const mime = MIME.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(dest.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
  let index = 0, done = null;
  const finished = new Promise((resolve) => { done = resolve; });
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) onPiece(e.data, index++); };
  rec.onstop = () => { clearInterval(poll); for (const src of wired.values()) { try { src.disconnect(); } catch { /* gone */ } } ctx.close().catch(() => {}); done(); };
  rec.onerror = () => { try { rec.stop(); } catch { /* already */ } };
  rec.start(PIECE_MS);
  return {
    since: Date.now(), mime: rec.mimeType || mime,
    stop: () => { if (rec.state !== 'inactive') rec.stop(); else done(); return finished; },
  };
}

export const toBase64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
