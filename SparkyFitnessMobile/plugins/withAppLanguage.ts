import {
  ConfigPlugin,
  withDangerousMod,
  withMainApplication,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const LANGUAGE_PACKAGE = 'com.sparkyapps.sparkyfitness.language';
export const LANGUAGE_IMPORT = `import ${LANGUAGE_PACKAGE}.AppLanguagePackage`;
export const LANGUAGE_ADD_LINE = 'add(AppLanguagePackage())';
const SOURCE_DIR = 'targets/android-language/kotlin';

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

/**
 * Installs the Android 13+ per-app language bridge:
 *  - copies the Kotlin AppLanguage module/package sources into the generated
 *    android project (idempotent: files are overwritten, never duplicated);
 *  - registers AppLanguagePackage in MainApplication (idempotent).
 *
 * No AppCompat dependency, AppLocalesMetadataHolderService, or autoStoreLocales
 * are used: Android 12 and below keep the language preference local to
 * SparkyFitness (stored preference + expo-localization + i18next).
 */
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

  config = withMainApplication(config, (config) => {
    config.modResults.contents = installAppLanguagePackage(config.modResults.contents);
    return config;
  });

  return config;
};

export default withAppLanguage;
