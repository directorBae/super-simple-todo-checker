import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireNativeModule } from 'expo';
import { reminders } from '../../shared/reminders.js';

// Reminders on the phone are scheduled on the device itself (no server push needed), so they arrive even
// when the app is closed — unless the server sends them (startPush). Same rules as the web and desktop: start/end times,
// morning count, evening wrap-up.
// iOS keeps at most 64 pending, so the next 14 days are scheduled (up to 60) and redone whenever to-dos change.
const HORIZON_MS = 14 * 864e5, MAX = 60, CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// iOS's own answer (ios.status): 0 not asked yet, 1 denied, 2 allowed, 3 provisional ("deliver quietly"), 4 ephemeral.
// expo-notifications reports 3 and 4 as "undetermined" (not granted, can ask again), but iOS never shows the prompt
// again for them — so asking did nothing, and pushes were never registered. They do get pushes (quietly), so they
// count as allowed here; the settings screen says how to make them prominent.
const IOS_STATUS = { 0: '아직 안 물음', 1: '거절됨', 2: '허용됨', 3: '조용히 전달', 4: '임시 허용' };
const allowed = (s) => !!s && (s.granted || s.ios?.status === 2 || s.ios?.status === 3 || s.ios?.status === 4);
let lastStatus = null, askError = '';
export const permissionNote = () => {
  const n = lastStatus?.ios?.status;
  return `아이폰 알림 상태: ${n ?? '?'}${IOS_STATUS[n] ? ` (${IOS_STATUS[n]})` : ''}${askError ? ' · 요청 오류: ' + askError : ''}`;
};
export const quietly = () => lastStatus?.ios?.status === 3;
export async function notificationPermission(ask = true) {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: '할 일 알림', importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
  let status = await Notifications.getPermissionsAsync();
  if (!allowed(status) && status.canAskAgain && ask) {
    try { status = await Notifications.requestPermissionsAsync(); askError = ''; }
    catch (e) { askError = e?.message || String(e); }
  }
  lastStatus = status;
  return allowed(status) ? 'granted' : status.canAskAgain && status.ios?.status !== 1 ? 'default' : 'denied';
}

// Signed in on an iPhone build with push: the server sends the reminders (Edge Function /push), written from the to-dos
// as they are at that moment — a change made on the desktop counts even if this phone was never opened. The device's own
// schedule then stays empty. Without push (a demo build, Android, offline at start) the phone schedules them itself.
let pushToken = null, pushError = '', pushStep = '';
// For 설정 → 알림 and the Team screen: whether this phone is registered for pushes, the step under way, and why not.
export const pushState = () => ({ registered: !!pushToken, error: pushError, step: pushStep });
const TOKEN_MS = 20_000, NET_MS = 15_000;
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error(what)), ms))]);
// The device's own address, straight from the native module. expo-notifications' getDevicePushTokenAsync() keeps one
// request in flight and hands every later call that same one — when APNs did not answer (a Wi‑Fi that blocks it, a
// slow first registration), the first attempt sat there for good and every retry waited on it: nothing ever changed,
// no error either. The native call drops the old request and asks APNs afresh, and it gives up after TOKEN_MS.
function deviceToken() {
  const native = requireNativeModule('ExpoPushTokenManager');
  return withTimeout(native.getDevicePushTokenAsync(), TOKEN_MS, 'APNs(애플 푸시 서버)가 20초 동안 답하지 않았어요. 이 Wi‑Fi가 푸시를 막고 있을 수 있어요 — 셀룰러 데이터로 한 번 더 눌러 보세요.');
}
let registering = null;
export function startPush(tools) {
  if (!registering) registering = register(tools).finally(() => { registering = null; });
  return registering;
}
async function register(tools) {
  if (!tools || Platform.OS !== 'ios') return false;
  const status = await Notifications.getPermissionsAsync(); lastStatus = status;
  if (!allowed(status)) { pushError = '알림이 허용되지 않았어요. ' + permissionNote(); return false; }
  try {
    pushStep = 'APNs 주소 받는 중';
    const data = await deviceToken();
    pushStep = 'Expo 주소 받는 중';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data: token } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: { type: 'ios', data } }), NET_MS, 'Expo 푸시 서버가 15초 동안 답하지 않았어요.');
    pushStep = '할 일 서버에 등록하는 중';
    await withTimeout(tools.registerPush(token, Platform.OS), NET_MS, '할 일 서버가 15초 동안 답하지 않았어요.');
    pushToken = token; scheduled = ''; pushError = ''; pushStep = '';
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (e) { pushError = `푸시 등록 실패 (${pushStep}): ` + (e?.message || String(e)); pushStep = ''; console.warn(pushError); return false; }
}
// Asking only once at start was not enough: iOS drops a permission request made while the app is not yet fully in
// front (or while another system alert is up), and nothing asked again — so no permission, no push address, no dive
// alerts. Now: ask (if never answered) and register whenever the app is in front, until it is registered.
export function keepPush(tools, after) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await notificationPermission(true); if (!pushToken) await startPush(tools); await after?.(); }
    catch (e) { pushError = e?.message || String(e); }
    finally { busy = false; }
  };
  const t = setTimeout(run, 800);
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTimeout(run, 400); });
  return () => { clearTimeout(t); sub.remove(); };
}
// Signing out: this phone stops getting that account's reminders.
export async function stopPush(tools) {
  if (pushToken && tools) await tools.unregisterPush(pushToken).catch(() => {});
  pushToken = null; scheduled = '';
}

let scheduled = '';
export async function rescheduleReminders(db) {
  if (pushToken || !allowed(await Notifications.getPermissionsAsync())) return;
  const now = Date.now(), list = reminders(db, now, now + HORIZON_MS).slice(0, MAX);
  const signature = JSON.stringify(list.map((r) => [r.key, r.at, r.title, r.body]));
  if (signature === scheduled) return;
  scheduled = signature;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of list) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { key: r.key } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(r.at), channelId: CHANNEL },
    }).catch(() => {});
  }
}
