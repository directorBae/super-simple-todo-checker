/*
 * 할 일 체커 동기화 서버 — 의존성 없는 Node 단일 파일 (Node 18+)
 *
 * 데스크톱/모바일이 전체 상태(teams/projects/todos/tombstones)를 POST /sync로 보내면
 * last-write-wins(updatedAt 기준) + tombstone(삭제 우선)으로 병합해 되돌려준다.
 * 클라이언트는 응답으로 로컬 상태를 통째로 교체한다. settings는 기기별이라 동기화하지 않음.
 *
 * 실행:   node index.js            (기본 포트 8787)
 * 환경:   PORT, SYNC_TOKEN         (토큰 미지정 시 자동 생성해 data/token.txt에 보관·출력)
 *         DATA_DIR                 저장 위치 (기본 ./data)
 *         TRUST_PROXY=1            리버스 프록시 뒤에서 X-Forwarded-For를 실제 IP로 신뢰
 *         BACKUP_KEEP              db.json 일 단위 백업 보관 개수 (기본 7, 0이면 끔)
 * 저장:   data/db.json  (+ data/db.YYYY-MM-DD.json 백업)
 * 배포:   Dockerfile / docker-compose.yml(Caddy HTTPS) / fly.toml — DEPLOY.md 참고
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TOKEN_FILE = path.join(DATA_DIR, 'token.txt');
const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000; // 90일 지난 tombstone은 정리
const BODY_LIMIT = 20 * 1024 * 1024;
const COLLS = ['teams', 'projects', 'todos'];
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 7);
const AUTH_FAIL_LIMIT = 20; // IP당 허용 인증 실패 횟수
const AUTH_FAIL_WINDOW = 10 * 60 * 1000; // 10분

fs.mkdirSync(DATA_DIR, { recursive: true });

let TOKEN = (process.env.SYNC_TOKEN || '').trim();
const TOKEN_FROM_ENV = !!TOKEN;
if (!TOKEN) {
  try {
    TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {}
  if (!TOKEN) {
    TOKEN = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(TOKEN_FILE, TOKEN + '\n');
  }
}

let db = { teams: [], projects: [], todos: [], tombstones: [] };
try {
  const loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  for (const k of [...COLLS, 'tombstones']) if (Array.isArray(loaded[k])) db[k] = loaded[k];
} catch {}

let lastBackup = 0;

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  backup();
  fs.renameSync(tmp, DB_FILE);
}

// db.json이 단일 파일이라 유실에 취약 — 덮어쓰기 직전 원본을 하루 한 번 날짜별로 복사해 둔다.
function backup() {
  const now = Date.now();
  if (BACKUP_KEEP <= 0 || now - lastBackup < 24 * 60 * 60 * 1000) return;
  try {
    if (!fs.existsSync(DB_FILE)) return;
    lastBackup = now;
    fs.copyFileSync(DB_FILE, path.join(DATA_DIR, `db.${new Date(now).toISOString().slice(0, 10)}.json`));
    const olds = fs
      .readdirSync(DATA_DIR)
      .filter((f) => /^db\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const f of olds.slice(0, Math.max(0, olds.length - BACKUP_KEEP))) fs.unlinkSync(path.join(DATA_DIR, f));
  } catch (e) {
    console.error('백업 실패:', e.message);
  }
}

// 레코드의 비교 시각 — updatedAt이 없던 옛 데이터는 createdAt으로 대신
const stamp = (r) => r.updatedAt || r.createdAt || 0;

/* 클라이언트 상태를 서버 상태에 병합 (LWW + tombstone) */
function merge(client) {
  // tombstone 합집합 (coll:id별 최신 deletedAt)
  const tombs = new Map();
  for (const t of [...db.tombstones, ...(Array.isArray(client.tombstones) ? client.tombstones : [])]) {
    if (!t || !t.id || !COLLS.includes(t.coll)) continue;
    const k = t.coll + ':' + t.id;
    const prev = tombs.get(k);
    if (!prev || (t.deletedAt || 0) > prev.deletedAt) tombs.set(k, { coll: t.coll, id: t.id, deletedAt: t.deletedAt || 0 });
  }

  for (const coll of COLLS) {
    const map = new Map(db[coll].map((r) => [r.id, r]));
    for (const r of Array.isArray(client[coll]) ? client[coll] : []) {
      if (!r || !r.id) continue;
      const cur = map.get(r.id);
      if (!cur || stamp(r) >= stamp(cur)) map.set(r.id, r);
    }
    const out = [];
    for (const r of map.values()) {
      const t = tombs.get(coll + ':' + r.id);
      if (t && t.deletedAt >= stamp(r)) continue; // 삭제가 더 최신 → 지운다
      if (t) tombs.delete(coll + ':' + r.id); // 삭제 이후에 수정됨 → 부활, tombstone 폐기
      out.push(r);
    }
    db[coll] = out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  const now = Date.now();
  db.tombstones = [...tombs.values()].filter((t) => now - t.deletedAt < TOMBSTONE_TTL);

  // 사라진 팀/프로젝트를 가리키는 참조 정리 (안 하면 클라이언트 그룹 렌더링에서 항목이 숨는다)
  const teamIds = new Set(db.teams.map((t) => t.id));
  const projIds = new Set(db.projects.map((p) => p.id));
  for (const p of db.projects) if (p.teamId && !teamIds.has(p.teamId)) p.teamId = null;
  for (const t of db.todos) {
    if (t.teamId && !teamIds.has(t.teamId)) t.teamId = null;
    if (t.projectId && !projIds.has(t.projectId)) t.projectId = null;
  }

  persist();
}

/* 토큰 비교는 상수 시간으로 — 공개 인터넷에 노출되면 타이밍으로 한 바이트씩 새어나갈 수 있다 */
function tokenOk(header) {
  const given = Buffer.from(String(header || ''), 'utf8');
  const want = Buffer.from('Bearer ' + TOKEN, 'utf8');
  if (given.length !== want.length) {
    crypto.timingSafeEqual(want, want); // 길이가 달라도 같은 비용을 치러 길이 추론을 막는다
    return false;
  }
  return crypto.timingSafeEqual(given, want);
}

/* 인증 실패를 IP·시간창 단위로 세어 토큰 무차별 대입을 막는다 */
const authFails = new Map();

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || '?';
}

