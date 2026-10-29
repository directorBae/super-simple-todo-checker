import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

// Over-the-air updates (eas update --channel production): the app looks for one when it opens and whenever it comes
// back to the front; a new one is downloaded and the app restarts into it right away (nothing is being typed then —
// on iPhone the app is rarely started fresh, so waiting for the next cold start could take days). Native changes
// still need a new build: the runtime version is the app version (app.json).
export function startOta() {
  if (__DEV__ || !Updates.isEnabled) return () => {};
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const found = await Updates.checkForUpdateAsync();
      if (found.isAvailable) { await Updates.fetchUpdateAsync(); await Updates.reloadAsync(); }
    } catch {} // offline or the update server is down: try again next time
    finally { busy = false; }
  };
  check();
  const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
  return () => sub.remove();
}
