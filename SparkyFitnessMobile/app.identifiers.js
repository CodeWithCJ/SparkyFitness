// Shared identifiers used by both app.config.ts and Apple target configs
// (targets/*/expo-target.config.js). Keep as plain CommonJS — target configs
// can't load TypeScript/ESM.

const IOS_APP_GROUP_DEV = 'group.org.SparkyApps.SparkyFitnessMobile.dev';
const IOS_APP_GROUP_PROD = 'group.com.SparkyApps.SparkyFitnessMobile';

const isDevVariant = () => {
  const env = process.env.APP_VARIANT || 'dev';
  return env === 'dev' || env === 'development';
};

const getIosAppGroup = () => (isDevVariant() ? IOS_APP_GROUP_DEV : IOS_APP_GROUP_PROD);

module.exports = {
  IOS_APP_GROUP_DEV,
  IOS_APP_GROUP_PROD,
  isDevVariant,
  getIosAppGroup,
};
