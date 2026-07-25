// Shared identifiers used by both app.config.ts and Apple target configs
// (targets/*/expo-target.config.js). Keep as plain CommonJS — target configs
// can't load TypeScript/ESM.

const DEV_BUNDLE_IDENTIFIER = process.env.EXPO_DEV_BUNDLE_IDENTIFIER || 'org.SparkyApps.SparkyFitnessMobile1.dev';
const IOS_APP_GROUP_DEV = process.env.IOS_APP_GROUP_DEV || 'group.org.SparkyApps.SparkyFitnessMobile1.dev';
const IOS_APP_GROUP_PROD = process.env.IOS_APP_GROUP_PROD || 'group.com.SparkyApps.SparkyFitnessMobile.shared';

const isDevVariant = () => {
  const env = process.env.APP_VARIANT || 'dev';
  return env === 'dev' || env === 'development';
};

const getIosAppGroup = () => (isDevVariant() ? IOS_APP_GROUP_DEV : IOS_APP_GROUP_PROD);

module.exports = {
  DEV_BUNDLE_IDENTIFIER,
  IOS_APP_GROUP_DEV,
  IOS_APP_GROUP_PROD,
  isDevVariant,
  getIosAppGroup,
};
