import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// The native CallKit + PushKit module (ios/CallCenter.swift). iPhone only; elsewhere everything here is a no-op.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule('VoipCall') : null;

export const available = !!native;
// { token, uuid, dive, test, answered } — the VoIP address and the call under way (uuid null when none).
export const state = () => (native ? native.state() : { token: null, uuid: null, dive: null, test: false, answered: false });
export const answerCall = (uuid) => (native ? native.answerCall(uuid) : Promise.resolve());
// reason: local (hung up in the app) · unanswered · elsewhere (answered on another device) · remote (the dive is over).
export const endCall = (uuid, reason = 'remote') => (native ? native.endCall(uuid, reason) : Promise.resolve());
export const on = (name, fn) => (native ? native.addListener(name, fn) : { remove() {} });
// What happened on the device, newest last (also while the app was closed). Older builds have no log.
export const log = () => (native?.log ? native.log() : []);
export const clearLog = () => native?.clearLog?.();
