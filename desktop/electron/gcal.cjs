const http = require('http');
const { shell } = require('electron');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function waitForCode(clientId) {
  return new Promise((resolve, reject) => {
    let redirectUri = '';
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<meta charset="utf-8"><h3>구글 캘린더 연결이 처리되었습니다. 이 창을 닫고 앱으로 돌아가세요.</h3>');
      clearTimeout(timer);
      server.close();
      if (code) resolve({ code, redirectUri });
      else reject(new Error(error || '인증이 취소되었습니다.'));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('인증 대기 시간이 초과되었습니다. 다시 시도하세요.'));
    }, 3 * 60 * 1000);
    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
      const u = new URL(AUTH_URL);
      u.searchParams.set('client_id', clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', SCOPE);
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      shell.openExternal(u.toString());
    });
  });
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || '토큰 요청 실패');
  return data;
}

async function connect(store) {
  const g = store.db.settings.gcal;
  if (!g.clientId || !g.clientSecret) throw new Error('클라이언트 ID와 Secret을 먼저 저장하세요.');
  const { code, redirectUri } = await waitForCode(g.clientId);
  const data = await tokenRequest({
    code,
    client_id: g.clientId,
    client_secret: g.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  g.tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiry: Date.now() + (data.expires_in || 3600) * 1000,
  };
  store.save();
}

async function ensureAccessToken(store) {
  const g = store.db.settings.gcal;
  if (!g.tokens) throw new Error('구글 캘린더가 연결되어 있지 않습니다.');
  if (g.tokens.expiry - 60000 > Date.now()) return g.tokens.accessToken;
  if (!g.tokens.refreshToken) {
    g.tokens = null;
    store.save();
    throw new Error('토큰이 만료되었습니다. 다시 연결하세요.');
  }
  try {
    const data = await tokenRequest({
      client_id: g.clientId,
      client_secret: g.clientSecret,
      refresh_token: g.tokens.refreshToken,
      grant_type: 'refresh_token',
    });
    g.tokens.accessToken = data.access_token;
    g.tokens.expiry = Date.now() + (data.expires_in || 3600) * 1000;
    store.save();
    return g.tokens.accessToken;
  } catch (e) {
    g.tokens = null;
    store.save();
    throw new Error('토큰 갱신에 실패했습니다. 다시 연결하세요.');
  }
}

async function sync(store) {
  const token = await ensureAccessToken(store);
  const u = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  u.searchParams.set('timeMin', new Date(Date.now() - 7 * 864e5).toISOString());
  u.searchParams.set('timeMax', new Date(Date.now() + 60 * 864e5).toISOString());
  u.searchParams.set('singleEvents', 'true');
  u.searchParams.set('orderBy', 'startTime');
  u.searchParams.set('maxResults', '250');
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || '이벤트 조회에 실패했습니다.');
  store.db.gcalEvents = (data.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary || '(제목 없음)',
      start: (e.start && (e.start.dateTime || e.start.date)) || null,
      end: (e.end && (e.end.dateTime || e.end.date)) || null,
      allDay: !(e.start && e.start.dateTime),
    }));
  store.db.settings.gcal.lastSync = Date.now();
  store.save();
}

module.exports = { connect, sync };
