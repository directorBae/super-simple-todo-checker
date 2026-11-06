import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// 팀버전 dives (group calls): LiveKit needs the WebRTC globals set up before anything uses it.
if (Platform.OS !== 'web') require('@livekit/react-native').registerGlobals();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
