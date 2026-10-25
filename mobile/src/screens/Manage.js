import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDesign, Surface } from '../design.js';
import Teams from './Teams.js';
import Buckets from './Buckets.js';

// The room to the left of the main screen. On a phone the two halves become a switch: teams left, buckets right.
export default function Manage({ onClose }) {
  const d = useDesign(), [side, setSide] = useState('teams');
  return <View style={{ flex: 1, paddingTop: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 10 }}>
      <Surface native style={{ flex: 1, borderRadius: 14 }} contentStyle={{ flexDirection: 'row', padding: 3 }}>
        {[['teams', '팀'], ['buckets', '버킷']].map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: side === key }} onPress={() => setSide(key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11, backgroundColor: side === key ? '#ffffffd9' : 'transparent' }}><Text style={{ fontWeight: '700', color: side === key ? d.accent : d.muted }}>{label}</Text></Pressable>)}
      </Surface>
      <Pressable accessibilityLabel="팀 · 버킷 닫기" hitSlop={12} onPress={onClose}><Text style={{ fontSize: 22, color: d.muted }}>×</Text></Pressable>
    </View>
    <View style={{ flex: 1 }}>{side === 'teams' ? <Teams /> : <Buckets />}</View>
  </View>;
}
