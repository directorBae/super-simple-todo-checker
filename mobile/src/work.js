import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { tools } from './store.js';

/*
 * 팀버전 (Work) on the phone: the team state (looked at every 8 s while the app is open — that also shows the person
 * as online), the actions, and the dive call (LiveKit). While the app is closed the server's pushes bring dives in:
 * the picked people's is time-sensitive. Tapping one opens the Team screen on that dive.
 */
const WorkContext = createContext(null);
export const useWork = () => useContext(WorkContext);
const EVERY_MS = 8000;

// The call: LiveKit's room with the phone's audio session (speaker/earpiece, other audio ducked) and the mic on.
async function connect({ url, token }, onChange) {
  const { AudioSession } = require('@livekit/react-native');
  const { Room, RoomEvent } = require('livekit-client');
  await AudioSession.startAudioSession();
  const room = new Room({ adaptiveStream: true, dynacast: true });
  const people = () => [room.localParticipant, ...room.remoteParticipants.values()].map((p) => ({
    id: p.identity, name: p.name || '팀원', me: p === room.localParticipant, speaking: p.isSpeaking, muted: !p.isMicrophoneEnabled,
  }));
  const update = () => onChange({ people: people(), state: room.state });
  for (const e of [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.LocalTrackPublished, RoomEvent.ConnectionStateChanged]) room.on(e, update);
  room.on(RoomEvent.Disconnected, () => { AudioSession.stopAudioSession(); onChange({ people: [], state: 'disconnected', ended: true }); });
  try { await room.connect(url, token); } catch (e) { AudioSession.stopAudioSession(); throw e; }
  await room.localParticipant.setMicrophoneEnabled(true).catch(() => onChange({ micError: '마이크를 쓸 수 없어요. 설정에서 마이크 권한을 켜 주세요.' }));
  update();
  return {
    mute: async (muted) => { await room.localParticipant.setMicrophoneEnabled(!muted); update(); },
    leave: () => { room.disconnect(); AudioSession.stopAudioSession(); },
  };
}

export function WorkProvider({ onOpen, children }) {
  const [state, setState] = useState(null), [error, setError] = useState(''), [call, setCall] = useState(null), live = useRef(null);
  const openRef = useRef(onOpen); openRef.current = onOpen;
  const refresh = async () => {
    if (!tools) return null;
    try { const r = await tools.work('/state'); setState({ ok: true, ...r }); setError(''); return r; } catch (e) { setError(e.message); return null; }
  };
  useEffect(() => {
    if (!tools) return undefined;
    let timer = null;
    const run = () => { clearInterval(timer); refresh(); timer = setInterval(refresh, EVERY_MS); };
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); else clearInterval(timer); });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  // A tapped dive / invite push opens the Team screen (on that dive).
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const take = (r) => {
      const data = r?.notification?.request?.content?.data;
      if (data?.kind === 'dive' || data?.kind === 'dive-reply') { openRef.current?.('dive:' + data.dive); refresh(); }
      else if (data?.kind === 'work-invite') { openRef.current?.('team'); refresh(); }
    };
    Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(take);
    return () => sub.remove();
  }, []);

  const act = async (path, body = {}) => { const r = await tools.work(path, body); refresh(); return r; };
  const enter = async (dive, r) => {
    live.current?.leave();
    setCall({ dive, people: [], state: 'connecting', muted: false });
    try { live.current = await connect(r.call, (patch) => setCall((c) => (c && c.dive === dive ? { ...c, ...patch } : c))); }
    catch (e) { setCall(null); live.current = null; await act('/dive/leave', { dive }).catch(() => {}); throw new Error('통화에 연결하지 못했어요: ' + (e.message || e)); }
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
    leaveDive: async (end = false) => { const dive = call?.dive; live.current?.leave(); live.current = null; setCall(null); if (dive) await act('/dive/leave', { dive, end }).catch(() => {}); },
    mute: async () => { if (!live.current || !call) return; const muted = !call.muted; await live.current.mute(muted); setCall((c) => c && { ...c, muted }); },
  };
  useEffect(() => { if (call?.ended) actions.leaveDive(); }, [call?.ended]);
  return <WorkContext.Provider value={{ state, error, call, available: !!tools, ...actions }}>{children}</WorkContext.Provider>;
}
