module.exports = ({ config }) => {
  // Demo (ad hoc / preview) builds only. An over-the-air update (eas update) has no build profile and always carries the
  // store settings, so a demo setting can never reach people on the App Store / TestFlight build.
  const demo = ['demo', 'preview'].includes(process.env.EAS_BUILD_PROFILE);
  return {
    ...config,
    name: '체커',
    ios: { ...config.ios, infoPlist: { ...config.ios.infoPlist, NSAppTransportSecurity: demo ? { NSAllowsArbitraryLoads: true } : { NSAllowsLocalNetworking: true } } },
    extra: { ...config.extra, ...(demo ? { demoServerUrl: 'http://192.168.150.151:8787' } : {}) },
  };
};
