// Reminders are scheduled on the device (local notifications), which need no remote-push entitlement.
// expo-notifications adds `aps-environment` anyway; drop it so the existing Ad Hoc/App Store profiles
// (without the Push Notifications capability) still sign the app.
// Mods run in reverse order, so this plugin is listed just before expo-notifications in app.json to run after it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) => withEntitlementsPlist(config, (c) => {
  delete c.modResults['aps-environment'];
  return c;
});
