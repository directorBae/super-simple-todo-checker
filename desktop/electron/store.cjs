const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { randomUUID } = require('crypto');
const { migrateTeams } = require('./migrate-teams.cjs');

/*
 * TODO(roadmap): 데이터 계층 로드맵
 *
 * 1. 프로젝트 중심 할 일 채우기
 *    - 프로젝트를 먼저 만들고 그 안에서 할 일을 단계별로 쪼개 채워넣는 뷰/플로우.
 *    - todos.projectId는 이미 있으므로 UI + "프로젝트 템플릿(마일스톤→할 일 자동 생성)"만 추가하면 됨.
 *
 * 2. 동기화 서버 (모바일 ↔ 데스크톱 같은 할 일 공유) — 구현됨 (../../server, sync.cjs)
 *    - teams/projects/todos에 updatedAt, 삭제는 tombstones([{coll,id,deletedAt}])로 기록.
 *    - POST {url}/sync로 전체 상태를 보내면 서버가 LWW(updatedAt) + tombstone 우선으로 병합해
 *      돌려주고, 클라이언트는 응답으로 통째로 교체. settings는 기기별이라 동기화하지 않음.
 *
 * 3. 문서/서류 업로드 → LLM 자동 분석 → 할 일 리스트화
 *    - 계획 스키마:
 *      sources: [{ id, type: 'document'|'image'|'chat', name, filePath|url, uploadedAt,
 *                  analyzedAt, model, summary }]
 *      todos에 sourceId(어느 문서에서 나왔는지), extracted: true 필드 추가.
 *    - LLM이 만든 항목은 "제안" 상태(status: 'suggested')로 넣고 사용자가 승인하면 'todo'로 전환하는
 *      흐름이 안전함. status enum 확장 시 기존 필터('todo'|'done'|'bucket' 비교)들을 함께 손볼 것.
 */
const DEFAULTS = {
  teams: [],       // { id, name, color, createdAt, updatedAt }
  projects: [],    // { id, name, teamId, term: 'short'|'long', status: 'active'|'bucket'|'done', notes, createdAt, updatedAt }
  todos: [],       // { id, kind: 'todo', title, notes, date, startTime, endTime, projectId, teamId, channel, status: 'todo'|'done'|'bucket', createdAt, updatedAt, completedAt }
  tombstones: [],  // { coll: 'teams'|'projects'|'todos', id, deletedAt } — 동기화 병합 시 삭제 전파용
  notifLog: [],    // { key, todoId, type: 'start'|'end'|'daily', due, firedAt, missed, ackAt }
  gcalEvents: [],  // { id, title, start, end, allDay }
  settings: {
    theme: 'light',
    notifyStart: true,
    notifyEnd: true,
    dailySummary: true,
    dailySummaryTime: '09:00',
    dailyWrapup: true,
    dailyWrapupTime: '21:00',
    autoLaunch: false,
    sync: { url: '', token: '', lastSync: null },
  },
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'db.json');
    this.db = migrateTeams(this.load());
    this._timer = null;
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      d.todos = (d.todos || []).map(t => ({ ...t, kind: 'todo', origin: t.origin || { type: 'legacy' } }));
      d.gcalEvents = [];
      if (d.settings) delete d.settings.gcal;
      return {
        ...structuredClone(DEFAULTS),
        ...d,
        settings: {
          ...structuredClone(DEFAULTS.settings),
          ...(d.settings || {}),
          sync: { ...structuredClone(DEFAULTS.settings.sync), ...(d.settings && d.settings.sync ? d.settings.sync : {}) },
        },
      };
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.db, null, 1));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('store flush failed:', e);
    }
  }

  id() {
    return randomUUID();
  }
}

module.exports = Store;
