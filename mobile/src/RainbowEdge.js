import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useImportTyping } from './ImportTyping.js';
import { rainbow, screenCorner } from './import-typing.js';

// "The AI is in session": while a Notion / Google Calendar job reads, thinks or writes (and while its lines are typed
// into the day list) a thin rainbow line glows round the edge of the screen, following its rounded corners. The colours
// slowly turn and the glow breathes; it fades in and out. Touches go straight through. With Reduce Motion it stands still.
const native = Platform.OS !== 'web';
const FPS_MS = 33;

function Edge({ width, height, corner, hue, angle, layers, id }) {
  const colors = rainbow(hue), r = Math.hypot(width, height) / 2, a = (angle * Math.PI) / 180;
  const cx = width / 2, cy = height / 2, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
  return <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
    <Defs>
      <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy}>
        {colors.map((c, i) => <Stop key={i} offset={i / (colors.length - 1)} stopColor={c} />)}
      </LinearGradient>
    </Defs>
    {layers.map(({ w, o, inset = 0, color }, i) => <Rect key={i} x={inset} y={inset} width={Math.max(0, width - inset * 2)} height={Math.max(0, height - inset * 2)} rx={Math.max(0, corner - inset)} ry={Math.max(0, corner - inset)} fill="none" stroke={color || `url(#${id})`} strokeOpacity={o} strokeWidth={w} />)}
  </Svg>;
}
// Soft glow: wide faint strokes centred on the screen's edge, so only their inner half shows and fades inwards.
const GLOW = [{ w: 22, o: 0.1 }, { w: 13, o: 0.16 }, { w: 7, o: 0.3 }];
// The line itself, fully on screen, with a hair of white inside it so it sits on the glass like a lit rim.
const LINE = [{ w: 2.5, o: 0.95, inset: 1.25 }, { w: 1, o: 0.55, inset: 3, color: '#ffffff' }];

export default function RainbowEdge() {
  const { session, reduced } = useImportTyping(), { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current, breathe = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false), [turn, setTurn] = useState({ hue: 0, angle: 30 });
  useEffect(() => {
    if (session) setShown(true);
    Animated.timing(fade, { toValue: session ? 1 : 0, duration: 400, useNativeDriver: native }).start(({ finished }) => { if (finished && !session) setShown(false); });
  }, [session]);
  // The colours turn (about 30 frames a second, only while it shows) and the glow breathes.
  useEffect(() => {
    if (!shown || reduced) return undefined;
    let raf = 0, last = 0;
    const t0 = Date.now() - turn.hue / 0.06;
    const frame = () => {
      const now = Date.now();
      if (now - last >= FPS_MS) { last = now; const t = now - t0; setTurn({ hue: (t * 0.06) % 360, angle: (30 + t * 0.03) % 360 }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const loop = Animated.loop(Animated.sequence([Animated.timing(breathe, { toValue: 1, duration: 1400, useNativeDriver: native }), Animated.timing(breathe, { toValue: 0, duration: 1400, useNativeDriver: native })]));
    loop.start();
    return () => { cancelAnimationFrame(raf); loop.stop(); };
  }, [shown, reduced]);
  if (!shown || !width || !height) return null;
  const corner = screenCorner(Platform.OS, { width, height });
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, opacity: fade }]}>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
      <Edge id="edgeGlow" width={width} height={height} corner={corner} hue={turn.hue} angle={turn.angle} layers={GLOW} />
    </Animated.View>
    <View style={StyleSheet.absoluteFill}><Edge id="edgeLine" width={width} height={height} corner={corner} hue={turn.hue} angle={turn.angle} layers={LINE} /></View>
  </Animated.View>;
}
