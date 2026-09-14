import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, AppState } from 'react-native';
import { mergeResponse } from './sync-merge.js';
import { migrateTeams } from './migrate-teams.js';

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

  const api = useMemo(
    () => ({
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
            date: p.date || null,
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
      updateTodo: (todoId, patch) =>
        update((d) => {
          const t = d.todos.find((x) => x.id === todoId);
          if (t) {
            const allowed = ['title', 'notes', 'date', 'endDate', 'startTime', 'endTime', 'timeZone', 'projectId', 'teamId', 'status', 'important', 'sortOrder'];
            Object.assign(t, Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))));
            t.kind = 'todo';
            t.updatedAt = Math.max(Date.now(), (t.updatedAt || 0) + 1);
            if ('status' in patch) t.completedAt = patch.status === 'done' ? Date.now() : null;
          }
          return d;
        }),
      deleteTodo: (todoId) =>
        update((d) => {
          d.todos = d.todos.filter((t) => t.id !== todoId);
          d.tombstones.push({ coll: 'todos', id: todoId, deletedAt: Date.now() });
          return d;
        }),
      restoreTodo: todo => update(d => {
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
      integrations: async payload => {
        const s = dbRef.current?.settings.sync || {}, base = (s.url || '').trim().replace(/\/+$/, '');
          if (!base || !s.token) return { ok: false, error: '내 서버에 먼저 로그인해 주세요.' };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);
        try {
          const res = await fetch(base + (payload ? '/integrations/action' : '/integrations/state'), { method: payload ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: controller.signal });
          const data = await res.json();
          if (data.url) {
            if (!/^https:\/\/(accounts\.google\.com|api\.notion\.com)\//.test(data.url)) throw new Error('잘못된 인증 주소입니다.');
            await Linking.openURL(data.url);
          }
          return data;
        } catch (e) { return { ok: false, error: e.message }; } finally { clearTimeout(timer); }
      },
    }),
    []
  );
  syncCallback.current = api.syncNow;

  // 서버가 설정돼 있으면 앱 시작 시 한 번 조용히 동기화
  useEffect(() => {
    if (!db || autoSynced.current) return;
    const s = db.settings.sync || {};
    if (s.url && s.token) {
      autoSynced.current = true;
      api.syncNow();
    }
  }, [db]);

  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active' && dbRef.current?.settings.sync?.url) api.syncNow(); }, 3000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') api.syncNow();
      else if (dbRef.current) { clearTimeout(timerRef.current); saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(KEY, JSON.stringify(dbRef.current))).catch(() => {}); }
    });
    return () => { clearInterval(timer); listener.remove(); clearTimeout(pushTimer.current); };
  }, [api]);

  if (!db) return null;
  return <DbContext.Provider value={{ db, api }}>{children}</DbContext.Provider>;
}

export const useDb = () => useContext(DbContext);
