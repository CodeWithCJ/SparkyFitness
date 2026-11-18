const {
  getIosAppGroup,
  isDevVariant,
  DEV_BUNDLE_IDENTIFIER,
} = require('../../app.identifiers.js');
const fs = require('fs');
const path = require('path');

const escapePlistString = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

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
    <key>SparkyKeychainGroup</key>
    <string>$(AppIdentifierPrefix)${escapedAppGroup}</string>
    <key>NSExtension</key>
    <dict>
      <key>NSExtensionPointIdentifier</key>
      <string>com.apple.widgetkit-extension</string>
    </dict>
  </dict>
</plist>
`
  );
};

// ShortcutIntents.swift presents the TLS client certificate through
// ClientCertificateIdentity, which lives with its module. Every Swift file in
// this folder is compiled into the widget extension, so a copy is written here
// (git-ignored, like Info.plist) each time the config is evaluated.
const CLIENT_CERTIFICATE_SOURCE = 'ClientCertificateIdentity.swift';

const syncClientCertificateSource = () => {
  fs.copyFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'modules',
      'client-certificate',
      'ios',
      CLIENT_CERTIFICATE_SOURCE
    ),
    path.join(__dirname, CLIENT_CERTIFICATE_SOURCE)
  );
};

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const appGroup = getIosAppGroup();
  const isDev = isDevVariant();
  syncInfoPlist(appGroup);
  syncClientCertificateSource();

  return {
    type: 'widget',
    name: 'CalorieTracker',
    // Dev builds read "DevSparkyFitness" so they differ from the production app.
    ...(isDev ? { displayName: 'DevSparkyFitness' } : {}),
    bundleIdentifier: isDev
      ? `${DEV_BUNDLE_IDENTIFIER}.widget`
      : 'com.SparkyApps.SparkyFitnessMobile.widget',
    icon: '../../assets/icons/adaptiveicon.png',
    entitlements: {
      'com.apple.security.application-groups': [appGroup],
      'keychain-access-groups': [`$(AppIdentifierPrefix)${appGroup}`],
    },
  };
};
