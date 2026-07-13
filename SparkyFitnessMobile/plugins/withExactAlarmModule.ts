// Registers the ExactAlarm native module (exact-alarm special-access helpers
// for the rest-complete ping). Simplified sibling of withCalorieWidget: plain
// .kt sources (no {{APPLICATION_ID}} templating), no resources, no manifest
// receivers — just the source copy and the MainApplication registration.
import {
  ConfigPlugin,
  withDangerousMod,
  withMainApplication,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const MODULE_PACKAGE = 'com.sparkyapps.sparkyfitness.exactalarm';
const MODULE_PACKAGE_IMPORT = `import ${MODULE_PACKAGE}.ExactAlarmPackage`;
const MODULE_PACKAGE_ADD_LINE = 'add(ExactAlarmPackage())';

const SOURCE_DIR_NAME = 'targets/android-exact-alarm';
const KOTLIN_SUBDIR = 'kotlin';

async function copyTree(srcDir: string, destDir: string): Promise<void> {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });
  await fs.promises.mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, path.join(destDir, entry.name));
    } else {
      await fs.promises.copyFile(srcPath, path.join(destDir, entry.name));
    }
  }
}

const withExactAlarmModule: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const kotlinSrc = path.join(projectRoot, SOURCE_DIR_NAME, KOTLIN_SUBDIR);
      const kotlinDest = path.join(platformRoot, 'app/src/main/java');

      await copyTree(kotlinSrc, kotlinDest);

      return config;
    },
  ]);

  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    if (!src.includes(MODULE_PACKAGE_IMPORT)) {
      const importBlockMatch = src.match(/((?:^import [^\n]+\n)+)/m);
      if (importBlockMatch) {
        const block = importBlockMatch[1];
        src = src.replace(block, `${block}${MODULE_PACKAGE_IMPORT}\n`);
      } else {
        src = `${MODULE_PACKAGE_IMPORT}\n${src}`;
      }
    }

    if (!src.includes(MODULE_PACKAGE_ADD_LINE)) {
      const applyMatch = src.match(
        /PackageList\(this\)\.packages\.apply\s*\{\s*\n/,
      );
      if (applyMatch && applyMatch.index !== undefined) {
        const insertAt = applyMatch.index + applyMatch[0].length;
        src =
          src.slice(0, insertAt) +
          `              ${MODULE_PACKAGE_ADD_LINE}\n` +
          src.slice(insertAt);
      } else {
        throw new Error(
          '[withExactAlarmModule] Could not locate PackageList(this).packages.apply { block in MainApplication.',
        );
      }
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};

export default withExactAlarmModule;
