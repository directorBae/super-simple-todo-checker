import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 데스크톱 db.json과 같은 스키마 — 나중에 크로스 플랫폼 동기화를 위해 유지
const DEFAULTS = {
  teams: [],    // { id, name, color, important, createdAt }
  projects: [], // { id, name, teamId, term, status, notes, important, createdAt }
  todos: [],    // { id, kind, title, notes, date, startTime, endTime, projectId, teamId, channel, status, createdAt, completedAt }
  settings: {},
};

const KEY = 'todo-checker/db';

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// Hermes에는 structuredClone이 없음 — 데이터가 순수 JSON이라 이걸로 충분
const clone = (x) => JSON.parse(JSON.stringify(x));

const DbContext = createContext(null);

export function DbProvider({ children }) {
  const [db, setDb] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setDb(raw ? { ...clone(DEFAULTS), ...JSON.parse(raw) } : clone(DEFAULTS)))
      .catch(() => setDb(clone(DEFAULTS)));
  }, []);

  // 변경 300ms 후 저장 (데스크톱 Store.save와 동일한 디바운스)
  const update = (fn) => {
    setDb((cur) => {
      const next = fn(clone(cur));
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
            completedAt: null,
          });
          return d;
        }),
      updateTodo: (todoId, patch) =>
        update((d) => {
          const t = d.todos.find((x) => x.id === todoId);
          if (t) {
            Object.assign(t, patch);
            if ('status' in patch) t.completedAt = patch.status === 'done' ? Date.now() : null;
          }
          return d;
        }),
      deleteTodo: (todoId) =>
        update((d) => {
          d.todos = d.todos.filter((t) => t.id !== todoId);
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
          });
          return d;
        }),
      updateProject: (projId, patch) =>
        update((d) => {
          const p = d.projects.find((x) => x.id === projId);
          if (p) Object.assign(p, patch);
          return d;
        }),
      deleteProject: (projId) =>
        update((d) => {
          d.projects = d.projects.filter((p) => p.id !== projId);
          for (const t of d.todos) if (t.projectId === projId) t.projectId = null;
          return d;
        }),

      addTeam: (p) =>
        update((d) => {
          const name = String(p.name || '').trim();
          if (!name) return d;
          d.teams.push({ id: id(), name, color: p.color || '#6366f1', createdAt: Date.now() });
          return d;
        }),
      updateTeam: (teamId, patch) =>
        update((d) => {
          const t = d.teams.find((x) => x.id === teamId);
          if (t) Object.assign(t, patch);
          return d;
        }),
      deleteTeam: (teamId) =>
        update((d) => {
          d.teams = d.teams.filter((t) => t.id !== teamId);
          for (const p of d.projects) if (p.teamId === teamId) p.teamId = null;
          for (const t of d.todos) if (t.teamId === teamId) t.teamId = null;
          return d;
        }),
    }),
    []
  );

  if (!db) return null;
  return <DbContext.Provider value={{ db, api }}>{children}</DbContext.Provider>;
}

export const useDb = () => useContext(DbContext);
