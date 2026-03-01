import {
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
} from '@expo/config-plugins';
import fs from 'fs';
import path from 'path';

const withNetworkSecurityConfig: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const filePath = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml/network_security_config.xml'
      );

      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      fs.writeFileSync(
        filePath,
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>`
      );

      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];

    if (app) {
      app.$['android:networkSecurityConfig'] =
        '@xml/network_security_config';
    }

    return config;
  });

  return config;
};

export default withNetworkSecurityConfig;