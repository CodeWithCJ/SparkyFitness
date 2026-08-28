const { getIosAppGroup, isDevVariant, DEV_BUNDLE_IDENTIFIER } = require('../../app.identifiers.js');
const fs = require('fs');
const path = require('path');

const escapePlistString = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// URL scheme complications use to open this app on a specific page. Must stay
// in step with `WatchDeepLink.scheme` (targets/watch/WatchDeepLink.swift) and
// `ComplicationLink.scheme` (targets/watch-widget/ComplicationLinks.swift) —
// three copies, because a JS config and two separately-compiled Swift targets
// have no way to share a constant.
const WATCH_URL_SCHEME = 'sparkyfitness-watch';

// Mirrors targets/widget/expo-target.config.js's syncInfoPlist: makes the app
// group readable at Swift runtime via Bundle.main, since declaring it in
// `entitlements` below only wires up code-signing, not an Info.plist key.
//
// Also registers the deep-link scheme. This target is built with
// GENERATE_INFOPLIST_FILE = YES and INFOPLIST_FILE pointing at this file, so
// Xcode merges its generated keys on top of what's written here rather than
// replacing it.
const syncInfoPlist = (appGroup, bundleIdentifier) => {
  const plistPath = path.join(__dirname, 'Info.plist');
  fs.writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>APP_GROUP_IDENTIFIER</key>
    <string>${escapePlistString(appGroup)}</string>
    <key>CFBundleURLTypes</key>
    <array>
      <dict>
        <key>CFBundleURLName</key>
        <string>${escapePlistString(bundleIdentifier)}</string>
        <key>CFBundleURLSchemes</key>
        <array>
          <string>${escapePlistString(WATCH_URL_SCHEME)}</string>
        </array>
      </dict>
    </array>
  </dict>
</plist>
`,
  );
};

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const isDev = isDevVariant();
  const appGroup = getIosAppGroup();
  // Convention for watchOS companion apps: "<phone-bundle-id>.watchkitapp".
  const bundleIdentifier = isDev
    ? `${DEV_BUNDLE_IDENTIFIER}.watchkitapp`
    : 'com.SparkyApps.SparkyFitnessMobile.watchkitapp';
  syncInfoPlist(appGroup, bundleIdentifier);

  return {
    type: 'watch',
    name: 'SparkyFitness Watch',
    bundleIdentifier,
    // Reuses the phone app's adaptive icon for now — swap for a dedicated
    // Watch icon (has its own required sizes) once the design is settled.
    icon: '../../assets/icons/adaptiveicon.png',
    // watchOS 10 is the floor for the SwiftUI APIs used in this target.
    // Lower this if your physical Watch is running an older watchOS.
    deploymentTarget: '10.0',
    // Needed so the Daily Energy Goal complication (targets/watch-widget, a
    // separate process) can read what this app writes — WatchConnectivity
    // delivers into this app, but a widget extension can't see this app's
    // own private storage, only shared App Group storage. Reuses the same
    // group id as the phone's widgets; that's harmless, App Groups don't
    // sync across physical devices anyway, this is just a naming convention.
    // Confirmed working on Adam's free Personal Team (2026-08-17) — the
    // "requires a paid account" caveat this comment used to carry doesn't
    // apply.
    entitlements: {
      'com.apple.security.application-groups': [appGroup],
    },
  };
};
