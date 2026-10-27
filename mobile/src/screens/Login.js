import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { useDesign, Surface, Button } from '../design.js';

// Email + password, one card on the wallpaper. Sign-up and log-in share the fields; the small link switches.
export default function Login() {
  const { api } = useDb(), d = useDesign();
  const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const passwordField = useRef(null);
  const signup = mode === 'signup';
  const run = async (task) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const submit = () => run(async () => {
    if (!signup) return api.signIn(email, password);
    const r = await api.signUp(email, password);
    if (r.confirm) { setMode('login'); setNotice('메일함에서 확인 링크를 누른 뒤 로그인해 주세요.'); }
  });
  const forgot = () => run(async () => {
    if (!email.trim()) throw new Error('이메일 주소를 확인해 주세요.');
    await api.recover(email); setNotice('재설정 메일을 보냈어요.');
  });
  const field = { padding: 15, fontSize: 15, color: d.text, backgroundColor: d.input, borderRadius: 14, borderWidth: 1, borderColor: d.edge };
  return <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight || 0 : 0 }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22 }}>
        <Surface native style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }} contentStyle={{ padding: 24, gap: 12 }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: d.accent, letterSpacing: -1, marginBottom: 8 }}>✓ 체커</Text>
          <TextInput accessibilityLabel="이메일" placeholder="이메일" placeholderTextColor={d.muted} value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="email"
            returnKeyType="next" onSubmitEditing={() => passwordField.current?.focus()} style={field} />
          <TextInput ref={passwordField} accessibilityLabel="비밀번호" placeholder="비밀번호" placeholderTextColor={d.muted} value={password} onChangeText={setPassword}
            secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType={signup ? 'newPassword' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'}
            returnKeyType="go" onSubmitEditing={() => { if (!busy) submit(); }} style={field} />
          {!!error && <Text style={{ color: '#cc4057', fontSize: 13 }}>{error}</Text>}
          {!!notice && <Text style={{ color: d.accent, fontSize: 13 }}>{notice}</Text>}
          <Button primary title={busy ? '잠시만요…' : signup ? '가입하기' : '로그인'} disabled={busy || !email.trim() || !password} onPress={submit} style={{ marginTop: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={() => { setMode(signup ? 'login' : 'signup'); setError(''); setNotice(''); }}>
              <Text style={{ color: d.accent, fontSize: 13, fontWeight: '600' }}>{signup ? '이미 계정이 있어요? 로그인' : '처음이에요? 가입하기'}</Text>
            </Pressable>
            {!signup && <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={forgot}><Text style={{ color: d.muted, fontSize: 13 }}>비밀번호를 잊었어요</Text></Pressable>}
          </View>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
    <StatusBar style="dark" />
  </SafeAreaView>;
}
