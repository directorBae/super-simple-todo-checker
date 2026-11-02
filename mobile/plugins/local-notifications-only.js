// Store builds (TestFlight / App Store) get their reminders as pushes from the server, so they keep the
// `aps-environment` entitlement expo-notifications adds — by default, so EAS sees it when it lines up the app ID's
// capabilities and makes the provisioning profile on this computer, not only on the build server.
// Demo builds (Ad Hoc, preview) schedule reminders on the device and must not carry it — their profile has no push —
// so their eas.json profiles set APP_PUSH=off and it is dropped there. Mods run in reverse order, so this plugin is
// listed just before expo-notifications in app.json to run after it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) => withEntitlementsPlist(config, (c) => {
  if (process.env.APP_PUSH === 'off') delete c.modResults['aps-environment'];
  return c;
});
