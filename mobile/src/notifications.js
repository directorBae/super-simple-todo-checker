import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reminders } from '../../shared/reminders.js';

// Reminders on the phone are scheduled on the device itself (no server push needed), so they arrive even
// when the app is closed. Same rules as the web and desktop: start/end times, morning count, evening wrap-up.
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

let scheduled = '';
export async function rescheduleReminders(db) {
  if ((await Notifications.getPermissionsAsync()).granted !== true) return;
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
