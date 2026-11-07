import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { reminders } from '../../shared/reminders.js';

// Reminders on the phone are scheduled on the device itself (no server push needed), so they arrive even
// when the app is closed — unless the server sends them (startPush). Same rules as the web and desktop: start/end times,
// morning count, evening wrap-up.
// iOS keeps at most 64 pending, so the next 14 days are scheduled (up to 60) and redone whenever to-dos change.
const HORIZON_MS = 14 * 864e5, MAX = 60, CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function notificationPermission(ask = true) {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: '할 일 알림', importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
  let status = await Notifications.getPermissionsAsync();
  if (!status.granted && status.canAskAgain && ask) status = await Notifications.requestPermissionsAsync();
  return status.granted ? 'granted' : status.canAskAgain ? 'default' : 'denied';
}

// Signed in on an iPhone build with push: the server sends the reminders (Edge Function /push), written from the to-dos
// as they are at that moment — a change made on the desktop counts even if this phone was never opened. The device's own
// schedule then stays empty. Without push (a demo build, Android, offline at start) the phone schedules them itself.
let pushToken = null, pushError = '';
// For 설정 → 알림: whether this phone is registered for pushes, and why not.
export const pushState = () => ({ registered: !!pushToken, error: pushError });
export async function startPush(tools) {
  if (!tools || Platform.OS !== 'ios') return false;
  if ((await Notifications.getPermissionsAsync()).granted !== true) { pushError = '알림이 허용되지 않았어요.'; return false; }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId });
    await tools.registerPush(data, Platform.OS);
    pushToken = data; scheduled = ''; pushError = '';
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (e) { pushError = '푸시 등록 실패: ' + (e?.message || String(e)); console.warn(pushError); return false; }
}
// Asking only once at start was not enough: iOS drops a permission request made while the app is not yet fully in
// front (or while another system alert is up), and nothing asked again — so no permission, no push address, no dive
// alerts. Now: ask (if never answered) and register whenever the app is in front, until it is registered.
export function keepPush(tools, after) {
  let busy = false;
  const run = async () => {
    if (busy || AppState.currentState !== 'active') return;
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
  if (pushToken || (await Notifications.getPermissionsAsync()).granted !== true) return;
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
