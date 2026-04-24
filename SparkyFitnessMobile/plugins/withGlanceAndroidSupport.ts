import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const FALLBACK_KOTLIN_VERSION = '2.1.20';

const KOTLIN_COMPOSE_PLUGIN =
  'apply plugin: "org.jetbrains.kotlin.plugin.compose"';
const KOTLIN_ANDROID_PLUGIN = 'apply plugin: "org.jetbrains.kotlin.android"';

const GLANCE_APPWIDGET_DEP =
  '    implementation("androidx.glance:glance-appwidget:1.1.1")';
const GLANCE_MATERIAL3_DEP =
  '    implementation("androidx.glance:glance-material3:1.1.1")';

async function resolveKotlinVersion(projectRoot: string): Promise<string> {
  const catalogPath = path.join(
    projectRoot,
    'node_modules/react-native/gradle/libs.versions.toml',
  );
  try {
    const catalog = await fs.promises.readFile(catalogPath, 'utf8');
    const match = catalog.match(/^\s*kotlin\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? FALLBACK_KOTLIN_VERSION;
  } catch {
    return FALLBACK_KOTLIN_VERSION;
  }
}

function composeCompilerClasspath(kotlinVersion: string): string {
  return `classpath('org.jetbrains.kotlin:compose-compiler-gradle-plugin:${kotlinVersion}')`;
}

function addComposeCompilerClasspath(
  src: string,
  kotlinVersion: string,
): string {
  const existingComposeCompiler = src.match(
    /classpath\(['"]org\.jetbrains\.kotlin:compose-compiler-gradle-plugin:[^'"]+['"]\)/,
  );
  if (existingComposeCompiler) {
    return src.replace(
      existingComposeCompiler[0],
      composeCompilerClasspath(kotlinVersion),
    );
  }

  const anchor = src.match(
    /(classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin['"]\))/,
  );
  if (!anchor || anchor.index === undefined) {
    throw new Error(
      '[withGlanceAndroidSupport] Could not find kotlin-gradle-plugin classpath in root android/build.gradle.',
    );
  }
  const lineStart = src.lastIndexOf('\n', anchor.index) + 1;
  const indent = src.slice(lineStart, anchor.index);
  const insertAt = anchor.index + anchor[0].length;
  return `${src.slice(0, insertAt)}\n${indent}${composeCompilerClasspath(
    kotlinVersion,
  )}${src.slice(insertAt)}`;
}

function applyKotlinComposePlugin(src: string): string {
  if (src.includes(KOTLIN_COMPOSE_PLUGIN)) return src;
  const anchor = `${KOTLIN_ANDROID_PLUGIN}\n`;
  if (!src.includes(anchor)) {
    throw new Error(
      '[withGlanceAndroidSupport] Could not find kotlin-android plugin line in app/build.gradle.',
    );
  }
  return src.replace(anchor, `${anchor}${KOTLIN_COMPOSE_PLUGIN}\n`);
}

function enableComposeBuildFeature(src: string): string {
  if (/buildFeatures\s*\{[^}]*\bcompose\s+true\b/.test(src)) return src;

  const existingBuildFeatures = src.match(/(^[ \t]*)buildFeatures\s*\{\s*\n/m);
  if (existingBuildFeatures) {
    const indent = existingBuildFeatures[1];
    return src.replace(
      existingBuildFeatures[0],
      `${existingBuildFeatures[0]}${indent}    compose true\n`,
    );
  }

  const androidBlock = src.match(/(^|\n)android\s*\{\s*\n/);
  if (!androidBlock || androidBlock.index === undefined) {
    throw new Error(
      '[withGlanceAndroidSupport] Could not find android { } block in app/build.gradle.',
    );
  }
  const insertAt = androidBlock.index + androidBlock[0].length;
  return `${src.slice(
    0,
    insertAt,
  )}    buildFeatures {\n        compose true\n    }\n${src.slice(insertAt)}`;
}

function injectGlanceDependencies(src: string): string {
  const needsAppwidget = !src.includes('androidx.glance:glance-appwidget');
  const needsMaterial3 = !src.includes('androidx.glance:glance-material3');
  if (!needsAppwidget && !needsMaterial3) return src;

  const depsMatch = src.match(/\ndependencies\s*\{\s*\n/);
  if (!depsMatch || depsMatch.index === undefined) {
    throw new Error(
      '[withGlanceAndroidSupport] Could not find top-level dependencies { } block in app/build.gradle.',
    );
  }
  const insertAt = depsMatch.index + depsMatch[0].length;
  const lines: string[] = [];
  if (needsAppwidget) lines.push(GLANCE_APPWIDGET_DEP);
  if (needsMaterial3) lines.push(GLANCE_MATERIAL3_DEP);
  return `${src.slice(0, insertAt)}${lines.join('\n')}\n${src.slice(insertAt)}`;
}

const withGlanceAndroidSupport: ConfigPlugin = config => {
  return withDangerousMod(config, [
    'android',
    async config => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const kotlinVersion = await resolveKotlinVersion(projectRoot);

      const rootGradleFile = path.join(platformRoot, 'build.gradle');
      let rootSrc = await fs.promises.readFile(rootGradleFile, 'utf8');
      rootSrc = addComposeCompilerClasspath(rootSrc, kotlinVersion);
      await fs.promises.writeFile(rootGradleFile, rootSrc, 'utf8');

      const appGradleFile = path.join(platformRoot, 'app/build.gradle');
      let appSrc = await fs.promises.readFile(appGradleFile, 'utf8');
      appSrc = applyKotlinComposePlugin(appSrc);
      appSrc = enableComposeBuildFeature(appSrc);
      appSrc = injectGlanceDependencies(appSrc);
      await fs.promises.writeFile(appGradleFile, appSrc, 'utf8');

      return config;
    },
  ]);
};

export default withGlanceAndroidSupport;
