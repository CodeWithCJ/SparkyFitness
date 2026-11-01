// jest-expo's Android preset has no mock for the ExpoLightSensor native
// module, so any file that imports expo-sensors fails to load under
// `pnpm run test:android`. The light sensor is unused by the app.
module.exports = {
  default: {
    addListener: () => ({ remove() {} }),
    removeAllListeners() {},
    removeSubscription() {},
    setUpdateInterval() {},
    isAvailableAsync: async () => false,
    getPermissionsAsync: async () => ({ granted: false }),
    requestPermissionsAsync: async () => ({ granted: false }),
  },
};
