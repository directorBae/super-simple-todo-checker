/* 팀버전 (Work) in the desktop app's main process: looks at the team state every 10 s — also while the window sits
 * hidden in the tray (a hidden window's timers get slowed down, which would make an incoming dive late) — hands it to
 * the window and shows system notifications for new dives (picked: stays on screen until dealt with), answers to
 * the person's own dives and team invites. Clicking one opens the dive (or the Team tab). */
const { Notification } = require('electron');
const fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const tools = require('./tools.cjs');

const EVERY_MS = 10_000;
// Packaged builds carry the shared files under app/shared; in the repo they sit two levels up.
const sharedFile = (name) => [path.join(__dirname, '../shared', name), path.join(__dirname, '../../shared', name)].find((p) => fs.existsSync(p));

function start({ client, pet = () => null, send, openView, icon, ring = () => {} }) {
  let seen = new Set(), first = true, who = null, alerts = null, busy = null, last = null;
  const notify = (a) => {
    if (!Notification.isSupported()) { if (a.important && a.dive) ring(a); return; }
    const n = new Notification({ title: a.title, body: a.body, icon, silent: false, ...(a.important ? { timeoutType: 'never', urgency: 'critical' } : {}) });
    // A dive that picked you is a call: clicking it answers (joins), and the window comes up ringing.
    n.on('click', () => openView(a.dive ? (a.important ? 'join:' : 'dive:') + a.dive : 'team'));
    n.show();
    if (a.important && a.dive) ring(a);
  };
  async function look() {
    const c = client();
    if (!c) return null;
    // Without the alert rules (a broken install) the Team tab still works, only without notifications.
    alerts ||= await import(pathToFileURL(sharedFile('work-alerts.mjs') || '').href).catch(() => ({ workAlerts: () => [] }));
    // The heartbeat carries the person's pet, so teammates looking at their board see it.
    const r = await tools.run(c, 'work', { path: '/state', body: { pet: pet() } });
    if (!r.ok || !r.me) return r;
    // Someone else signed in: start over (nothing of the last person's is news to this one).
    if (r.me?.id !== who) { who = r.me?.id; seen = new Set(); first = true; }
    for (const a of alerts.workAlerts(r, seen, { first })) notify(a);
    first = false; last = r;
    send(r);
    return r;
  }
  // One look at a time. Asking while one runs (it may have started before a change was saved) gets a fresh look
  // right after it, not the one already under way.
  let again = null;
  const refresh = () => {
    if (!busy) return (busy = look().catch((e) => ({ ok: false, error: e.message })).finally(() => { busy = null; }));
    return (again ||= busy.then(() => { again = null; return refresh(); }));
  };
  refresh();
  setInterval(refresh, EVERY_MS);
  return { refresh, last: () => last };
}

module.exports = { start };
