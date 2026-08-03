const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { randomUUID } = require('crypto');

/*
 * TODO(roadmap): 데이터 계층 로드맵
 *
 * 1. 프로젝트 중심 할 일 채우기
 *    - 프로젝트를 먼저 만들고 그 안에서 할 일을 단계별로 쪼개 채워넣는 뷰/플로우.
 *    - todos.projectId는 이미 있으므로 UI + "프로젝트 템플릿(마일스톤→할 일 자동 생성)"만 추가하면 됨.
 *
 * 2. 동기화 서버 (모바일 ↔ 데스크톱 같은 할 일 공유)
 *    - 지금은 JSON 파일(db.json) / 모바일 AsyncStorage로 각자 저장. 스키마는 동일하게 맞춰둠.
 *    - 계획: 경량 서버(REST 또는 SQLite+sync) 두고 이 Store를 "로컬 캐시 + 원격 push/pull"로 확장.
 *    - 준비: 모든 엔티티에 id(uuid)·createdAt이 이미 있음. 추가로 updatedAt·deletedAt(soft delete)을
 *      붙이면 last-write-wins 병합이 가능. 서버 붙이기 전까지는 필드만 추가해도 무해함.
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
  teams: [],       // { id, name, color, createdAt }
  projects: [],    // { id, name, teamId, term: 'short'|'long', status: 'active'|'bucket'|'done', notes, createdAt }
  todos: [],       // { id, kind: 'todo'|'content', title, notes, date, startTime, endTime, projectId, teamId, channel, status: 'todo'|'done'|'bucket', createdAt, completedAt }
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
    gcal: { clientId: '', clientSecret: '', tokens: null, lastSync: null },
  },
};

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'db.json');
    this.db = this.load();
    this._timer = null;
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        ...structuredClone(DEFAULTS),
        ...d,
        settings: {
          ...structuredClone(DEFAULTS.settings),
          ...(d.settings || {}),
          gcal: { ...structuredClone(DEFAULTS.settings.gcal), ...(d.settings && d.settings.gcal ? d.settings.gcal : {}) },
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
