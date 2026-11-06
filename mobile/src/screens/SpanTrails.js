import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/*
 * Multi-day to-dos in the phone's day list (as on PC): a hair-thin line just left of the lines joins a to-do's parts
 * from one day to the next, with a short glow running along it like a meteor; a selected to-do's line is clearer.
 * The rows register in `rows` as 'span:<id>@<day>'; their places are measured inside `content`.
 */
const AnimatedPath = Animated.createAnimatedComponent(Path);
const PULSE = 14;

export function SpanTrails({ content, rows, db, selection }) {
  const [trails, setTrails] = useState([]), run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    const measure = () => {
      const keys = Object.keys(rows.current).filter((k) => k.startsWith('span:'));
      const byId = {};
      let left = keys.length;
      if (!left || !content.current) { setTrails([]); return; }
      for (const k of keys) {
        const [id, day] = k.slice(5).split('@');
        rows.current[k]?.measureLayout?.(content.current, (x, y, w, h) => {
          (byId[id] ||= []).push({ day, x, y: y + Math.min(h, 34) / 2 });
          if (--left === 0 && alive) build(byId);
        }, () => { if (--left === 0 && alive) build(byId); });
      }
    };
    const build = (byId) => {
      const out = [];
      for (const [id, pts] of Object.entries(byId)) {
        if (pts.length < 2) continue;
        pts.sort((a, b) => a.y - b.y);
        const x = Math.max(1, Math.min(...pts.map((p) => p.x)) - 7);
        let d = '', length = 0;
        pts.forEach((p, i) => {
          if (i > 0) { d += ` L${x} ${p.y - 6} Q${x} ${p.y} ${p.x} ${p.y}`; length += p.y - pts[i - 1].y; }
          if (i < pts.length - 1) d += `${i ? ' ' : ''}M${p.x} ${p.y} Q${x} ${p.y} ${x} ${p.y + 6}`;
        });
        const team = db.teams.find((t) => t.id === db.todos.find((t) => t.id === id)?.teamId);
        out.push({ id, d, length: Math.max(40, length), color: team?.color || '#6366f1' });
      }
      setTrails(out);
    };
    const timer = setTimeout(measure, 120);
    return () => { alive = false; clearTimeout(timer); };
  }, [db.todos, db.teams]);
  useEffect(() => {
    if (!trails.length) return undefined;
    const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [trails.length]);
  if (!trails.length) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%">
      {trails.map((t) => {
        const on = selection?.has?.(t.id);
        return <React.Fragment key={t.id}>
          <Path d={t.d} fill="none" stroke={t.color} strokeWidth={on ? 1.6 : 1} strokeOpacity={on ? 0.85 : 0.32} strokeLinecap="round" />
          <AnimatedPath d={t.d} fill="none" stroke={t.color} strokeWidth={on ? 2.2 : 1.4} strokeOpacity={0.9} strokeLinecap="round"
            strokeDasharray={[PULSE, t.length * 2]} strokeDashoffset={run.interpolate({ inputRange: [0, 1], outputRange: [t.length * 1.6, -PULSE] })} />
        </React.Fragment>;
      })}
    </Svg>
  </View>;
}
