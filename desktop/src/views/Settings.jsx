import React, { useEffect, useState } from 'react';
import { Section, TimeField } from '../components.jsx';
import Integrations from './Integrations.jsx';
import { WALLPAPERS, shrinkImage, wallpaperSrc } from '../wallpapers.js';
import { DEFAULT_PET } from '../focus/Pet.jsx';
import { petPixels } from '../../../shared/pixel-pet.js';

const TABS = [['general', '일반'], ['wallpaper', '배경 화면'], ['tools', '도구 연결'], ['phone', '휴대폰 연결'], ['about', '정보']];

function General({ db }) {
  const s = db.settings, upd = (patch) => window.api.updateSettings(patch);
  return <>
    <Section title="알림">
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
      <label className="setting-row"><input type="checkbox" checked={s.autoLaunch} onChange={(e) => upd({ autoLaunch: e.target.checked })} />Windows 시작 시 자동 실행 (백그라운드)</label>
      <p className="desc">창을 닫아도 트레이에서 계속 실행되며 알림을 보냅니다. 완전 종료는 트레이 아이콘 → 종료.</p>
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

function Phone() {
  const [pair, setPair] = useState(null);
  const make = async () => { setPair(null); setPair(await window.api.pairDevice()); };
  return <Section title="휴대폰 연결">
    <p className="desc">휴대폰 앱의 메뉴 → <strong>PC 연결</strong>에서 아래 주소와 코드를 입력하세요. 두 기기를 같은 Wi-Fi에 연결해 주세요. 코드는 10분 동안 한 번 사용할 수 있습니다.</p>
    {!pair ? <button className="primary" onClick={make}>연결 코드 만들기</button>
      : pair.ok ? <div className="pair-panel">{pair.urls.map((url) => <div key={url} className="pair-address">{url}</div>)}<div className="pair-code">{pair.code}</div><button className="ghost" onClick={make}>새 코드 만들기</button></div>
      : <><p role="alert">{pair.error}</p><button className="ghost" onClick={make}>다시 시도</button></>}
  </Section>;
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
      {tab === 'general' ? <General db={db} /> : tab === 'wallpaper' ? <Wallpaper db={db} /> : tab === 'tools' ? <Integrations db={db} /> : tab === 'phone' ? <Phone /> : <About />}
    </div>
  </div>;
}
