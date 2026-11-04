// Runs the suite with Platform.OS === 'android' (`pnpm run test:android`).
// Diagnostic only, not part of CI: tests written for iOS-only behavior
// (Live Activities, HealthKit observers, native header items, the iOS
// language row) and tests that query `role: 'switch'` (the testing library
// only recognizes the iOS switch) are expected to fail here. Compare runs
// before and after a change to spot new Android-only failures.
const { jest: baseConfig } = require('./package.json');

module.exports = {
  ...baseConfig,
  preset: 'jest-expo/android',
  transform: {
    ...baseConfig.transform,
    // The platform presets drop the Babel options the default jest-expo
    // preset resolves, and this app has no Babel config file of its own.
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: ['babel-preset-expo'],
        caller: {
          name: 'metro',
          bundler: 'jest',
          platform: 'android',
          isServer: false,
          isReactServer: false,
        },
      },
    ],
  },
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    '^\\./ExpoLightSensor$':
      '<rootDir>/__tests__/helpers/expoLightSensorMock.js',
  },
};