function blocked(ip) {
  const e = authFails.get(ip);
  if (!e) return false;
  if (Date.now() - e.first > AUTH_FAIL_WINDOW) {
    authFails.delete(ip);
    return false;
  }
  return e.n >= AUTH_FAIL_LIMIT;
}

function noteFail(ip) {
  const e = authFails.get(ip);
  if (!e || Date.now() - e.first > AUTH_FAIL_WINDOW) authFails.set(ip, { n: 1, first: Date.now() });
  else e.n++;
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, name: 'todo-checker-sync' });
    return;
  }

  const ip = clientIp(req);
  if (blocked(ip)) {
    send(res, 429, { ok: false, error: 'too many attempts' });
    return;
  }
  if (!tokenOk(req.headers.authorization)) {
    noteFail(ip);
    log(`401 ${ip} ${req.method} ${url.pathname}`);
    send(res, 401, { ok: false, error: 'unauthorized' });
    return;
  }
  authFails.delete(ip);

  if (req.method === 'GET' && url.pathname === '/db') {
    send(res, 200, { ok: true, ...db });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/sync') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      merge(body);
      log(`sync ${ip} teams=${db.teams.length} projects=${db.projects.length} todos=${db.todos.length}`);
      send(res, 200, { ok: true, serverTime: Date.now(), ...db });
    } catch (e) {
      send(res, 400, { ok: false, error: e.message });
    }
    return;
  }
  send(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`할 일 체커 동기화 서버가 포트 ${PORT}에서 실행 중 (저장: ${DATA_DIR})`);
  if (TOKEN_FROM_ENV) {
    console.log('토큰: 환경변수 SYNC_TOKEN 사용 중 (로그에 출력하지 않음)');
  } else {
    console.log(`토큰: ${TOKEN}`);
    console.log('데스크톱/모바일 설정의 동기화 섹션에 "http://<이 컴퓨터 IP>:' + PORT + '"와 위 토큰을 입력하세요.');
  }
});

// 컨테이너/서비스 매니저가 보내는 종료 신호에 진행 중인 요청을 마치고 내려간다
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} 수신 — 종료합니다.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
