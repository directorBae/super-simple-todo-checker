import { Platform } from 'react-native';

// 데스크톱(styles.css)과 같은 디자인 토큰
export const T = {
  accent: '#6366f1',
  accent2: '#8b5cf6',
  accentSoft: 'rgba(99,102,241,0.12)',
  text: '#1e293b',
  muted: '#64748b',
  danger: '#e11d48',
  glassEdge: 'rgba(255,255,255,0.65)',
  border: 'rgba(148,163,184,0.28)',
  panel: 'rgba(255,255,255,0.62)',
  panelStrong: 'rgba(255,255,255,0.8)',
};

export const shadow = (depth = 1) =>
  Platform.select({
    ios: {
      shadowColor: '#505abe',
      shadowOffset: { width: 0, height: depth * 3 },
      shadowOpacity: 0.06 + depth * 0.03,
      shadowRadius: 6 + depth * 5,
    },
    android: { elevation: depth * 2 },
  });

export const glassCard = {
  borderRadius: 18,
  borderWidth: 1,
  borderColor: T.glassEdge,
  overflow: 'hidden',
};
