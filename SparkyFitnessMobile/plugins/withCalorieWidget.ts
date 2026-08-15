// Pattern for adding another Glance widget (macro, etc.):
//   1. Drop FooWidget.kt.tmpl + FooWidgetReceiver.kt.tmpl next to the calorie pair
//      (each receiver owns its own PREFS_* namespace and its own composable).
//   2. Add res/xml/sparky_foo_widget_info.xml.
//   3. Extend this plugin (or, once we see what varies, generalize it into
//      withAndroidGlanceWidget.ts parameterized by class name + info XML) to
//      register the new receiver in the manifest.
//   4. Extend CalorieWidgetBridge.ts with a kind-aware reload (or add a second
//      native method) so useWidgetSync can target a specific widget.
import {
  ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const WIDGET_PACKAGE = 'com.sparkyapps.sparkyfitness.widget';
const WIDGET_PACKAGE_IMPORT = `import ${WIDGET_PACKAGE}.CalorieWidgetPackage`;
const WIDGET_PACKAGE_ADD_LINE = 'add(CalorieWidgetPackage())';

const WIDGET_RECEIVERS = [
  {
    name: `${WIDGET_PACKAGE}.CalorieWidgetReceiver`,
    label: '@string/sparky_calorie_widget_name',
    provider: '@xml/sparky_calorie_widget_info',
  },
  {
    name: `${WIDGET_PACKAGE}.MacroWidgetReceiver`,
    label: '@string/sparky_macro_widget_name',
    provider: '@xml/sparky_macro_widget_info',
  },
];

const TEMPLATE_SUFFIX = '.tmpl';
const SOURCE_DIR_NAME = 'targets/android-widget';
const KOTLIN_SUBDIR = 'kotlin';
const RES_SUBDIR = 'res';

async function copyTree(
  srcDir: string,
  destDir: string,
  transform?: (srcPath: string, contents: Buffer) => { destName: string; contents: Buffer },
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

const withCalorieWidget: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const applicationId = config.android?.package;
      if (!applicationId) {
        throw new Error(
          '[withCalorieWidget] config.android.package must be set before this plugin runs.',
        );
      }

      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const sourceRoot = path.join(projectRoot, SOURCE_DIR_NAME);

      const kotlinSrc = path.join(sourceRoot, KOTLIN_SUBDIR);
      const resSrc = path.join(sourceRoot, RES_SUBDIR);

      const kotlinDest = path.join(platformRoot, 'app/src/main/java');
      const resDest = path.join(platformRoot, 'app/src/main/res');

      await copyTree(kotlinSrc, kotlinDest, (srcPath, contents) => {
        const base = path.basename(srcPath);
        if (base.endsWith(TEMPLATE_SUFFIX)) {
          const substituted = contents
            .toString('utf8')
            .replace(/\{\{APPLICATION_ID\}\}/g, applicationId);
          return {
            destName: base.slice(0, -TEMPLATE_SUFFIX.length),
            contents: Buffer.from(substituted, 'utf8'),
          };
        }
        return { destName: base, contents };
      });

      await copyTree(resSrc, resDest);

      return config;
    },
  ]);

  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (!app) return config;

    app.receiver = app.receiver ?? [];
    for (const receiver of WIDGET_RECEIVERS) {
      const existing = app.receiver.find(
        (r: { $?: Record<string, string> }) =>
          r.$?.['android:name'] === receiver.name,
      ) as
        | {
            $?: Record<string, string>;
            'intent-filter'?: unknown[];
            'meta-data'?: unknown[];
          }
        | undefined;

      const receiverConfig = existing ?? {};
      receiverConfig.$ = {
        ...(receiverConfig.$ ?? {}),
        'android:name': receiver.name,
        'android:exported': 'false',
        'android:label': receiver.label,
      };
      receiverConfig['intent-filter'] = [
        {
          action: [
            {
              $: {
                'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
              },
            },
          ],
        },
      ];
      receiverConfig['meta-data'] = [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': receiver.provider,
          },
        },
      ];

      if (!existing) {
        app.receiver.push(receiverConfig as unknown as never);
      }
    }

    return config;
  });

  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    if (!src.includes(WIDGET_PACKAGE_IMPORT)) {
      const importBlockMatch = src.match(/((?:^import [^\n]+\n)+)/m);
      if (importBlockMatch) {
        const block = importBlockMatch[1];
        src = src.replace(block, `${block}${WIDGET_PACKAGE_IMPORT}\n`);
      } else {
        src = `${WIDGET_PACKAGE_IMPORT}\n${src}`;
      }
    }

    if (!src.includes(WIDGET_PACKAGE_ADD_LINE)) {
      const applyMatch = src.match(
        /PackageList\(this\)\.packages\.apply\s*\{\s*\n/,
      );
      if (applyMatch && applyMatch.index !== undefined) {
        const insertAt = applyMatch.index + applyMatch[0].length;
        src =
          src.slice(0, insertAt) +
          `              ${WIDGET_PACKAGE_ADD_LINE}\n` +
          src.slice(insertAt);
      } else {
        throw new Error(
          '[withCalorieWidget] Could not locate PackageList(this).packages.apply { block in MainApplication.',
        );
      }
    }

    config.modResults.contents = src;
    return config;
  });

  return config;
};

export default withCalorieWidget;
