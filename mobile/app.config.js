module.exports = ({ config }) => {
  const demo = process.env.EAS_BUILD_PROFILE !== 'production';
  return {
    ...config,
    name: '체커',
    ios: { ...config.ios, infoPlist: { ...config.ios.infoPlist, NSAppTransportSecurity: demo ? { NSAllowsArbitraryLoads: true } : { NSAllowsLocalNetworking: true } } },
    extra: { ...config.extra, ...(demo ? { demoServerUrl: 'http://192.168.150.151:8787' } : {}) },
  };
};
