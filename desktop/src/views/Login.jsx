import React, { useState } from 'react';

// Email + password, one card on the wallpaper. Sign-up and login share the form; errors arrive in Korean.
export default function Login() {
  const [mode, setMode] = useState('signin'), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  const signup = mode === 'signup';
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const r = await (signup ? window.api.signUp(email, password) : window.api.signIn(email, password));
      if (!r.ok) setNote({ error: true, text: r.error });
      else if (r.confirm) { setMode('signin'); setNote({ text: '메일함에서 확인 링크를 누른 뒤 로그인해 주세요.' }); }
    } catch (err) { setNote({ error: true, text: err.message }); }
    setBusy(false);
  }
  async function recover() {
    if (!email.trim()) return setNote({ error: true, text: '이메일을 먼저 적어 주세요.' });
    const r = await window.api.recoverPassword(email).catch((err) => ({ ok: false, error: err.message }));
    setNote(r.ok ? { text: '재설정 메일을 보냈어요.' } : { error: true, text: r.error });
  }
  return <main className="login">
    <form className="login-card" onSubmit={submit}>
      <div className="welcome-mark">✓</div>
      <h1>체커</h1>
      <input type="email" autoComplete="username" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
      <input type="password" autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? '비밀번호 (6자 이상)' : '비밀번호'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={signup ? 6 : undefined} />
      {note && <p className={note.error ? 'login-note error' : 'login-note'} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? '잠시만요…' : signup ? '가입하기' : '로그인'}</button>
      <div className="login-links">
        <button type="button" onClick={() => { setMode(signup ? 'signin' : 'signup'); setNote(null); }}>{signup ? '이미 계정이 있어요? 로그인' : '처음이에요? 가입하기'}</button>
        {!signup && <button type="button" onClick={recover}>비밀번호를 잊었어요</button>}
      </div>
    </form>
  </main>;
}
