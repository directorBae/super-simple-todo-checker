import React from 'react';
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native';

// Every label and field in the app is set in Pretendard (embedded by the expo-font plugin in app.json,
// weights 400–800). Screens import Text/TextInput from here instead of react-native.
export const FONT = 'Pretendard';
const font = { fontFamily: FONT };

export function Text({ style, ...props }) {
  return <NativeText {...props} style={[font, style]} />;
}

export function TextInput({ style, ...props }) {
  return <NativeTextInput {...props} style={[font, style]} />;
}
