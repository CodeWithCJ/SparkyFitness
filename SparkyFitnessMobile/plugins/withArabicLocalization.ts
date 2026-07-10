import {
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const ANDROID_LOCALES_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
  <locale android:name="ar-SA" />
  <locale android:name="en" />
</locale-config>
`;

const withArabicLocalization: ConfigPlugin = config => {
  config = withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application?.[0];

    if (application) {
      application.$['android:supportsRtl'] = 'true';
      application.$['android:localeConfig'] = '@xml/locales_config';
    }

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async config => {
      const filePath = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml/locales_config.xml',
      );

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, ANDROID_LOCALES_CONFIG);

      return config;
    },
  ]);

  config = withInfoPlist(config, config => {
    config.modResults.CFBundleLocalizations = ['ar', 'en'];
    config.modResults.CFBundleDevelopmentRegion = 'ar';
    config.modResults.CFBundleAllowMixedLocalizations = true;

    return config;
  });

  return config;
};

export default withArabicLocalization;
