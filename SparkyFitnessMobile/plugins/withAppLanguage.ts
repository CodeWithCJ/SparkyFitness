import {
  ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

export const APPCOMPAT_DEPENDENCY = 'implementation("androidx.appcompat:appcompat:1.7.0")';
const LANGUAGE_PACKAGE = 'com.sparkyapps.sparkyfitness.language';
export const LANGUAGE_IMPORT = `import ${LANGUAGE_PACKAGE}.AppLanguagePackage`;
export const LANGUAGE_ADD_LINE = 'add(AppLanguagePackage())';
const SOURCE_DIR = 'targets/android-language/kotlin';

export interface AndroidAppBuildGradle {
  language?: string;
  contents: string;
}

export function addAppBuildDependency(src: string): string {
  if (src.includes(APPCOMPAT_DEPENDENCY)) return src;

  const dependenciesMatch = src.match(/\ndependencies\s*\{\s*\n/);
  if (!dependenciesMatch || dependenciesMatch.index === undefined) {
    throw new Error('[withAppLanguage] Could not find dependencies block in app/build.gradle.');
  }

  const insertAt = dependenciesMatch.index + dependenciesMatch[0].length;
  return (
    src.slice(0, insertAt) +
    `    ${APPCOMPAT_DEPENDENCY}\n` +
    src.slice(insertAt)
  );
}

export function addAppLocalesService(
  application: AndroidManifestApplication | undefined,
): AndroidManifestApplication | undefined {
  if (!application) return application;

  const existing = application.service?.find(
    (entry) => entry.$?.['android:name'] === APPCOMPAT_SERVICE,
  );

  const service = {
    $: {
      'android:name': APPCOMPAT_SERVICE,
      'android:enabled': 'false',
      'android:exported': 'false',
    },
    'meta-data': [
      {
        $: {
          'android:name': 'autoStoreLocales',
          'android:value': 'true',
        },
      },
    ],
  };

  if (!existing) {
    application.service = application.service ?? [];
    application.service.push(service as never);
  } else {
    existing.$ = service.$;
  }
  return application;
}

export function installAppLanguagePackage(source: string): string {
  let next = source;
  if (!next.includes(LANGUAGE_IMPORT)) {
    const importBlock = next.match(/((?:^import [^\n]+\n)+)/m);
    next = importBlock
      ? next.replace(importBlock[1], `${importBlock[1]}${LANGUAGE_IMPORT}\n`)
      : `${LANGUAGE_IMPORT}\n${next}`;
  }

  if (!next.includes(LANGUAGE_ADD_LINE)) {
    const packageList = next.match(/PackageList\(this\)\.packages\.apply\s*\{\s*\n/);
    if (!packageList || packageList.index === undefined) {
      throw new Error('[withAppLanguage] Could not locate PackageList packages block.');
    }
    const insertAt = packageList.index + packageList[0].length;
    next = `${next.slice(0, insertAt)}              ${LANGUAGE_ADD_LINE}\n${next.slice(insertAt)}`;
  }
  return next;
}

export interface AndroidManifestApplication {
  $?: Record<string, string>;
  name?: string;
  'meta-data'?: { $?: Record<string, string> }[];
  service?: { $?: Record<string, string>; 'meta-data'?: { $?: Record<string, string> }[] }[];
}

const APPCOMPAT_SERVICE = 'androidx.appcompat.app.AppLocalesMetadataHolderService';

async function copyTree(srcDir: string, destDir: string): Promise<void> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  await fs.promises.mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

const withAppLanguage: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const sourceRoot = path.join(config.modRequest.projectRoot, SOURCE_DIR);
      const destinationRoot = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
      );
      await copyTree(sourceRoot, destinationRoot);
      return config;
    },
  ]);

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config;
    config.modResults.contents = addAppBuildDependency(config.modResults.contents);
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    addAppLocalesService(application);
    return config;
  });

  config = withMainApplication(config, (config) => {
    config.modResults.contents = installAppLanguagePackage(config.modResults.contents);
    return config;
  });

  return config;
};

export default withAppLanguage;
