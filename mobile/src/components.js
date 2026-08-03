import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { T, glassCard, shadow } from './theme.js';

/* 유리 카드 — BlurView 위에 반투명 흰색을 겹쳐 은은한 글래스모피즘 */
export function Glass({ style, intensity = 45, children }) {
  return (
    <View style={[glassCard, shadow(1), style]}>
      <BlurView
        intensity={intensity}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
      <View style={{ padding: 14 }}>{children}</View>
    </View>
  );
}

/* 누르면 통통 눌리는 버튼 래퍼 */
export function PressScale({ onPress, onLongPress, style, children, haptic }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable
      onPressIn={() => to(0.95)}
      onPressOut={() => to(1)}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress && onPress();
      }}
      onLongPress={onLongPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* 마운트 시 아래에서 떠오르는 페이드 인 */
export function FadeInUp({ delay = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 340, delay, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* 애니메이션 체크박스 — 체크하면 그라데이션색 + 스프링 팝 + 햅틱 */
export function Check({ checked, onToggle, size = 22 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pop = () => {
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 14 }).start();
  };
  return (
    <Pressable
      hitSlop={8}
      onPress={() => {
        pop();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onToggle();
      }}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.36,
          borderWidth: 1.5,
          borderColor: checked ? 'transparent' : 'rgba(148,163,184,0.6)',
          backgroundColor: checked ? T.accent : 'rgba(255,255,255,0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
          ...(checked ? shadow(1) : null),
        }}
      >
        {checked && <Text style={{ color: '#fff', fontSize: size * 0.6, fontWeight: '700', lineHeight: size * 0.75 }}>✓</Text>}
      </Animated.View>
    </Pressable>
  );
}

export const TeamDot = ({ color, size = 9 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.55)',
    }}
  />
);

export function Badge({ children, color, textColor }) {
  return (
    <View
      style={{
        backgroundColor: color || 'rgba(241,245,249,0.85)',
        borderRadius: 7,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 11, color: textColor || '#475569' }}>{children}</Text>
    </View>
  );
}

/* 팀 선택 칩 */
export function TeamChip({ team, active, onPress }) {
  const color = team ? team.color : T.muted;
  return (
    <PressScale onPress={onPress} haptic>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          borderWidth: 1,
          borderColor: active ? color : T.border,
          backgroundColor: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)',
          borderRadius: 99,
          paddingHorizontal: 11,
          paddingVertical: 5,
        }}
      >
        {team && <TeamDot color={team.color} />}
        <Text style={{ fontSize: 12, color: active ? color : T.muted, fontWeight: active ? '700' : '400' }}>
          {team ? team.name : '팀 없음'}
        </Text>
      </View>
    </PressScale>
  );
}

export function GhostButton({ label, onPress, danger, style }) {
  return (
    <PressScale onPress={onPress} haptic>
      <View
        style={[
          {
            borderWidth: 1,
            borderColor: danger ? 'rgba(225,29,72,0.4)' : T.border,
            backgroundColor: 'rgba(255,255,255,0.5)',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 6,
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 13, color: danger ? T.danger : T.muted }}>{label}</Text>
      </View>
    </PressScale>
  );
}

export function PrimaryButton({ label, onPress, style }) {
  return (
    <PressScale onPress={onPress} haptic>
      <View
        style={[
          {
            backgroundColor: T.accent,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 9,
            alignItems: 'center',
          },
          shadow(2),
          style,
        ]}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </View>
    </PressScale>
  );
}

export const SectionTitle = ({ children }) => (
  <Text style={{ fontSize: 13, fontWeight: '700', color: T.muted, marginTop: 20, marginBottom: 8 }}>{children}</Text>
);

export const EmptyNote = ({ children }) => (
  <View
    style={{
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: 'rgba(148,163,184,0.35)',
      borderRadius: 14,
      padding: 14,
      backgroundColor: 'rgba(255,255,255,0.3)',
    }}
  >
    <Text style={{ color: T.muted, fontSize: 13, textAlign: 'center' }}>{children}</Text>
  </View>
);
