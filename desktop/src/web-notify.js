import { reminders } from '../../shared/reminders.js';

// Reminders for the web version (desktop and phone browsers), while the page is open.
// Browsers only allow notifications on https:// or localhost pages, after the person allows them.
const FIRED = 'checker:fired-reminders', LATE_MS = 2 * 60 * 1000, TICK_MS = 30 * 1000;

export const webNotifyState = () => {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return Notification.permission; // 'default' | 'granted' | 'denied'
};

export async function askWebNotify() {
  if (webNotifyState() !== 'default') return webNotifyState();
  try { return await Notification.requestPermission(); } catch { return webNotifyState(); }
}

const load = () => { try { return JSON.parse(localStorage.getItem(FIRED) || '[]'); } catch { return []; } };
const save = (keys) => { try { localStorage.setItem(FIRED, JSON.stringify(keys.slice(-500))); } catch {} };

async function show(r) {
  const options = { body: r.body, tag: r.key, icon: './icon.png' };
  const worker = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (worker) return worker.showNotification(r.title, options);
  new Notification(r.title, options);
}

// Checks every 30 s; anything that came due since the last check (or up to 2 minutes ago on open) is shown once.
export function startWebReminders(getDb) {
  if (webNotifyState() === 'unsupported' || webNotifyState() === 'insecure') return () => {};
  navigator.serviceWorker?.register('./sw.js').catch(() => {});
  let since = Date.now() - LATE_MS;
  const tick = async () => {
    const now = Date.now(), db = getDb();
    if (!db || Notification.permission !== 'granted') { since = now; return; }
    const fired = load(), due = reminders(db, Math.max(since, now - LATE_MS), now).filter((r) => !fired.includes(r.key));
    since = now;
    for (const r of due) { try { await show(r); fired.push(r.key); } catch {} }
    if (due.length) save(fired);
  };
  tick();
  const timer = setInterval(tick, TICK_MS);
  return () => clearInterval(timer);
}
