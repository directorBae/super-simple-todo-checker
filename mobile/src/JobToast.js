import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, View } from 'react-native';
import { Text } from './text.js';
import { useDb } from './store.js';
import { useDesign, Surface } from './design.js';
import { useTools } from './tools.js';
import { followJobs, toastOf } from './tool-jobs.js';

// The phone has no pet, so its work on Notion / Google Calendar shows as a small glass toast at the top:
// 📄 reading → 💭 thinking → ✏️ writing (gently bouncing) while it runs, then the summary for a few seconds.
const native = Platform.OS !== 'web';
export default function JobToast({ top = 58 }) {
  const { api } = useDb(), d = useDesign(), { state } = useTools();
  const known = useRef(null), [shown, setShown] = useState(null), [ended, setEnded] = useState(null), hide = useRef(null);
  const fade = useRef(new Animated.Value(0)).current, bounce = useRef(new Animated.Value(0)).current;
  const [running, setRunning] = useState(null);
  useEffect(() => {
    if (!state) return;
    const r = followJobs(known.current, state.jobs || []);
    known.current = r.known;
    setRunning(r.active);
    if (r.finished.length) {
      api.supabaseNow(); // the new to-dos are in the database now: bring them in right away
      clearTimeout(hide.current);
      const t = toastOf(r.finished[0]);
      setEnded(t);
      hide.current = setTimeout(() => setEnded(null), t.ms);
    }
  }, [state]);
  useEffect(() => () => clearTimeout(hide.current), []);
  const toast = running ? toastOf(running) : ended;
  useEffect(() => {
    if (toast) setShown(toast);
    Animated.timing(fade, { toValue: toast ? 1 : 0, duration: 220, useNativeDriver: native }).start(({ finished }) => { if (finished && !toast) setShown(null); });
  }, [toast?.text, toast?.icon]);
  // The icon hops while the job runs (not with Reduce Motion).
  useEffect(() => {
    if (!toast?.active) return undefined;
    let loop, live = true;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduced) => {
      if (reduced || !live) return;
      loop = Animated.loop(Animated.sequence([Animated.timing(bounce, { toValue: 1, duration: 380, useNativeDriver: native }), Animated.timing(bounce, { toValue: 0, duration: 380, useNativeDriver: native }), Animated.delay(240)]));
      loop.start();
    });
    return () => { live = false; loop?.stop(); bounce.setValue(0); };
  }, [!!toast?.active]);
  if (!shown) return null;
  return <Animated.View pointerEvents="box-none" style={{ position: 'absolute', top, left: 16, right: 16, zIndex: 90, alignItems: 'center', opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
    <Pressable accessibilityRole="alert" accessibilityLabel={shown.text} onPress={() => { clearTimeout(hide.current); setEnded(null); }} style={{ maxWidth: '100%' }}>
      <Surface native style={{ borderRadius: 99, borderColor: shown.error ? '#f3b4bf' : d.edge }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 16, paddingVertical: 8, backgroundColor: '#ffffff8c' }}>
        <Animated.Text style={{ fontSize: 16, transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>{shown.icon}</Animated.Text>
        <View style={{ flexShrink: 1 }}><Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: shown.error ? '#b4233c' : d.text }}>{shown.text}</Text></View>
      </Surface>
    </Pressable>
  </Animated.View>;
}
