import React, { createContext, useContext, useRef } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { BlurView, BlurTargetView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect, Circle, Text as SvgText } from 'react-native-svg';

export const THEMES = [
  { id: 'light', name: '클리어', colors: ['#f2f3fd', '#eef1fb', '#f6effa'], accent: '#6366f1' },
  { id: 'dark', name: '미드나이트', colors: ['#101e38', '#302851', '#152d42'], accent: '#a8c6ff', dark: true },
  { id: 'aurora', name: '오로라', colors: ['#bcebdc', '#c2dafa', '#e0d5ff'], accent: '#217964' },
  { id: 'sunset', name: '선셋', colors: ['#ffe7ce', '#f4cadf', '#dbd9ff'], accent: '#ab4c60' },
];
const DesignContext = createContext(null);
export function useDesign() { return useContext(DesignContext); }
export function DesignProvider({ theme = 'light', children }) {
  const target = useRef(null);
  const selected = THEMES.find(t => t.id === theme) || THEMES[0];
  const d = { ...selected, target, text: selected.dark ? '#f0f5ff' : '#172842', muted: selected.dark ? '#b4c3d9' : '#586a82', edge: selected.dark ? '#ffffff35' : '#ffffffb8', fill: selected.dark ? '#15243a70' : '#ffffff40', input: selected.dark ? '#ffffff14' : '#ffffff60' };
  return <DesignContext.Provider value={d}><View style={{ flex: 1, backgroundColor: selected.colors[0] }}>
    <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
      <LinearGradient colors={selected.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: -110, left: -90, width: 340, height: 340, borderRadius: 170, backgroundColor: selected.dark ? '#548cdd12' : '#c7d2fe20' }} />
      <View style={{ position: 'absolute', bottom: -120, right: -120, width: 390, height: 390, borderRadius: 195, backgroundColor: selected.dark ? '#ba83ff10' : '#fbcfe820' }} />
    </BlurTargetView>{children}
  </View></DesignContext.Provider>;
}
export function Surface({ children, style, contentStyle, native = false }) {
  const d = useDesign();
  const edge = { borderRadius: 24, borderWidth: 1, borderColor: d.edge, overflow: 'hidden' };
  if (native && Platform.OS === 'ios' && isLiquidGlassAvailable()) return <GlassView glassEffectStyle="regular" colorScheme={d.dark ? 'dark' : 'light'} style={[edge, style]}><View style={contentStyle}>{children}</View></GlassView>;
  return <View style={[edge, style]}><BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={35} tint={d.dark ? 'systemThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} /><View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: d.fill }]} /><View style={contentStyle}>{children}</View></View>;
}
const paths = {
  calendar: 'M7 3v4M17 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z',
  teams: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  bucket: 'M3 8h18l-2 13H5L3 8ZM8 8V5a4 4 0 0 1 8 0v3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  connect: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
};
export function Icon({ name, size = 22, color }) {
  const d = useDesign();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || d.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={paths[name] || paths.calendar} />{name === 'teams' && <Circle cx="9" cy="7" r="4" />}</Svg>;
}
export { ProviderIcon } from './SourceIcons.js';
export function Button({ title, onPress, primary, disabled, style }) {
  const d = useDesign();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: primary ? d.accent : d.input, borderWidth: 1, borderColor: primary ? 'transparent' : d.edge, opacity: disabled ? .4 : pressed ? .65 : 1 }, style]}><Text style={{ color: primary ? (d.dark ? '#14233b' : '#fff') : d.text, fontSize: 14, fontWeight: '600' }}>{title}</Text></Pressable>;
}
export function Sheet({ title, children, onClose }) {
  const d = useDesign();
  return <Modal transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#10234066' }}><Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} /><Surface native style={{ margin: 12, marginBottom: Platform.OS === 'ios' ? 32 : 16, maxHeight: '88%', backgroundColor: d.dark ? '#18243deb' : '#eaf1ffeb' }}><View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 20, fontWeight: '700', color: d.text }}>{title}</Text><Pressable accessibilityLabel="닫기" hitSlop={12} onPress={onClose}><Icon name="close" /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>{children}</ScrollView></Surface></KeyboardAvoidingView></Modal>;
}
