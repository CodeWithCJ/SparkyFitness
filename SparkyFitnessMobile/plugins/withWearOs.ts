import {
  ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withSettingsGradle,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const TEMPLATE_SUFFIX = '.tmpl';
const SOURCE_DIR_NAME = 'targets/wearos';
const WEAR_META_DATA_NAME = 'com.google.android.wearable.beta.app';
const WEAR_EMBED_GRADLE_MARKER = '// [withWearOs] embed Wear OS micro-APK';

async function copyTree(
  srcDir: string,
  destDir: string,
  transform?: (
    srcPath: string,
    contents: Buffer
  ) => { destName: string; contents: Buffer }
): Promise<void> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  await fs.promises.mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, path.join(destDir, entry.name), transform);
    } else {
      const raw = await fs.promises.readFile(srcPath);
      const { destName, contents } = transform
        ? transform(srcPath, raw)
        : { destName: entry.name, contents: raw };
      await fs.promises.writeFile(path.join(destDir, destName), contents);
    }
  }
}

const withWearOs: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const applicationId = modConfig.android?.package;
      if (!applicationId) {
        throw new Error(
          '[withWearOs] config.android.package must be set before this plugin runs.'
        );
      }
      const versionName = modConfig.version || '1.0.0';

      const projectRoot = modConfig.modRequest.projectRoot;
      const platformRoot = modConfig.modRequest.platformProjectRoot;
      const sourceRoot = path.join(projectRoot, SOURCE_DIR_NAME);
      const destRoot = path.join(platformRoot, 'wearos');

      await copyTree(sourceRoot, destRoot, (srcPath, contents) => {
        const base = path.basename(srcPath);
        if (base.endsWith(TEMPLATE_SUFFIX)) {
          const substituted = contents
            .toString('utf8')
            .replace(/\{\{APPLICATION_ID\}\}/g, applicationId)
            .replace(/\{\{VERSION_NAME\}\}/g, versionName);
          return {
            destName: base.slice(0, -TEMPLATE_SUFFIX.length),
            contents: Buffer.from(substituted, 'utf8'),
          };
        }
        return { destName: base, contents };
      });

      // Copy launcher icons (mipmap-*) from the phone app into the wearos module
      const appResDir = path.join(platformRoot, 'app/src/main/res');
      const wearResDir = path.join(destRoot, 'src/main/res');
      if (fs.existsSync(appResDir)) {
        const resEntries = await fs.promises.readdir(appResDir, {
          withFileTypes: true,
        });
        for (const entry of resEntries) {
          if (entry.isDirectory() && entry.name.startsWith('mipmap')) {
            await copyTree(
              path.join(appResDir, entry.name),
              path.join(wearResDir, entry.name)
            );
          }
        }
      }

      // Write phone-side Wear capability resource (res/values/wear.xml)
      const appValuesDir = path.join(appResDir, 'values');
      await fs.promises.mkdir(appValuesDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appValuesDir, 'wear.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string-array name="android_wear_capabilities" translatable="false">\n        <item>sparky_phone_companion</item>\n    </string-array>\n</resources>\n`,
        'utf8'
      );

      // Write android_wear_micro_apk.xml descriptor for embedded Wear OS APK
      const appXmlDir = path.join(appResDir, 'xml');
      await fs.promises.mkdir(appXmlDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appXmlDir, 'android_wear_micro_apk.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<wearableApp package="${applicationId}">\n    <versionCode>3007</versionCode>\n    <versionName>${versionName}</versionName>\n    <rawPathResId>android_wear_micro_apk</rawPathResId>\n</wearableApp>\n`,
        'utf8'
      );

      return modConfig;
    },
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const mainApp = modConfig.modResults.manifest.application?.[0];
    if (!mainApp) return modConfig;
    mainApp['meta-data'] = mainApp['meta-data'] ?? [];
    const existingIdx = mainApp['meta-data'].findIndex(
      (item) => item.$?.['android:name'] === WEAR_META_DATA_NAME
    );
    const entry = {
      $: {
        'android:name': WEAR_META_DATA_NAME,
        'android:resource': '@xml/android_wear_micro_apk',
      },
    };
    if (existingIdx >= 0) {
      mainApp['meta-data'][existingIdx] = entry;
    } else {
      mainApp['meta-data'].push(entry);
    }
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    if (!modConfig.modResults.contents.includes(WEAR_EMBED_GRADLE_MARKER)) {
      const snippet = `
${WEAR_EMBED_GRADLE_MARKER}
def sparkyReleaseStoreFile = findProperty('SPARKY_RELEASE_STORE_FILE') ?: findProperty('MYAPP_RELEASE_STORE_FILE') ?: System.getenv('SPARKY_RELEASE_STORE_FILE')
if (sparkyReleaseStoreFile) {
    android.signingConfigs {
        release {
            storeFile file(sparkyReleaseStoreFile)
            storePassword(findProperty('SPARKY_RELEASE_STORE_PASSWORD') ?: findProperty('MYAPP_RELEASE_STORE_PASSWORD') ?: System.getenv('SPARKY_RELEASE_STORE_PASSWORD'))
            keyAlias(findProperty('SPARKY_RELEASE_KEY_ALIAS') ?: findProperty('MYAPP_RELEASE_KEY_ALIAS') ?: System.getenv('SPARKY_RELEASE_KEY_ALIAS'))
            keyPassword(findProperty('SPARKY_RELEASE_KEY_PASSWORD') ?: findProperty('MYAPP_RELEASE_KEY_PASSWORD') ?: System.getenv('SPARKY_RELEASE_KEY_PASSWORD'))
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.release
}

def sparkyEmbedWearOsRelease = (project.findProperty("SPARKY_EMBED_WEAROS_RELEASE")?.toString() ?: System.getenv("SPARKY_EMBED_WEAROS_RELEASE"))?.toBoolean() == true

tasks.register("embedWearOsReleaseApk", Copy) {
    dependsOn(":wearos:assembleRelease")
    from(rootProject.file("wearos/build/outputs/apk/release/wearos-release.apk"))
    into(project.file("src/release/res/raw"))
    rename { "android_wear_micro_apk.apk" }
}

tasks.register("embedWearOsDebugApk", Copy) {
    dependsOn(":wearos:assembleDebug")
    from(rootProject.file("wearos/build/outputs/apk/debug/wearos-debug.apk"))
    into(project.file("src/debug/res/raw"))
    rename { "android_wear_micro_apk.apk" }
}

if (sparkyEmbedWearOsRelease) {
    tasks.matching { it.name == "mergeReleaseResources" || it.name == "generateReleaseResValues" }.configureEach {
        dependsOn("embedWearOsReleaseApk")
    }
}

tasks.matching { it.name == "mergeDebugResources" || it.name == "generateDebugResValues" }.configureEach {
    dependsOn("embedWearOsDebugApk")
}
`;
      modConfig.modResults.contents = `${modConfig.modResults.contents.trimEnd()}\n${snippet}`;
    }
    return modConfig;
  });

  config = withSettingsGradle(config, (modConfig) => {
    const includeLine = "include ':wearos'";
    if (!modConfig.modResults.contents.includes(includeLine)) {
      modConfig.modResults.contents = `${modConfig.modResults.contents.trimEnd()}\n${includeLine}\n`;
    }
    return modConfig;
  });

  return config;
};

export default withWearOs;
