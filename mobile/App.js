import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { DbProvider } from './src/store.js';
import { T, shadow } from './src/theme.js';
import { PressScale, FadeInUp } from './src/components.js';
import Board from './src/screens/Board.js';
import Projects from './src/screens/Projects.js';
import Buckets from './src/screens/Buckets.js';
import Settings from './src/screens/Settings.js';

const TABS = [
  { key: 'todos', label: '할 일', icon: '✓' },
  { key: 'content', label: '콘텐츠', icon: '✎' },
  { key: 'projects', label: '프로젝트', icon: '▤' },
  { key: 'buckets', label: '버킷', icon: '◎' },
  { key: 'settings', label: '설정', icon: '⚙' },
];

/* 은은하게 떠다니는 배경 블롭 */
function Blob({ size, color, style, dx, dy, duration }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
          ],
        },
        style,
      ]}
    />
  );
}

function Screen({ tab }) {
  if (tab === 'todos') return <Board kind="todo" />;
  if (tab === 'content') return <Board kind="content" />;
  if (tab === 'projects') return <Projects />;
  if (tab === 'buckets') return <Buckets />;
  return <Settings />;
}

export default function App() {
  const [tab, setTab] = useState('todos');
  const topPad = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;
  const title = TABS.find((t) => t.key === tab).label;

  return (
    <DbProvider>
      <View style={{ flex: 1 }}>
        {/* 배경 — 파스텔 그라데이션 + 블롭 (데스크톱과 같은 무드) */}
        <LinearGradient
          colors={['#f2f3fd', '#eef1fb', '#f6effa']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Blob size={340} color="rgba(199,210,254,0.5)" style={{ top: -110, left: -90 }} dx={50} dy={40} duration={9000} />
        <Blob size={300} color="rgba(251,207,232,0.42)" style={{ bottom: -80, right: -90 }} dx={-45} dy={-35} duration={11000} />
        <Blob size={240} color="rgba(186,230,253,0.4)" style={{ top: '38%', right: -120 }} dx={-40} dy={30} duration={13000} />

        <SafeAreaView style={{ flex: 1, paddingTop: topPad }}>
          {/* 상단 유리 헤더 */}
          <View style={styles.header}>
            <BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
            <Text style={styles.logo}>✓ 체커</Text>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <FadeInUp key={tab} style={{ flex: 1 }}>
            <Screen tab={tab} />
          </FadeInUp>

          {/* 하단 유리 탭바 */}
          <View style={[styles.tabbar, shadow(3)]}>
            <BlurView intensity={55} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.5)' }]} />
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <PressScale key={t.key} haptic onPress={() => setTab(t.key)} style={{ flex: 1 }}>
                  <View style={[styles.tabItem, active && styles.tabItemActive]}>
                    <Text style={{ fontSize: 16, color: active ? T.accent : T.muted }}>{t.icon}</Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: active ? '700' : '500',
                        color: active ? T.accent : T.muted,
                      }}
                    >
                      {t.label}
                    </Text>
                  </View>
                </PressScale>
              );
            })}
          </View>
        </SafeAreaView>
        <StatusBar style="dark" />
      </View>
    </DbProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.65)',
    overflow: 'hidden',
  },
  logo: { fontSize: 16, fontWeight: '800', color: T.accent, letterSpacing: -0.3 },
  headerTitle: { fontSize: 15, fontWeight: '600', color: T.text },
  tabbar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 28 : 20,
    flexDirection: 'row',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
    padding: 6,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 7,
    borderRadius: 18,
  },
  tabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...shadow(1),
  },
});
