import React, { useEffect, useState } from 'react';
import { Section, TimeField } from '../components.jsx';
import { fmtDateTime } from '../util.js';
import { THEMES } from '../themes.js';
import Teams from './Teams.jsx';

export default function Settings({ db }) {
  const s = db.settings;
  const syncCfg = s.sync || { url: '', token: '', lastSync: null };
  const [clientId, setClientId] = useState(s.gcal.clientId);
  const [clientSecret, setClientSecret] = useState(s.gcal.clientSecret);
  const [syncUrl, setSyncUrl] = useState(syncCfg.url);
  const [syncToken, setSyncToken] = useState(syncCfg.token);
  const [syncMsg, setSyncMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    window.api.getInfo().then(setInfo);
  }, []);

  const upd = (patch) => window.api.updateSettings(patch);

  const run = async (fn, okMsg) => {
    setBusy(true);
    setMsg('');
    const res = await fn();
    setBusy(false);
    setMsg(res.ok ? okMsg : `오류: ${res.error}`);
  };

  return (
    <div>
      <Section title="테마">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'theme-card' + ((s.theme || 'light') === t.id ? ' active' : '')}
              onClick={() => upd({ theme: t.id })}
            >
              <span
                className="theme-preview"
                style={{ background: t.swatch, '--tp-card': t.card, '--tp-edge': t.edge }}
              />
              <span className="theme-name">{t.name}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <p className="desc">배경과 유리 톤이 즉시 바뀝니다.</p>
      </Section>

      <Section title="팀">
        <Teams db={db} />
      </Section>

      <Section title="알림">
        <label className="setting-row">
          <input type="checkbox" checked={s.notifyStart} onChange={(e) => upd({ notifyStart: e.target.checked })} />
          시작 시간 알림
        </label>
        <label className="setting-row">
          <input type="checkbox" checked={s.notifyEnd} onChange={(e) => upd({ notifyEnd: e.target.checked })} />
          마무리 시간 알림
        </label>
        <label className="setting-row">
          <input type="checkbox" checked={s.dailySummary} onChange={(e) => upd({ dailySummary: e.target.checked })} />
          아침 요약 알림 (오늘 할 일 개수)
          <span style={{ marginLeft: 8 }}>
            <TimeField value={s.dailySummaryTime} placeholder="시간" onChange={(v) => upd({ dailySummaryTime: v || '09:00' })} />
          </span>
        </label>
        <label className="setting-row">
          <input type="checkbox" checked={!!s.dailyWrapup} onChange={(e) => upd({ dailyWrapup: e.target.checked })} />
          하루 마무리 알림 (완료한 일 · 남은 일 요약)
          <span style={{ marginLeft: 8 }}>
            <TimeField value={s.dailyWrapupTime || '21:00'} placeholder="시간" onChange={(v) => upd({ dailyWrapupTime: v || '21:00' })} />
          </span>
        </label>
      </Section>

      <Section title="시스템">
        <label className="setting-row">
          <input type="checkbox" checked={s.autoLaunch} onChange={(e) => upd({ autoLaunch: e.target.checked })} />
          Windows 시작 시 자동 실행 (백그라운드)
        </label>
        <p className="desc">창을 닫아도 트레이에서 계속 실행되며 알림을 보냅니다. 완전 종료는 트레이 아이콘 → 종료.</p>
      </Section>

      <Section title="동기화 (데스크톱 ↔ 모바일)">
        <p className="desc">
          server/를 실행해 두면 데스크톱과 모바일이 같은 팀·프로젝트·할 일을 공유합니다. 서버가 출력하는
          주소와 토큰을 여기와 모바일 설정에 똑같이 입력하세요. 설정해 두면 시작 시 + 10분마다 자동 동기화됩니다.
        </p>
        <div className="todo-form">
          <input
            className="grow"
            placeholder="서버 주소 (예: http://192.168.0.10:8787)"
            value={syncUrl}
            onChange={(e) => setSyncUrl(e.target.value)}
            onBlur={() => window.api.updateSettings({ sync: { url: syncUrl.trim() } })}
          />
          <input
            className="grow"
            type="password"
            placeholder="토큰"
            value={syncToken}
            onChange={(e) => setSyncToken(e.target.value)}
            onBlur={() => window.api.updateSettings({ sync: { token: syncToken.trim() } })}
          />
        </div>
        <div className="btn-row">
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setSyncMsg('동기화 중…');
              const r = await window.api.syncNow();
              setBusy(false);
              setSyncMsg(r.ok ? '동기화 완료.' : `오류: ${r.error}`);
            }}
          >
            지금 동기화
          </button>
          {syncCfg.lastSync && <span className="meta">마지막 동기화: {fmtDateTime(syncCfg.lastSync)}</span>}
        </div>
        {syncMsg && <p className="desc">{syncMsg}</p>}
      </Section>

      <Section title="구글 캘린더 가져오기">
        <p className="desc">
          구글 캘린더 일정을 앱으로 가져와 '오늘' 화면에 표시합니다 (읽기 전용). Google Cloud Console에서 만든
          데스크톱 앱 OAuth 클라이언트 ID/Secret이 필요합니다. 자세한 절차는 README 참고.
        </p>
        <div className="todo-form">
          <input
            className="grow"
            placeholder="OAuth 클라이언트 ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            onBlur={() => upd({ gcal: { clientId: clientId.trim() } })}
          />
          <input
            className="grow"
            type="password"
            placeholder="클라이언트 Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            onBlur={() => upd({ gcal: { clientSecret: clientSecret.trim() } })}
          />
        </div>
        <div className="btn-row">
          {!s.gcal.tokens ? (
            <button className="primary" disabled={busy} onClick={() => run(window.api.gcalConnect, '연결되었습니다.')}>
              {busy ? '대기 중…' : '구글 계정 연결'}
            </button>
          ) : (
            <>
              <span className="badge done-badge">연결됨</span>
              <button className="ghost" disabled={busy} onClick={() => run(window.api.gcalSync, '동기화 완료.')}>
                지금 동기화
              </button>
              <button className="ghost danger" disabled={busy} onClick={() => run(window.api.gcalDisconnect, '연결 해제됨.')}>
                연결 해제
              </button>
            </>
          )}
          {s.gcal.lastSync && <span className="meta">마지막 동기화: {fmtDateTime(s.gcal.lastSync)}</span>}
        </div>
        {msg && <p className="desc">{msg}</p>}
      </Section>

      <Section title="정보">
        <p className="desc">
          버전 {info ? info.version : '-'} · 데이터 위치: {info ? info.userData : '-'}
        </p>
      </Section>
    </div>
  );
}
