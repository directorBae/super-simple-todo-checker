// Store builds (production: TestFlight / App Store) get their reminders as pushes from the server, so they keep the
// `aps-environment` entitlement expo-notifications adds (EAS turns on Push Notifications for the app ID and signs with it).
// Demo builds (Ad Hoc, preview) schedule reminders on the device and must not carry it — their profile has no push —
// so it is dropped there. Mods run in reverse order, so this plugin is listed just before expo-notifications in
// app.json to run after it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) => withEntitlementsPlist(config, (c) => {
  if (process.env.EAS_BUILD_PROFILE !== 'production') delete c.modResults['aps-environment'];
  return c;
});
