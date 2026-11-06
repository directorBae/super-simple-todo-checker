import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { workAlerts } from '../../../shared/work-alerts.mjs';

/*
 * 팀버전 (Work) in the window: the team state (teams, invites, who is online, open dives), the actions, and the dive
 * call itself (LiveKit, loaded only when a call starts).
 *   desktop app — the main process looks every 10 s (electron/work.cjs) and sends the state; it also shows the
 *                 system notifications, so this only listens and asks for a fresh look after a change.
 *   web         — the page looks every 8 s itself and shows browser notifications (while it is open).
 */
const WorkContext = createContext(null);
export const useWork = () => useContext(WorkContext);
const WEB_EVERY_MS = 8000;

function webNotify(a, onOpen) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(a.title, { body: a.body, tag: a.key, requireInteraction: !!a.important, icon: './icon.png' });
    n.onclick = () => { window.focus(); n.close(); onOpen(a.dive ? 'dive:' + a.dive : 'team'); };
  } catch { /* some browsers only notify from a service worker */ }
}

// The call: a LiveKit room with the microphone on; remote voices play through <audio> elements kept off screen.
async function connect({ url, token }, onChange) {
  const { Room, RoomEvent, Track } = await import('livekit-client');
  const room = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const people = () => [room.localParticipant, ...room.remoteParticipants.values()].map((p) => ({
    id: p.identity, name: p.name || '팀원', me: p === room.localParticipant, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled,
  }));
  const update = () => onChange({ people: people(), state: room.state });
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach(); el.className = 'dive-audio'; document.body.appendChild(el); update();
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); update(); });
  for (const e of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.ConnectionStateChanged]) room.on(e, update);
  room.on(RoomEvent.Disconnected, () => onChange({ people: [], state: 'disconnected', ended: true }));
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true).catch(() => onChange({ micError: '마이크를 쓸 수 없어요. 권한을 확인해 주세요.' }));
  await room.startAudio().catch(() => {});
  update();
  return {
    mute: async (muted) => { await room.localParticipant.setMicrophoneEnabled(!muted); update(); },
    leave: () => room.disconnect(),
  };
}

export function WorkProvider({ children, onOpen }) {
  const [state, setState] = useState(null), [error, setError] = useState('');
  // call: { dive, people, state, muted, micError } while in a dive; null otherwise.
  const [call, setCall] = useState(null), live = useRef(null);
  const openRef = useRef(onOpen); openRef.current = onOpen;
  const desktop = !!window.api.workRefresh;
  const take = (r) => { if (r?.ok && r.me) { setState(r); setError(''); } else if (r?.error) setError(r.error); return r; };
  const refresh = () => (desktop ? window.api.workRefresh() : window.api.tools('work', { path: '/state' })).then(take, (e) => setError(e.message));
  useEffect(() => {
    if (desktop) { window.api.onWorkState((s) => take(s)); refresh(); return undefined; }
    const seen = new Set(); let first = true, who = null;
    const look = async () => {
      const r = take(await window.api.tools('work', { path: '/state' }).catch(() => null));
      if (!r?.ok || !r.me) return;
      if (r.me.id !== who) { who = r.me.id; seen.clear(); first = true; }
      for (const a of workAlerts(r, seen, { first })) webNotify(a, (v) => openRef.current?.(v));
      first = false;
    };
    look();
    const timer = setInterval(look, WEB_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  const act = async (path, body = {}) => {
    const r = await window.api.tools('work', { path, body });
    if (!r?.ok) throw new Error(r?.error || '요청하지 못했어요.');
    refresh();
    return r;
  };
  // Into a call with the token the server gave (starting a dive or joining one).
  const enter = async (dive, r) => {
    live.current?.leave();
    setCall({ dive, people: [], state: 'connecting', muted: false });
    try {
      live.current = await connect(r.call, (patch) => setCall((c) => (c && c.dive === dive ? { ...c, ...patch } : c)));
    } catch (e) {
      setCall(null); live.current = null;
      await act('/dive/leave', { dive }).catch(() => {});
      throw new Error('통화에 연결하지 못했어요: ' + (e.message || e));
    }
  };
  const actions = {
    refresh,
    setName: (name) => act('/name', { name }),
    createTeam: (name) => act('/team', { name }),
    deleteTeam: (team) => act('/team/delete', { team }),
    invite: (team, emails) => act('/invite', { team, emails }),
    acceptInvite: (team) => act('/invite/accept', { team }),
    declineInvite: (team) => act('/invite/decline', { team }),
    removeMember: (team, email) => act('/member/remove', { team, email }),
    reply: (dive, answer) => act('/dive/reply', { dive, answer }),
    startDive: async (team, targets, agenda) => { const r = await act('/dive', { team, targets, agenda }); await enter(r.dive.id, r); return r; },
    joinDive: async (dive) => { const r = await act('/dive/join', { dive }); await enter(dive, r); },
    leaveDive: async (end = false) => {
      const dive = call?.dive; live.current?.leave(); live.current = null; setCall(null);
      if (dive) await act('/dive/leave', { dive, end }).catch(() => {});
    },
    mute: async () => { if (!live.current || !call) return; const muted = !call.muted; await live.current.mute(muted); setCall((c) => c && { ...c, muted }); },
  };
  // Left by the server (or the network): tidy up once.
  useEffect(() => { if (call?.ended) actions.leaveDive(); }, [call?.ended]);
  return <WorkContext.Provider value={{ state, error, call, ...actions }}>{children}</WorkContext.Provider>;
}
