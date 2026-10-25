// Every to-do except bucket items has a date. Undated ones (old data, imports) get the day they were made.
const localDate = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function ensureDates(db, now = Date.now()) {
  let changed = false;
  for (const t of db.todos || []) if (t.status !== 'bucket' && !t.date) { t.date = localDate(t.createdAt || now); t.updatedAt = Math.max(now, (t.updatedAt || 0) + 1); changed = true; }
  return changed;
}
module.exports = { ensureDates, localDate };
