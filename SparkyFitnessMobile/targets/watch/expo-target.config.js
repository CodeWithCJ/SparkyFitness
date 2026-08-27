const { isDevVariant, DEV_BUNDLE_IDENTIFIER } = require('../../app.identifiers.js');

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const isDev = isDevVariant();

  return {
    type: 'watch',
    name: 'SparkyFitness Watch',
    // Convention for watchOS companion apps: "<phone-bundle-id>.watchkitapp".
    bundleIdentifier: isDev
      ? `${DEV_BUNDLE_IDENTIFIER}.watchkitapp`
      : 'com.SparkyApps.SparkyFitnessMobile.watchkitapp',
    // Reuses the phone app's adaptive icon for now — swap for a dedicated
    // Watch icon (has its own required sizes) once the design is settled.
    icon: '../../assets/icons/adaptiveicon.png',
    // watchOS 10 is the floor for the SwiftUI APIs used in this target.
    // Lower this if your physical Watch is running an older watchOS.
    deploymentTarget: '10.0',
    // No App Groups here on purpose: Phase 1's WatchConnectivity ping/pong
    // is live messaging, not shared persistent storage, so it doesn't need
    // one — and App Groups requires a paid Apple Developer Program account
    // (unavailable on a free Personal Team). Revisit if a later phase needs
    // shared UserDefaults between the phone and watch.
  };
};
