import React from 'react';
import { Image, Linking, Pressable, View } from 'react-native';

const logos = { apple:require('../assets/providers/apple-calendar.png'), google:require('../assets/providers/google-calendar.png'), notion:require('../assets/providers/notion.png') };
const names = { apple:'Apple Calendar', google:'Google Calendar', notion:'Notion' };
const korean = { notion:'노션', google:'구글 캘린더' };
export function ProviderIcon({provider,size=48}) {
  if(!logos[provider])return null;
  return <View pointerEvents="none" style={{width:size,height:size,borderRadius:size*.2,overflow:'hidden',flexShrink:0}}><Image source={logos[provider]} accessible={false} resizeMode="contain" style={{width:size,height:size,transform:[{scale:provider==='apple'?1.22:1}]}}/></View>;
}
export function SourceIcons({todo,size=16}) {
  const sources=todo.integration?.sources||[];
  const providers=[...new Set((sources.length?sources.map(s=>s.provider):[todo.integration?.provider||(todo.origin?.type==='external'?todo.origin.provider:null)]).filter(p=>logos[p]))];
  if(!providers.length)return null;
  return <View pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={'출처: '+providers.map(p=>names[p]).join(', ')} style={{flexDirection:'row',alignItems:'center',gap:size<12?2:4,flexShrink:0}}>{providers.map(p=><ProviderIcon key={p} provider={p} size={size}/>)}</View>;
}
// A to-do brought in from Notion / Google Calendar: its logo at the end of the line; a tap opens the original.
// It is its own touch target, so the tap never reaches the line (no editing, selecting or carrying).
export function SourceMark({todo,size=14,hitSlop=8,style}) {
  const o=todo.origin;
  if(o?.type!=='external'||!korean[o.provider])return <SourceIcons todo={todo} size={size}/>;
  const url=/^https?:\/\//.test(o.url||'')?o.url:null;
  if(!url)return <View accessible accessibilityRole="image" accessibilityLabel={'출처: '+korean[o.provider]} style={style}><ProviderIcon provider={o.provider} size={size}/></View>;
  return <Pressable accessibilityRole="link" accessibilityLabel={korean[o.provider]+'에서 열기'} hitSlop={hitSlop} onPress={()=>Linking.openURL(url).catch(()=>{})} style={({pressed})=>[{opacity:pressed?.5:1},style]}><ProviderIcon provider={o.provider} size={size}/></Pressable>;
}
