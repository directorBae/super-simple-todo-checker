import * as voip from '../modules/voip-call/index.js';
import { tools } from './store.js';

// 다이브를 전화처럼 (iPhone). The phone's VoIP address (PushKit) is kept on the server (voip_devices); a dive that
// picks this phone is sent there as a VoIP push and CallKit rings like a phone call, app open or not. The Work
// provider (work.js) joins on answer, answers "지금 연락 불가" on decline, and hangs up the call screen when the dive
// is over or was answered on another device.
export const available = voip.available;
export const callState = voip.state, answerCall = voip.answerCall, endCall = voip.endCall, onCall = voip.on;

let registered = null;
export async function registerVoip() {
  const token = voip.state().token;
  if (!tools || !token || token === registered) return !!registered;
  try { await tools.registerVoip(token); registered = token; return true; }
  catch (e) { console.warn('VoIP 주소 등록 실패', e.message); return false; }
}
// Once at start: register the address now and whenever iOS hands out a new one.
export function watchVoip() {
  if (!available) return () => {};
  registerVoip();
  const sub = voip.on('onVoipToken', () => registerVoip());
  return () => sub.remove();
}
// Signing out: this phone no longer rings for that account.
export async function stopVoip() {
  if (registered && tools) await tools.unregisterVoip(registered).catch(() => {});
  registered = null;
}
