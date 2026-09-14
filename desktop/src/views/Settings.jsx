import React, { useEffect, useState } from 'react';
import { Section, TimeField } from '../components.jsx';
import { fmtDateTime } from '../util.js';

export default function Settings({ db }) {
  const s = db.settings;
  const syncCfg = s.sync || { url: '', token: '', lastSync: null };
  const [syncMsg, setSyncMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    window.api.getInfo().then(setInfo);
  }, []);

  const upd = (patch) => window.api.updateSettings(patch);


  return (
    <div>
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
          이 컴퓨터의 서버와 자동으로 연결합니다. 휴대폰은 메뉴의 ‘휴대폰 연결’에서 발급한 코드로 연결하세요.
          앱을 사용하는 동안 약 3초마다 같은 팀과 할 일을 확인합니다.
        </p>
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

<Section title="외부 도구 연결"><p className="desc">상단의 도구 연결에서 Notion, Google Calendar, iCloud 계정과 조직별 위치를 설정하세요.</p></Section>

      <Section title="정보">
        <p className="desc">
          버전 {info ? info.version : '-'} · 데이터 위치: {info ? info.userData : '-'}
        </p>
      </Section>
    </div>
  );
}
