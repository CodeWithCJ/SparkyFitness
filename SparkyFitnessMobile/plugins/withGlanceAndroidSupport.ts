import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

// Must track the Kotlin version that react-native pins in
// node_modules/react-native/gradle/libs.versions.toml ("kotlin = ..."). The Compose
// compiler plugin is released in lockstep with Kotlin, so this artifact's version
// has to exactly match the Kotlin version Gradle resolves.
const KOTLIN_VERSION = '2.1.20';
const COMPOSE_COMPILER_CLASSPATH = `classpath('org.jetbrains.kotlin:compose-compiler-gradle-plugin:${KOTLIN_VERSION}')`;

const KOTLIN_COMPOSE_PLUGIN = 'apply plugin: "org.jetbrains.kotlin.plugin.compose"';
const KOTLIN_ANDROID_PLUGIN = 'apply plugin: "org.jetbrains.kotlin.android"';

const GLANCE_APPWIDGET_DEP =
  '    implementation("androidx.glance:glance-appwidget:1.1.1")';
const GLANCE_MATERIAL3_DEP =
  '    implementation("androidx.glance:glance-material3:1.1.1")';

function addComposeCompilerClasspath(src: string): string {
  if (src.includes('compose-compiler-gradle-plugin')) return src;
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
  return `${src.slice(0, insertAt)}\n${indent}${COMPOSE_COMPILER_CLASSPATH}${src.slice(insertAt)}`;
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

  const existingBuildFeatures = src.match(
    /(^[ \t]*)buildFeatures\s*\{\s*\n/m,
  );
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
  return `${src.slice(0, insertAt)}    buildFeatures {\n        compose true\n    }\n${src.slice(insertAt)}`;
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

const withGlanceAndroidSupport: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;

      const rootGradleFile = path.join(platformRoot, 'build.gradle');
      let rootSrc = await fs.promises.readFile(rootGradleFile, 'utf8');
      rootSrc = addComposeCompilerClasspath(rootSrc);
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
