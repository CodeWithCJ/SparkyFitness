const { getIosAppGroup } = require('../../app.identifiers.js');
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
  const appGroup = getIosAppGroup();
  syncInfoPlist(appGroup);

  return {
    type: 'widget',
    name: 'CalorieTracker',
    icon: '../../assets/icons/adaptiveicon.png',
    entitlements: {
      'com.apple.security.application-groups': [appGroup],
    },
  };
};
