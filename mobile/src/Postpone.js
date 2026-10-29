import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Text } from './text.js';
import { useDesign, Sheet, Button } from './design.js';
import { postponeDay, postponePatches } from '../../shared/reminders.js';
import { todayStr } from './util.js';

// The evening wrap-up asks to move what is left to tomorrow; tapping it opens the app with that question.
// Works when the tap launched the app (last response) and while it runs (listener). Returns [date | null, clear].
export function usePostponeRequest() {
 const [date, setDate] = useState(null);
 useEffect(() => {
  if (Platform.OS === 'web') return undefined;
  const forget = () => { try { (Notifications.clearLastNotificationResponse || Notifications.clearLastNotificationResponseAsync)?.(); } catch {} };
  const take = (r) => { const day = postponeDay(r?.notification?.request?.content?.data?.key); if (day) { setDate(day); forget(); } };
  Notifications.getLastNotificationResponseAsync().then(take).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(take);
  return () => sub.remove();
 }, []);
 return [date, () => setDate(null)];
}

// "오늘 할 일을 내일로 미룰까요?" — the day's open to-dos, a few titles, [내일로 미루기] [그대로 두기].
export function PostponeSheet({ date, db, api, onClose }) {
 const d = useDesign(), moving = postponePatches(db.todos, date).map((p) => db.todos.find((t) => t.id === p.id)).filter(Boolean);
 const [m, day] = date.split('-').slice(1).map(Number), today = date === todayStr();
 useEffect(() => { if (moving.length) return undefined; const t = setTimeout(onClose, 1600); return () => clearTimeout(t); }, [moving.length]);
 return <Sheet title={today ? '오늘 할 일을 내일로 미룰까요?' : `${m}월 ${day}일 할 일을 다음 날로 미룰까요?`} onClose={onClose}>
  {!moving.length ? <Text style={{ color: d.muted }}>남은 할 일이 없어요</Text> : <>
   <Text style={{ fontSize: 15, fontWeight: '600', color: d.text }}>남은 할 일 {moving.length}건</Text>
   <View style={{ gap: 4 }}>
    {moving.slice(0, 4).map((t) => <Text key={t.id} numberOfLines={1} style={{ fontSize: 14, color: d.text }}>· {t.title}</Text>)}
    {moving.length > 4 && <Text style={{ fontSize: 13, color: d.muted }}>외 {moving.length - 4}건</Text>}
   </View>
   <View style={{ flexDirection: 'row', gap: 8 }}>
    <Button title="내일로 미루기" primary style={{ flex: 1 }} onPress={() => { api.postpone(date); onClose(); }} />
    <Button title="그대로 두기" style={{ flex: 1 }} onPress={onClose} />
   </View>
  </>}
 </Sheet>;
}
