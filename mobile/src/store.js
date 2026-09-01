import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        dbRef.current = next;
        setDb(next);
      })
      .catch(() => {
        dbRef.current = clone(DEFAULTS);
        setDb(dbRef.current);
      });
  }, []);

  // 변경 300ms 후 저장 (데스크톱 Store.save와 동일한 디바운스)
  const update = (fn) => {
    setDb((cur) => {
      const next = fn(clone(cur));
      dbRef.current = next;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      }, 300);
      return next;
    });
  };

  const api = useMemo(
    () => ({
      addTodo: (p) =>
        update((d) => {
          const title = String(p.title || '').trim();
          if (!title) return d;
          d.todos.push({
            id: id(),
            kind: p.kind === 'content' ? 'content' : 'todo',
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
          });
          return d;
        }),
      updateTodo: (todoId, patch) =>
        update((d) => {
          const t = d.todos.find((x) => x.id === todoId);
          if (t) {
            Object.assign(t, patch);
            t.updatedAt = Date.now();
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
        const cur = dbRef.current;
        if (!cur) return { ok: false, error: '아직 로드되지 않았습니다.' };
        const s = cur.settings.sync || {};
        const url = (s.url || '').trim().replace(/\/+$/, '');
        if (!url || !s.token) return { ok: false, error: '서버 주소와 토큰을 입력하세요.' };
        try {
          const res = await fetch(url + '/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
            body: JSON.stringify({
              teams: cur.teams,
              projects: cur.projects,
              todos: cur.todos,
              tombstones: cur.tombstones || [],
            }),
          });
          if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
          const data = await res.json();
          if (!data.ok) return { ok: false, error: data.error || '서버 오류' };
          update((d) => {
            d.teams = data.teams || [];
            d.projects = data.projects || [];
            d.todos = data.todos || [];
            d.tombstones = data.tombstones || [];
            d.settings.sync = { ...d.settings.sync, lastSync: Date.now() };
            return d;
          });
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
    }),
    []
  );

  // 서버가 설정돼 있으면 앱 시작 시 한 번 조용히 동기화
  useEffect(() => {
    if (!db || autoSynced.current) return;
    const s = db.settings.sync || {};
    if (s.url && s.token) {
      autoSynced.current = true;
      api.syncNow();
    }
  }, [db]);

  if (!db) return null;
  return <DbContext.Provider value={{ db, api }}>{children}</DbContext.Provider>;
}

export const useDb = () => useContext(DbContext);
