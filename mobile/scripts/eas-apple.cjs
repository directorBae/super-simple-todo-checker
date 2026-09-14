// Temporary workaround for https://github.com/expo/eas-cli/issues/4392.
// EAS 24.3.0 / @expo/apple-utils 2.2.0 requests a retired Apple config endpoint.
// This is Apple's PUBLIC App Store Connect widget identifier, not a user secret.
// Verified against Apple's production login configuration on 2026-09-14:
const configurationUrl = 'https://unpkg.apple.com/@maison/preauthorization-container@0.2.1/umd/chunks/ASC.BRGDgul9.js';
const publicWidgetKey = 'e0b80c3bf78523bfe80974d320935bfa30add02e1bff88ec2166c6bd5a706c42';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const commands = {
  register: ['device:create'],
  build: ['build', '--platform', 'ios', '--profile', 'demo'],
};

async function main() {
  const action = process.argv[2];
  if (action === 'check') {
    const config = await fetch(configurationUrl, { signal: AbortSignal.timeout(20000) });
    if (!config.ok || !(await config.text()).includes(publicWidgetKey)) {
      throw new Error('Apple public login configuration changed. Review the workaround before using it.');
    }
    const login = await fetch('https://idmsa.apple.com/appleauth/auth/signin?widgetKey=' + publicWidgetKey, {
      signal: AbortSignal.timeout(20000),
    });
    if (!login.ok) throw new Error('Apple login page returned HTTP ' + login.status);
    console.log('Apple public widget configuration and login page: OK. No account login attempted.');
    return;
  }
  if (!Object.hasOwn(commands, action)) throw new Error('Usage: node scripts/eas-apple.cjs register|build|check');
  console.log('Using the Apple public-widget workaround. Continue with normal Apple login and 2FA.');
  // Only fixed command arguments enter the Windows shell; no credentials are command arguments.
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'eas-cli@24.3.0', ...commands[action]], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_APP_STORE_AUTH_SERVICE_KEY: publicWidgetKey },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
