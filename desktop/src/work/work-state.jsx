import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { workAlerts, ringbackWanted } from '../../../shared/work-alerts.mjs';
import { ringback } from './ring.js';

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
    n.onclick = () => { window.focus(); n.close(); onOpen(a.dive ? (a.important ? 'join:' : 'dive:') + a.dive : 'team'); };
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

export function WorkProvider({ children, onOpen, pet }) {
  const petRef = useRef(pet); petRef.current = pet;
  const [state, setState] = useState(null), [error, setError] = useState('');
  // call: { dive, people, state, muted, micError } while in a dive; null otherwise.
  const [call, setCall] = useState(null), live = useRef(null);
  const openRef = useRef(onOpen); openRef.current = onOpen;
  const desktop = !!window.api.workRefresh;
  // Tags tapped but not yet confirmed by the server, per team: shown at once and kept over any older answer that
  // comes in meanwhile (a regular look that started before the save) until the server says the same.
  const tags = useRef(new Map()), saving = useRef(new Map());
  const same = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);
  const overlay = (r) => (!r?.teams || !tags.current.size ? r : { ...r, teams: r.teams.map((t) => (tags.current.has(t.id) ? { ...t, links: tags.current.get(t.id), link: tags.current.get(t.id)[0] || null } : t)) });
  const take = (r) => {
    if (r?.ok && r.me) {
      for (const t of r.teams) if (tags.current.has(t.id) && !saving.current.has(t.id) && same(t.links, tags.current.get(t.id))) tags.current.delete(t.id);
      setState(overlay(r)); setError('');
    } else if (r?.error) setError(r.error);
    return r;
  };
  const refresh = () => (desktop ? window.api.workRefresh() : window.api.tools('work', { path: '/state' })).then(take, (e) => setError(e.message));
  useEffect(() => {
    if (desktop) { window.api.onWorkState((s) => take(s)); refresh(); return undefined; }
    const seen = new Set(); let first = true, who = null;
    const look = async () => {
      const r = take(await window.api.tools('work', { path: '/state', body: { pet: petRef.current || null } }).catch(() => null));
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
    openRef.current?.('team'); // into the room: the Team tab shows the live call in place of the Dive button
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
    // Tapping tags: the screen follows at once; quick taps are saved together (the last set) a moment later.
    setLink: (team, checkerTeams) => {
      tags.current.set(team, checkerTeams);
      setState((s) => overlay(s));
      clearTimeout(saving.current.get(team));
      saving.current.set(team, setTimeout(async () => {
        try { await act('/link', { team, checkerTeams: tags.current.get(team) }); }
        catch (e) { tags.current.delete(team); setError(e.message); refresh(); }
        finally { saving.current.delete(team); }
      }, 350));
    },
    renameTeam: (team, name) => act('/team/rename', { team, name }),
    invite: (team, emails) => act('/invite', { team, emails }),
    acceptInvite: (team) => act('/invite/accept', { team }),
    declineInvite: (team) => act('/invite/decline', { team }),
    removeMember: (team, email) => act('/member/remove', { team, email }),
    reply: (dive, answer) => act('/dive/reply', { dive, answer }),
    // A teammate's board (read only): their to-dos except private ones, their 체커 teams, their pet.
    memberBoard: async (team, member) => { const r = await window.api.tools('work', { path: '/member', body: { team, member } }); if (!r?.ok) throw new Error(r?.error || '불러오지 못했어요.'); return r; },
    startDive: async (team, targets, agenda) => { const r = await act('/dive', { team, targets, agenda }); await enter(r.dive.id, r); return r; },
    joinDive: async (dive) => { const r = await act('/dive/join', { dive }); await enter(dive, r); },
    deleteDive: (dive) => act('/dive/delete', { dive }),
    leaveDive: async (end = false) => {
      const dive = call?.dive; live.current?.leave(); live.current = null; setCall(null);
      if (dive) await act('/dive/leave', { dive, end }).catch(() => {});
    },
    mute: async () => { if (!live.current || !call) return; const muted = !call.muted; await live.current.mute(muted); setCall((c) => c && { ...c, muted }); },
  };
  // Left by the server (or the network): tidy up once.
  useEffect(() => { if (call?.ended) actions.leaveDive(); }, [call?.ended]);
  // 연결음 for the caller while nobody has come into the room yet (the rule is shared: work-alerts.mjs).
  const remote = (call?.people || []).filter((p) => !p.me).length;
  useEffect(() => {
    const d = state?.dives?.find((x) => x.id === call?.dive);
    if (!ringbackWanted(call, d, state?.me?.id)) return undefined;
    return ringback();
  }, [call?.dive, call?.state, remote, state?.dives, state?.me?.id]);
  return <WorkContext.Provider value={{ state, error, call, ...actions }}>{children}</WorkContext.Provider>;
}
