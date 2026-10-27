import React, { useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from '../text.js';
import Constants from 'expo-constants';
import { useDb } from '../store.js';
import { useDesign, Button, Surface } from '../design.js';
export function ServerLoginForm({ onDone }) {
  const { db, api } = useDb(), d = useDesign();
  const [url, setUrl] = useState(db.settings.sync.url || Constants.expoConfig?.extra?.demoServerUrl || '');
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [useCode, setUseCode] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true); setError('');
    try {
      const r = useCode ? await api.pairServer(url, code) : await api.loginServer(url, password);
      if (!r.ok) { setError(r.error); return; }
      setPassword(''); setCode('');
      await api.syncNow();
      onDone?.();
    } finally { setBusy(false); }
  };
  return <View style={{ gap: 14 }}>
    <Text style={{ color:d.text, fontSize:16, fontWeight:'700' }}>내 서버에 로그인</Text>
    <Text style={{ color:d.muted, lineHeight:21 }}>모바일에서 바로 시작할 수 있어요. 같은 서버에 연결하면 다른 기기에서도 같은 할 일을 볼 수 있습니다.</Text>
    <TextInput accessibilityLabel="서버 주소" placeholder="http://192.168.0.10:8787" placeholderTextColor={d.muted} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ padding:15, color:d.text, backgroundColor:d.input, borderRadius:14 }}/>
    {useCode ? <><Text style={{color:d.muted,fontSize:12}}>이미 연결된 PC 앱에서 발급한 코드가 있을 때만 사용하세요.</Text><TextInput accessibilityLabel="연결 코드" placeholder="6자리 연결 코드" placeholderTextColor={d.muted} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} style={{padding:15,color:d.text,backgroundColor:d.input,borderRadius:14,letterSpacing:5,fontSize:22}}/></> :
      <><TextInput accessibilityLabel="서버 비밀번호" placeholder="서버 비밀번호" placeholderTextColor={d.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" style={{padding:15,color:d.text,backgroundColor:d.input,borderRadius:14}}/><Text style={{color:d.muted,fontSize:12,lineHeight:18}}>서버를 처음 설치할 때 준비한 비밀번호를 입력하세요. 처음 연결할 때만 입력하면 됩니다.</Text></>}
    <Button title={busy?'로그인 중…':'로그인'} primary disabled={busy || (useCode ? code.length!==6 : !password)} onPress={connect}/>
    <Button title={useCode?'비밀번호로 로그인':'다른 기기의 연결 코드 사용'} onPress={()=>{setUseCode(!useCode);setError('');}}/>
    {!!error&&<Text accessibilityRole="alert" style={{color:'#cc4057'}}>{error}</Text>}
  </View>;
}
export default function Settings() {
  const {db,api}=useDb(),d=useDesign(),[message,setMessage]=useState(''),[reconnect,setReconnect]=useState(false),s=db.settings.sync;
  return <View style={{gap:16}}>{s.token&&!reconnect?<Surface contentStyle={{padding:18,gap:12}}><Text style={{color:d.text,fontSize:18,fontWeight:'700'}}>내 서버와 동기화</Text><Text style={{color:d.muted,fontSize:12}}>{s.url}</Text><Text style={{color:d.muted}}>{s.error||(s.lastSync?'마지막 연결 '+new Date(s.lastSync).toLocaleTimeString():'연결 중…')}</Text><Button title="지금 동기화" onPress={async()=>{const r=await api.syncNow();setMessage(r.ok?'동기화 완료':r.error);}}/><Button title="서버 다시 연결" onPress={()=>setReconnect(true)}/>{!!message&&<Text style={{color:d.muted}}>{message}</Text>}</Surface>:<ServerLoginForm onDone={()=>setReconnect(false)}/>}</View>;
}
