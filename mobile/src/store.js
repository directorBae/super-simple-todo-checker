import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { mergeResponse } from './sync-merge.js';
import { migrateTeams } from './migrate-teams.js';
import supabaseEngine from '../../shared/supabase-sync.cjs';
import supabaseAuth from '../../shared/supabase-auth.cjs';
import toolsEngine from '../../shared/tools-client.cjs';
import { rescheduleReminders } from './notifications.js';
import { REMINDER_DEFAULTS } from '../../shared/reminders.js';

// Every to-do except bucket items has a date; undated ones get the day they were made.
const localDate = (ms = Date.now()) => { const t = new Date(ms); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
function ensureDates(d) { for (const t of d.todos || []) if (t.status !== 'bucket' && !t.date) { t.date = localDate(t.createdAt); t.updatedAt = Math.max(Date.now(), (t.updatedAt || 0) + 1); } return d; }

// Supabase는 화면에 두지 않는다: mobile/.env 의 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (빌드 때 포함)
const SUPABASE = { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY };
// With Supabase, every person signs in (email + password) and sees only their own rows. The session lives on this phone.
const LOGIN = supabaseEngine.configured(SUPABASE);
const SESSION_KEY = 'todo-checker/session';
const keeper = supabaseAuth.createSessionKeeper(SUPABASE, {
  load: () => AsyncStorage.getItem(SESSION_KEY).then((raw) => (raw ? JSON.parse(raw) : null)),
  save: (session) => (session ? AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)) : AsyncStorage.removeItem(SESSION_KEY)),
});

// Notion · Google Calendar connections of the signed-in person (Edge Function `integrations`, see src/tools.js).
export const tools = LOGIN ? toolsEngine.createToolsClient({ url: SUPABASE.url, key: SUPABASE.key, fetch: (...a) => fetch(...a), token: async () => (await keeper.current())?.accessToken }) : null;
// The morning alert time goes to the server too, so the Monday/Thursday check-up runs just before it.
let sentPrefs = '';
function sharePrefs(settings) {
  const s = { ...REMINDER_DEFAULTS, ...settings }, zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = JSON.stringify([s.dailySummary, s.dailySummaryTime, zone]);
  if (!tools || key === sentPrefs) return;
  sentPrefs = key;
  tools.savePrefs(s, zone).catch(() => { sentPrefs = ''; });
}

// To-dos changed on this phone, and when (id → ms): the day list plays what an import job changes, never these.
export const localTouches = new Map();
const touchLocal = (todoId) => localTouches.set(todoId, Date.now());

// 데스크톱 db.json과 같은 스키마 — server/를 통한 크로스 플랫폼 동기화(LWW + tombstone)에 사용
const DEFAULTS = {
  teams: [],      // { id, name, color, important, createdAt, updatedAt }
  projects: [],   // { id, name, teamId, term, status, notes, important, createdAt, updatedAt }
  todos: [],      // { id, kind, title, notes, date, startTime, endTime, projectId, teamId, channel, status, createdAt, updatedAt, completedAt }
  tombstones: [], // { coll: 'teams'|'projects'|'todos', id, deletedAt } — 동기화 병합 시 삭제 전파용
  settings: {
    sync: { url: '', token: '', lastSync: null },
  },
};

const KEY = 'todo-checker/db';

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Hermes에는 structuredClone이 없음 — 데이터가 순수 JSON이라 이걸로 충분
const clone = (x) => JSON.parse(JSON.stringify(x));

