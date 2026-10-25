import React from 'react';
import { petPixels } from '../../../shared/pixel-pet.js';
export const PET_COLORS = { mint: '#98ddc5', peach: '#ffc2a7', lavender: '#c6b8f0' };
export const DEFAULT_PET = { name: '모모', species: 'cat', color: 'mint', personality: '차분하게 곁을 지켜 주는 작은 친구', greeting: '하나씩, 천천히 해도 괜찮아.', x: .78, y: .78 };
export function PetSprite({ pet, happy = false, pose = 'idle', frame = 0, direction = 1 }) {
  return <svg viewBox="0 0 24 24" shapeRendering="crispEdges" role="img" aria-label={`${pet.name} 도트 펫`} className="pixel-pet-sprite" style={{transform:direction<0?'scaleX(-1)':undefined}}>
    {petPixels(pet,happy?'jump':pose,frame).map(p=><rect key={`${p.x}:${p.y}`} x={p.x} y={p.y} width="1" height="1" fill={p.color}/>)}
  </svg>;
}
