const { Notification } = require('electron');
const path = require('path');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const FRESH_MS = 2 * 60 * 1000;          // 이 시간 이내로 늦은 알림은 개별 토스트
const DAILY_LATE_MS = 6 * 60 * 60 * 1000; // 데일리 요약이 이보다 늦으면 조용히 건너뜀
const TICK_MS = 30 * 1000;

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The three days before `today` (yesterday, 2 and 3 days ago) — older ones are left out of the morning note.
const OVERDUE_DAYS = 3;
function recentDays(today) {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: OVERDUE_DAYS }, (_, i) => localDateStr(new Date(y, m - 1, d - 1 - i)));
}

function dueMs(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

function collectDue(db, now) {
  const out = [];
  const fired = new Set(db.notifLog.map((n) => n.key));

  for (const t of db.todos) {
    if (t.status !== 'todo' || !t.date) continue;
    for (const type of ['start', 'end']) {
      if (type === 'start' && !db.settings.notifyStart) continue;
      if (type === 'end' && !db.settings.notifyEnd) continue;
      const time = type === 'start' ? t.startTime : t.endTime;
      if (!time) continue;
      const key = `${t.id}:${type}`;
      if (fired.has(key)) continue;
      const due = dueMs(t.date, time);
      if (due <= now) out.push({ key, todoId: t.id, type, due, title: t.title, time });
    }
  }

  const today = localDateStr(new Date(now));

  if (db.settings.dailySummary) {
    const key = `daily:${today}`;
    if (!fired.has(key)) {
      const due = dueMs(today, db.settings.dailySummaryTime || '09:00');
      if (due <= now) {
        const count = db.todos.filter((t) => t.status === 'todo' && t.date === today).length;
        const days = new Set(recentDays(today)), overdue = db.todos.filter((t) => t.status === 'todo' && days.has(t.date));
        out.push({ key, todoId: null, type: 'daily', due, count, overdue });
      }
    }
  }

  if (db.settings.dailyWrapup) {
    const key = `wrapup:${today}`;
    if (!fired.has(key)) {
      const due = dueMs(today, db.settings.dailyWrapupTime || '21:00');
      if (due <= now) {
        const doneList = db.todos.filter((t) => t.status === 'done' && t.date === today);
        const remainList = db.todos.filter((t) => t.status === 'todo' && t.date === today);
        out.push({ key, todoId: null, type: 'wrapup', due, doneList, remainList });
      }
    }
  }
  return out;
}

function listNames(list, max) {
  const names = list.slice(0, max).map((t) => t.title).join(', ');
  return names + (list.length > max ? ` 외 ${list.length - max}` : '');
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, icon: ICON });
  if (onClick) n.on('click', onClick);
  n.show();
}

function runTick(store, broadcast, openView) {
  const db = store.db;
  const now = Date.now();
  const due = collectDue(db, now);
  if (!due.length) return;

  const missed = [];
  for (const d of due) {
    const late = now - d.due;
    const entry = { key: d.key, todoId: d.todoId, type: d.type, due: d.due, firedAt: now, missed: false, ackAt: null };

    if (d.type === 'daily' || d.type === 'wrapup') {
      entry.ackAt = now; // 데일리 요약/마무리는 밀린 알림 목록에 쌓지 않음
      db.notifLog.push(entry);
      if (late > DAILY_LATE_MS) continue;
      // Morning: today's count, plus what was left undone in the last three days.
      if (d.type === 'daily' && (d.count > 0 || d.overdue.length > 0)) {
        const lines = [];
        if (d.count > 0) lines.push(`오늘 예정된 할 일이 ${d.count}건 있어요.`);
        if (d.overdue.length) lines.push(`지난 3일 동안 못 한 일 ${d.overdue.length}건: ${listNames(d.overdue, 3)}`);
        notify('오늘 할 일', lines.join('\n'), () => openView('today'));
      }
      if (d.type === 'wrapup') {
        const done = d.doneList.length;
        const remain = d.remainList.length;
        if (done === 0 && remain === 0) continue; // 오늘 아무 일정도 없으면 조용히 넘어감
        let body;
        if (remain === 0) {
          body = `오늘 할 일 ${done}건을 모두 완료했어요 🎉`;
        } else {
          body =
            `✅ 완료 ${done}건` +
            (done ? `: ${listNames(d.doneList, 2)}` : '') +
            `\n⏳ 남음 ${remain}건: ${listNames(d.remainList, 3)}`;
        }
        notify('하루 마무리', body, () => openView('today'));
      }
      continue;
    }

    if (late <= FRESH_MS) {
      db.notifLog.push(entry);
      const label = d.type === 'start' ? '▶ 시작할 시간' : '✔ 마무리할 시간';
      notify(label, `${d.title} (${d.time})`, () => openView('today'));
    } else {
      entry.missed = true;
      db.notifLog.push(entry);
      missed.push(d);
    }
  }

  if (missed.length) {
    const preview = missed.slice(0, 3).map((m) => m.title).join(', ');
    notify(`밀린 알림 ${missed.length}건`, preview + (missed.length > 3 ? ' 외' : ''), () => openView('missed'));
  }

  if (db.notifLog.length > 1000) db.notifLog = db.notifLog.slice(-600);
  store.save();
  broadcast();
}

function start(store, broadcast, openView) {
  const tick = () => {
    try {
      runTick(store, broadcast, openView);
    } catch (e) {
      console.error('scheduler tick failed:', e);
    }
  };
  tick(); // 시작 즉시 한 번 실행 → 꺼져 있는 동안 밀린 알림을 요약으로 표시
  setInterval(tick, TICK_MS);
}

module.exports = { start, collectDue, recentDays };
