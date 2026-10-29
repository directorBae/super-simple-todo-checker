import React, { createContext, useContext, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, Pressable, View, StyleSheet, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Text } from './text.js';
import { BlurView, BlurTargetView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Path, Rect, Circle, Text as SvgText } from 'react-native-svg';

// Single theme: iOS-style glass over a photo wallpaper (Unsplash License, see docs/wallpaper-credits.md).
const THEME = { id: 'light', colors: ['#6d7f9c'], accent: '#6366f1' };
export const WALLPAPERS = [
  { id: 'fjord', name: '피오르', source: require('../assets/wallpapers/fjord.jpg') },
  { id: 'valley', name: '계곡', source: require('../assets/wallpapers/valley.jpg') },
  { id: 'canyon', name: '협곡', source: require('../assets/wallpapers/canyon.jpg') },
  { id: 'summit', name: '설산', source: require('../assets/wallpapers/summit.jpg') },
  { id: 'aurora', name: '오로라', source: require('../assets/wallpapers/aurora.jpg') },
  { id: 'coast', name: '해안', source: require('../assets/wallpapers/coast.jpg') },
  { id: 'highland', name: '고원', source: require('../assets/wallpapers/highland.jpg') },
];
export function wallpaperSource(setting) {
  if (setting?.id === 'custom' && setting.uri) return { uri: setting.uri };
  return (WALLPAPERS.find((w) => w.id === setting?.id) || WALLPAPERS[0]).source;
}
const DesignContext = createContext(null);
export function useDesign() { return useContext(DesignContext); }
export function DesignProvider({ wallpaper, children }) {
  const target = useRef(null);
  const selected = THEME;
  const d = { ...selected, target, text: '#141a2e', muted: '#4f5670', edge: '#ffffff4d', fill: '#ffffff0d', input: '#ffffff47' };
  // The photo is the blur target so every glass surface frosts the wallpaper behind it.
  return <DesignContext.Provider value={d}><View style={{ flex: 1, backgroundColor: selected.colors[0] }}>
    <BlurTargetView ref={target} style={StyleSheet.absoluteFill}>
      <Image source={wallpaperSource(wallpaper)} resizeMode="cover" style={StyleSheet.absoluteFill} />
    </BlurTargetView>
    {/* One thick frosted layer covers the whole screen; the photo only comes through as colour and light (a thin white veil, not a milky one). */}
    <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={70} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill} />
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff17' }]} />
    {children}
  </View></DesignContext.Provider>;
}
// Today's weekday and date shimmer: the colour sweeps through a bright highlight and the glow breathes.
export function GlowText({ style, children }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: false })]));
      loop.start();
    });
    return () => loop?.stop();
  }, []);
  return <Animated.Text style={[style, { color: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['#4f46e5', '#a78bfa', '#ffffff'] }), textShadowColor: '#c4b5fd', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [3, 12] }) }]}>{children}</Animated.Text>;
}
export function Surface({ children, style, contentStyle, native = false }) {
  const d = useDesign();
  const edge = { borderRadius: 24, borderWidth: 1, borderColor: d.edge, overflow: 'hidden' };
  if (native && Platform.OS === 'ios' && isLiquidGlassAvailable()) return <GlassView glassEffectStyle="regular" colorScheme={'light'} style={[edge, style]}><View style={contentStyle}>{children}</View></GlassView>;
  return <View style={[edge, style]}><BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={35} tint={'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} /><View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: d.fill }]} /><View style={contentStyle}>{children}</View></View>;
}
const paths = {
  calendar: 'M7 3v4M17 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Z',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  teams: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  bucket: 'M3 8h18l-2 13H5L3 8ZM8 8V5a4 4 0 0 1 8 0v3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  connect: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  close: 'M6 6l12 12M18 6 6 18',
  chevron: 'm9 5 7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  trash: 'M4 7h16M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7M6.5 7l.9 12.2c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17.5 7M10 11v6M14 11v6',
};
export function Icon({ name, size = 22, color }) {
  const d = useDesign();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || d.text} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={paths[name] || paths.calendar} />{name === 'teams' && <Circle cx="9" cy="7" r="4" />}</Svg>;
}
export { ProviderIcon } from './SourceIcons.js';
export function Button({ title, onPress, primary, disabled, style }) {
  const d = useDesign();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ paddingHorizontal: 17, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: primary ? d.accent : d.input, borderWidth: 1, borderColor: primary ? 'transparent' : d.edge, opacity: disabled ? .4 : pressed ? .65 : 1 }, style]}><Text style={{ color: primary ? ('#fff') : d.text, fontSize: 14, fontWeight: '600' }}>{title}</Text></Pressable>;
}
export function Sheet({ title, children, onClose }) {
  const d = useDesign();
  return <Modal transparent animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#10234066' }}><Pressable accessibilityLabel="닫기" style={StyleSheet.absoluteFill} onPress={onClose} /><Surface native style={{ margin: 12, marginBottom: Platform.OS === 'ios' ? 32 : 16, maxHeight: '88%', backgroundColor: '#eaf1ffeb' }}><View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 20, fontWeight: '700', color: d.text }}>{title}</Text><Pressable accessibilityLabel="닫기" hitSlop={12} onPress={onClose}><Icon name="close" /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>{children}</ScrollView></Surface></KeyboardAvoidingView></Modal>;
}