const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDb] = useState(null);
  const timerRef = useRef(null);
  const dbRef = useRef(null);
  const autoSynced = useRef(false);
  const syncing = useRef(false);
  const pushTimer = useRef(null);
  const syncCallback = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const supabaseRun = useRef(null);
  const authGen = useRef(0); // bumps on sign-in/out so a sync that started for the previous account drops its result
  // undefined while the saved session is being read (so the login screen doesn't flash), then { email } or null.
  const [account, setAccount] = useState(LOGIN ? undefined : null);
  useEffect(() => { if (LOGIN) keeper.account().then(setAccount, () => setAccount(null)); }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const loaded = raw ? JSON.parse(raw) : {};
        const base = clone(DEFAULTS);
        const next = {
          ...base,
          ...loaded,
          settings: {
            ...base.settings,
            ...(loaded.settings || {}),
            sync: { ...base.settings.sync, ...((loaded.settings || {}).sync || {}) },
          },
        };
        next.todos = next.todos.map(t => ({ ...t, kind: 'todo', origin: t.origin || { type: 'legacy' } }));
        migrateTeams(next);
        ensureDates(next);
        dbRef.current = next;
        setDb(next);
      })
      .catch(() => {
        dbRef.current = clone(DEFAULTS);
        setDb(dbRef.current);
      });
  }, []);

  // 변경 300ms 후 저장 (데스크톱 Store.save와 동일한 디바운스)
  const update = (fn, send = true) => {
      const next = fn(clone(dbRef.current));
      dbRef.current = next;
      setDb(next);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(KEY, JSON.stringify(next))).catch(() => {});
      }, 300);
      if (send) { clearTimeout(pushTimer.current); pushTimer.current = setTimeout(() => syncCallback.current?.(), 650); }
      return next;
  };

  // Nothing of the previous account stays on the phone.
  const wipe = () => update((d) => {
    Object.assign(d, { teams: [], projects: [], todos: [], tombstones: [] });
    delete d.supabaseMeta;
    return d;
  }, false);

  const api = useMemo(
    () => { const self = ({
      addTodo: (p) =>
        update((d) => {
          const title = String(p.title || '').trim();
          if (!title) return d;
          d.todos.push({
            id: p.id || id(),
            kind: 'todo',
            origin: { type: 'app' },
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
            title,
            notes: p.notes || '',
            date: p.date || (p.status === 'bucket' ? null : localDate()),
            startTime: p.startTime || null,
            endTime: p.endTime || null,
            projectId: p.projectId || null,
            teamId: p.teamId || null,
            channel: p.channel || null,
            status: p.status === 'bucket' ? 'bucket' : 'todo',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: null,
            sortOrder: p.sortOrder ?? Date.now(),
          });
          return d;
        }),
      updateTodo: (todoId, patch) => touchLocal(todoId) &&
        update((d) => {
          const t = d.todos.find((x) => x.id === todoId);
          if (t) {
            const allowed = ['title', 'notes', 'date', 'endDate', 'startTime', 'endTime', 'timeZone', 'projectId', 'teamId', 'status', 'important', 'sortOrder'];
            Object.assign(t, Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))));
            t.kind = 'todo';
            t.updatedAt = Math.max(Date.now(), (t.updatedAt || 0) + 1);
            ensureDates({ todos: [t] });
            if ('status' in patch) t.completedAt = patch.status === 'done' ? Date.now() : null;
          }
          return d;
        }),
      deleteTodo: (todoId) => touchLocal(todoId) &&
        update((d) => {
          d.todos = d.todos.filter((t) => t.id !== todoId);
          d.tombstones.push({ coll: 'todos', id: todoId, deletedAt: Date.now() });
          return d;
        }),
      restoreTodo: todo => touchLocal(todo.id) && update(d => {
        d.tombstones = d.tombstones.filter(t => !(t.coll === 'todos' && t.id === todo.id));
        if (!d.todos.some(t => t.id === todo.id)) d.todos.push({ ...todo, updatedAt: Math.max(Date.now(), (todo.updatedAt || 0) + 1) });
        return d;
      }),

      addProject: (p) =>
        update((d) => {
          const name = String(p.name || '').trim();
          if (!name) return d;
          d.projects.push({
            id: id(),
            name,
            teamId: p.teamId || null,
            term: p.term === 'long' ? 'long' : 'short',
            status: p.status === 'bucket' ? 'bucket' : 'active',
            notes: p.notes || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          return d;
        }),
      updateProject: (projId, patch) =>
        update((d) => {
          const p = d.projects.find((x) => x.id === projId);
          if (p) {
            Object.assign(p, patch);
            p.updatedAt = Date.now();
          }
          return d;
        }),
      deleteProject: (projId) =>
        update((d) => {
          d.projects = d.projects.filter((p) => p.id !== projId);
          d.tombstones.push({ coll: 'projects', id: projId, deletedAt: Date.now() });
          for (const t of d.todos) {
            if (t.projectId === projId) {
              t.projectId = null;
              t.updatedAt = Date.now();
            }
          }
          return d;
        }),

      addTeam: (p) =>
        update((d) => {
          const name = String(p.name || '').trim();
          if (!name) return d;
          d.teams.push({ id: id(), name, color: p.color || '#6366f1', createdAt: Date.now(), updatedAt: Date.now() });
          return d;
        }),
      updateTeam: (teamId, patch) =>
        update((d) => {
          const t = d.teams.find((x) => x.id === teamId);
          if (t) {
            Object.assign(t, patch);
            t.updatedAt = Date.now();
          }
          return d;
        }),
      deleteTeam: (teamId) =>
        update((d) => {
          d.teams = d.teams.filter((t) => t.id !== teamId);
          d.tombstones.push({ coll: 'teams', id: teamId, deletedAt: Date.now() });
          for (const p of d.projects) {
            if (p.teamId === teamId) {
              p.teamId = null;
              p.updatedAt = Date.now();
            }
          }
          for (const t of d.todos) {
            if (t.teamId === teamId) {
              t.teamId = null;
              t.updatedAt = Date.now();
            }
          }
          return d;
        }),

      updateSettings: (patch) =>
        update((d) => {
          const { sync, ...rest } = patch;
          if (sync) Object.assign(d.settings.sync, sync);
          Object.assign(d.settings, rest);
          return d;
        }),

      // Supabase: 가져와서 최신 상태에 합친 뒤(그 사이 고친 내용 보존) 바뀐 것만 올린다.
      // 처음 연결할 때는 기기에 남은 옛 데이터를 버리고 DB 내용만 받는다(올리지 않음).
      supabaseNow: () => {
        if (!LOGIN || !dbRef.current) return Promise.resolve({ ok: false, skipped: true });
        if (supabaseRun.current) return supabaseRun.current;
        const gen = authGen.current;
        supabaseRun.current = (async () => {
          const session = await keeper.current();
          if (!session) { if (gen === authGen.current) setAccount(null); return { ok: false, skipped: true }; } // signed out (e.g. the login expired): back to the login screen
          const cfg = { ...SUPABASE, token: session.accessToken, userId: session.user.id };
          const meta = supabaseEngine.freshMeta(dbRef.current.supabaseMeta, session.user.id);
          const current = () => gen === authGen.current;
          try {
            const { remote, newest } = await supabaseEngine.pullRemote(cfg, meta);
            if (!current()) return { ok: false, skipped: true };
            const first = supabaseEngine.firstSync(meta);
            if (remote.length || first) update((d) => { if (first) supabaseEngine.adoptRemote(d); if (supabaseEngine.applyRemote(d, remote, meta) || first) { migrateTeams(d); ensureDates(d); } return d; }, false);
            await supabaseEngine.pushRemote(cfg, supabaseEngine.collectPush(dbRef.current, meta), meta);
            meta.pulledAt = newest || supabaseEngine.EPOCH;
            sharePrefs(dbRef.current?.settings);
            return { ok: true };
          } catch (e) {
            return { ok: false, error: e.message };
          } finally {
            if (current()) update((d) => { d.supabaseMeta = meta; return d; }, false);
          }
        })().finally(() => { supabaseRun.current = null; });
        return supabaseRun.current;
      },

      // 로그인. 다른 계정이 이 휴대폰에 쓰던 데이터는 바로 지우고 그 계정의 데이터를 받는다.
      signIn: async (email, password) => {
        const session = await keeper.signIn(email, password);
        self.enter(session);
      },
      signUp: async (email, password) => {
        const r = await keeper.signUp(email, password);
        if (r.session) self.enter(r.session);
        return r;
      },
      enter: (session) => {
        authGen.current += 1;
        if (dbRef.current?.supabaseMeta?.userId !== session.user.id) wipe();
        setAccount({ id: session.user.id, email: session.user.email });
        Promise.resolve(supabaseRun.current).catch(() => {}).then(() => self.supabaseNow()); // after any round left over from before
      },
      // 로그아웃: 남은 변경을 올려 두고, 이 휴대폰의 데이터와 예약된 알림을 지운다.
      signOut: async () => {
        await self.supabaseNow().catch(() => {});
        await self.supabaseNow().catch(() => {}); // the first may have been one already running
        authGen.current += 1;
        await keeper.signOut();
        const empty = wipe();
        setAccount(null);
        rescheduleReminders(empty).catch(() => {});
      },
      recover: (email) => keeper.recover(email),

      // server/index.js와 짝 — 전체 상태를 보내고 병합 결과로 교체
      syncNow: async () => {
        if (syncing.current) return { ok: false, error: '동기화 중입니다. 잠시 후 다시 시도하세요.' };
        const cur = dbRef.current;
        if (!cur) return { ok: false, error: '아직 로드되지 않았습니다.' };
        const s = cur.settings.sync || {};
        const url = (s.url || '').trim().replace(/\/+$/, '');
        if (!url || !s.token) return { ok: false, error: '서버 주소와 토큰을 입력하세요.' };
        syncing.current = true;
        const syncController = new AbortController();
        const syncTimeout = setTimeout(() => syncController.abort(), 30000);
        try {
          const sent = clone({ teams: cur.teams, projects: cur.projects, todos: cur.todos, tombstones: cur.tombstones || [] });
          const res = await fetch(url + '/sync', {
            signal: syncController.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
            body: JSON.stringify(sent),
          });
          if (!res.ok) throw new Error(res.status === 401 ? 'PC와 다시 연결해 주세요.' : '서버 응답 오류 (' + res.status + ')');
          const data = await res.json();
          if (!data.ok) return { ok: false, error: data.error || '서버 오류' };
          update((d) => {
            mergeResponse(d, sent, data);
            migrateTeams(d);
            ensureDates(d);
            d.settings.sync = { ...d.settings.sync, lastSync: Date.now(), error: null };
            return d;
          }, false);
          return { ok: true };
        } catch (e) {
          const error = /fetch|network|abort/i.test(e.message) ? 'PC 서버와 같은 Wi-Fi에 연결하고, iPhone 설정에서 로컬 네트워크를 허용해 주세요.' : e.message;
          update(d => { d.settings.sync.error = error; return d; }, false);
          return { ok: false, error };
        } finally { clearTimeout(syncTimeout); syncing.current = false; }
      },
      loginServer: async (address, password) => {
        const url = address.trim().replace(/\/+$/, '');
        if (!/^https?:\/\/[^/]+$/.test(url) || /https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(url)) return { ok: false, error: '휴대폰에서 접속할 수 있는 서버 주소를 입력해 주세요.' };
        try {
          const response = await fetch(url + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(15000) });
          if (response.status === 404) return { ok: false, error: '서버에 모바일 직접 로그인 업데이트가 필요합니다.' };
          const result = await response.json();
          if (!result.ok || typeof result.token !== 'string' || !result.token) return { ok: false, error: result.error || '로그인할 수 없습니다.' };
          update(d => { d.settings.sync = { url, token: result.token, lastSync: null }; return d; }, false);
          return { ok: true };
        } catch { return { ok: false, error: '서버에 접속할 수 없습니다. 로컬 서버라면 같은 Wi-Fi와 iPhone의 로컬 네트워크 권한을 확인해 주세요.' }; }
      },
      pairServer: async (address, code) => {
        const url = address.trim().replace(/\/+$/, '');
        if (!/^https?:\/\/[^/]+$/.test(url) || /https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(url)) return { ok: false, error: 'PC에 표시된 Wi-Fi 주소를 입력해 주세요.' };
        try {
          const response = await fetch(url + '/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }), signal: AbortSignal.timeout(10000) });
          const result = await response.json();
          if (!result.ok) return result;
          update(d => { d.settings.sync = { url, token: result.token, lastSync: null }; return d; });
          return { ok: true };
        } catch { return { ok: false, error: 'PC 서버와 같은 Wi-Fi인지 확인해 주세요. iPhone은 설정에서 로컬 네트워크 접근을 허용해야 합니다.' }; }
      },
    }); return self; },
    []
  );
  syncCallback.current = () => { if (dbRef.current?.settings.sync?.url) api.syncNow(); api.supabaseNow(); };

  // 서버가 설정돼 있으면 앱 시작 시 한 번 조용히 동기화
  useEffect(() => {
    if (!db || autoSynced.current) return;
    const s = db.settings.sync || {};
    autoSynced.current = true;
    if (s.url && s.token) api.syncNow();
    api.supabaseNow();
  }, [db]);

  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active' && dbRef.current?.settings.sync?.url) api.syncNow(); }, 3000);
    const supabaseTimer = setInterval(() => { if (AppState.currentState === 'active') api.supabaseNow(); }, 5000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { api.syncNow(); api.supabaseNow(); }
      else if (dbRef.current) { clearTimeout(timerRef.current); saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(KEY, JSON.stringify(dbRef.current))).catch(() => {}); }
    });
    return () => { clearInterval(timer); clearInterval(supabaseTimer); listener.remove(); clearTimeout(pushTimer.current); };
  }, [api]);

  if (!db) return null;
  return <DbContext.Provider value={{ db, api, account, loginRequired: LOGIN }}>{children}</DbContext.Provider>;
}

export const useDb = () => useContext(DbContext);
