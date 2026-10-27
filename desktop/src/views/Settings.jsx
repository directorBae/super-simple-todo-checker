import React, { useEffect, useState } from 'react';
import { Section, TimeField } from '../components.jsx';
import Integrations from './Integrations.jsx';
import { WALLPAPERS, shrinkImage, wallpaperSrc } from '../wallpapers.js';
import { DEFAULT_PET } from '../focus/Pet.jsx';
import { petPixels } from '../../../shared/pixel-pet.js';
import { webNotifyState, askWebNotify } from '../web-notify.js';

const TABS = [['general', '일반'], ['wallpaper', '배경 화면'], ['tools', '도구 연결'], ['about', '정보']];

// Web only: the browser has to be allowed to show notifications.
function BrowserNotify() {
  const [state, setState] = useState(webNotifyState());
  const text = { granted: '이 브라우저에서 알림이 켜져 있어요. 이 페이지가 열려 있는 동안 알려 드려요.', denied: '브라우저에서 알림이 차단되어 있어요. 주소창의 사이트 설정에서 알림을 허용해 주세요.', default: '알림을 받으려면 브라우저에서 허용해 주세요.', insecure: '브라우저 알림은 https:// 주소(또는 이 PC의 localhost)에서만 쓸 수 있어요.', unsupported: '이 브라우저는 알림을 지원하지 않아요.' }[state];
  return <div className="setting-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
    <span className="desc" style={{ margin: 0, flex: 1, minWidth: 200 }}>{text}</span>
    {state === 'default' && <button className="primary" onClick={async () => setState(await askWebNotify())}>알림 허용하기</button>}
  </div>;
}

// Who is signed in, and the way out. Signing out removes this account's to-dos from this device.
function Account({ email }) {
  const [busy, setBusy] = useState(false);
  const out = async () => {
    if (!window.confirm('로그아웃할까요?')) return;
    setBusy(true);
    try { await window.api.signOut(); } finally { setBusy(false); }
  };
  return <Section title="계정">
    <div className="setting-row account-row"><span className="account-email">{email}</span><button className="ghost" disabled={busy} onClick={out}>{busy ? '로그아웃 중…' : '로그아웃'}</button></div>
  </Section>;
}

function General({ db }) {
  const s = db.settings, upd = (patch) => window.api.updateSettings(patch);
  return <>
    {db.auth?.email && <Account email={db.auth.email} />}
    <Section title="알림">
      {window.api.platform === 'web' && <BrowserNotify />}
      <label className="setting-row"><input type="checkbox" checked={s.notifyStart} onChange={(e) => upd({ notifyStart: e.target.checked })} />시작 시간 알림</label>
      <label className="setting-row"><input type="checkbox" checked={s.notifyEnd} onChange={(e) => upd({ notifyEnd: e.target.checked })} />마무리 시간 알림</label>
      <label className="setting-row">
        <input type="checkbox" checked={s.dailySummary} onChange={(e) => upd({ dailySummary: e.target.checked })} />아침 요약 알림 (오늘 할 일 개수)
        <span style={{ marginLeft: 8 }}><TimeField value={s.dailySummaryTime} placeholder="시간" onChange={(v) => upd({ dailySummaryTime: v || '09:00' })} /></span>
      </label>
      <label className="setting-row">
        <input type="checkbox" checked={!!s.dailyWrapup} onChange={(e) => upd({ dailyWrapup: e.target.checked })} />하루 마무리 알림 (완료한 일 · 남은 일 요약)
        <span style={{ marginLeft: 8 }}><TimeField value={s.dailyWrapupTime || '21:00'} placeholder="시간" onChange={(v) => upd({ dailyWrapupTime: v || '21:00' })} /></span>
      </label>
    </Section>
    {window.api.platform !== 'web' && <Section title="시스템">
      <label className="setting-row"><input type="checkbox" checked={s.autoLaunch} onChange={(e) => upd({ autoLaunch: e.target.checked })} />컴퓨터를 켤 때 자동 실행</label>
    </Section>}
  </>;
}

function Wallpaper({ db }) {
  const current = db.settings.wallpaper || { id: WALLPAPERS[0].id };
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const r = await window.api.saveWallpaper(await shrinkImage(file));
      if (!r?.ok) throw new Error(r?.error || '사진을 저장하지 못했습니다.');
      await window.api.updateSettings({ wallpaper: { id: 'custom', src: r.src } });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const pet = { ...DEFAULT_PET, ...db.settings.focusPet };
  return <>
    <Section title="배경 사진">
      <div className="wallpaper-grid">
        {WALLPAPERS.map((w) => <button key={w.id} className={'wallpaper-tile' + (current.id === w.id ? ' active' : '')} aria-pressed={current.id === w.id} aria-label={w.name + ' 배경'} title={`${w.name} · 사진 ${w.credit} (Unsplash)`} style={{ backgroundImage: `url(${w.src})` }} onClick={() => window.api.updateSettings({ wallpaper: { id: w.id } })}><span>{w.name}</span></button>)}
        {current.id === 'custom' && <button className="wallpaper-tile active" aria-pressed="true" aria-label="내 사진 배경" style={{ backgroundImage: `url(${wallpaperSrc(current)})` }}><span>내 사진</span></button>}
        <label className={'wallpaper-tile upload' + (busy ? ' busy' : '')}><input type="file" accept="image/*" aria-label="배경 사진 올리기" onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} /><span>{busy ? '올리는 중…' : '+ 사진 올리기'}</span></label>
      </div>
      {error && <p className="focus-error" role="alert">{error}</p>}
      <p className="desc">사진은 Unsplash 무료 라이선스 사진입니다. 올린 사진은 이 기기에만 저장됩니다.</p>
    </Section>
    <Section title="시계 월페이퍼">
      <p className="desc">시계와 펫을 독립 HTML 파일로 저장해 브라우저나 Lively Wallpaper에서 바탕화면으로 쓸 수 있어요.</p>
      <button className="ghost" onClick={async () => { setError(''); try { await window.api.exportWallpaper({ pet, pixels: petPixels(pet) }); } catch { setError('월페이퍼를 저장하지 못했습니다.'); } }}>월페이퍼 저장</button>
    </Section>
  </>;
}

function About() {
  const [info, setInfo] = useState(null);
  useEffect(() => { window.api.getInfo().then(setInfo); }, []);
  return <Section title="정보"><p className="desc">버전 {info ? info.version : '-'} · 데이터 위치: {info ? info.userData : '-'}</p></Section>;
}

export default function Settings({ db, initialTab = 'general' }) {
  const [tab, setTab] = useState(initialTab);
  return <div className="settings-layout">
    <nav className="settings-tabs" aria-label="설정 항목">
      {TABS.map(([key, label]) => <button key={key} className={'settings-tab' + (tab === key ? ' active' : '')} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    <div className="settings-pane">
      {tab === 'general' ? <General db={db} /> : tab === 'wallpaper' ? <Wallpaper db={db} /> : tab === 'tools' ? <Integrations db={db} /> : <About />}
    </div>
  </div>;
}
