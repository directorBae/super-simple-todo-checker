// PushKit VoIP pushes need the `voip` background mode (with `audio`, which the dive's call already uses).
const { withInfoPlist } = require('expo/config-plugins');

module.exports = (config) => withInfoPlist(config, (c) => {
  const modes = new Set(c.modResults.UIBackgroundModes || []);
  modes.add('audio');
  modes.add('voip');
  c.modResults.UIBackgroundModes = [...modes];
  return c;
});
