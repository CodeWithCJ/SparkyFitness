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

// Mirrors targets/widget/expo-target.config.js: makes the app group readable
// at Swift runtime via Bundle.main (declaring it under `entitlements` below
// only wires up code-signing, not a runtime-visible Info.plist key), and
// declares the WidgetKit extension point up front. The apple-targets plugin
// only writes an Info.plist here if one doesn't already exist, so writing it
// ourselves at config-eval time is what makes it stick.
const syncInfoPlist = (appGroup) => {
  const plistPath = path.join(__dirname, 'Info.plist');
  const escapedAppGroup = escapePlistString(appGroup);
  fs.writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>APP_GROUP_IDENTIFIER</key>
    <string>${escapedAppGroup}</string>
    <key>NSExtension</key>
    <dict>
      <key>NSExtensionPointIdentifier</key>
      <string>com.apple.widgetkit-extension</string>
    </dict>
  </dict>
</plist>
`,
  );
};

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const isDev = isDevVariant();
  const appGroup = getIosAppGroup();
  syncInfoPlist(appGroup);

  return {
    // First-class type for a watchOS complication extension — auto-includes
    // WidgetKit/SwiftUI and (per its own default) reuses the app's App Group,
    // which the explicit `entitlements` below makes unambiguous.
    type: 'watch-widget',
    name: 'SparkyFitness Watch Widget',
    // Convention: "<watch-app-bundle-id>.watch-widget", same relationship
    // targets/widget has to the phone app.
    bundleIdentifier: isDev
      ? `${DEV_BUNDLE_IDENTIFIER}.watchkitapp.watch-widget`
      : 'com.SparkyApps.SparkyFitnessMobile.watchkitapp.watch-widget',
    // Deliberately no `icon` here. @bacons/apple-targets only special-cases
    // watchOS's single-1024/universal icon format for `type: 'watch'`; every
    // other type (including this one) falls through to its generic
    // iPhone/iPad multi-size icon generator, which Xcode then rejects on a
    // watchOS-hosted target ("AppIcon... did not have any applicable
    // content") since none of those idioms apply on watchOS. Omitting `icon`
    // skips ASSETCATALOG_COMPILER_APPICON_NAME entirely, so Xcode never
    // requires/validates an AppIcon set for this target — WidgetKit
    // complications don't need one; the Watch Face picker previews the
    // complication's own rendered view, not an app icon.
    // Must match targets/watch's deploymentTarget — the plugin only detects
    // a target as a watch-widget when WATCHOS_DEPLOYMENT_TARGET is present.
    deploymentTarget: '10.0',
    // Shares the phone/widget app group so a future version could read the
    // same shared storage; today only EnergyGoalSync (targets/watch) writes
    // to it and this target only reads.
    entitlements: {
      'com.apple.security.application-groups': [appGroup],
    },
  };
};
