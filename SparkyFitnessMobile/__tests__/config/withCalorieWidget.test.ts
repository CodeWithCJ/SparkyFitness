import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  WIDGET_PACKAGE,
  WIDGET_RECEIVERS,
  addWidgetReceivers,
  copyTree,
  installWidgetPackages,
  substituteApplicationId,
  type AndroidManifestApplication,
} from '../../plugins/withCalorieWidget';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeMainApplicationFixture(): string {
  return `package org.SparkyApps.SparkyFitnessMobile1.dev

import android.app.Application
import android.content.res.Configuration
import com.sparkyapps.sparkyfitness.language.AppLanguagePackage
import com.sparkyapps.sparkyfitness.exactalarm.ExactAlarmPackage

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
              add(AppLanguagePackage())
              add(ExactAlarmPackage())
        }
    )
  }
}
`;
}

describe('withCalorieWidget plugin helpers', () => {
  describe('addWidgetReceivers', () => {
    it('registers both widget receivers with resource labels and providers', () => {
      const application: AndroidManifestApplication = {
        $: { 'android:name': 'com.sparkyapps.sparkyfitness.MainApplication' },
      };

      addWidgetReceivers(application);

      expect(application.receiver).toHaveLength(2);
      expect(application.receiver?.map((r) => r.$?.['android:name'])).toEqual([
        `${WIDGET_PACKAGE}.CalorieWidgetReceiver`,
        `${WIDGET_PACKAGE}.MacroWidgetReceiver`,
      ]);
      for (const receiver of application.receiver ?? []) {
        expect(receiver.$?.['android:exported']).toBe('false');
        expect(receiver.$?.['android:label']).toMatch(/^@string\//);
        const provider = (receiver['meta-data']?.[0] as { $?: Record<string, string> })?.$?.[
          'android:resource'
        ];
        expect(provider).toMatch(/^@xml\//);
      }
    });

    it('is idempotent and does not duplicate receivers', () => {
      const application: AndroidManifestApplication = {};

      addWidgetReceivers(application);
      addWidgetReceivers(application);

      expect(application.receiver).toHaveLength(2);
    });

    it('preserves existing receivers', () => {
      const application: AndroidManifestApplication = {
        receiver: [
          {
            $: { 'android:name': 'com.sparkyapps.sparkyfitness.SomeReceiver' },
          },
        ],
      };

      addWidgetReceivers(application);

      expect(application.receiver).toHaveLength(3);
      expect(application.receiver?.map((r) => r.$?.['android:name'])).toContain(
        'com.sparkyapps.sparkyfitness.SomeReceiver',
      );
    });

    it('is a no-op when the application element is missing', () => {
      expect(addWidgetReceivers(undefined)).toBeUndefined();
    });

    it('uses dev and prod independent widget receiver package names', () => {
      // Receiver names are fixed regardless of the applicationId namespace, so
      // dev and prod builds resolve the same component classes.
      for (const receiver of WIDGET_RECEIVERS) {
        expect(receiver.name).toMatch(/^com\.sparkyapps\.sparkyfitness\.widget\./);
      }
    });
  });

  describe('installWidgetPackages', () => {
    it('adds the widget package import and add line while keeping language and alarm packages', () => {
      const once = installWidgetPackages(makeMainApplicationFixture());
      const twice = installWidgetPackages(once);

      expect(once).toContain(
        `import ${WIDGET_PACKAGE}.CalorieWidgetPackage`,
      );
      expect(once).toContain('add(CalorieWidgetPackage())');
      expect(once).toContain('AppLanguagePackage()');
      expect(once).toContain('ExactAlarmPackage()');
      expect(once.indexOf('CalorieWidgetPackage')).toBeLessThan(
        once.indexOf('PackageList(this)'),
      );
      expect(twice).toBe(once);
    });

    it('adds the widget package line inside the PackageList packages block', () => {
      const result = installWidgetPackages(makeMainApplicationFixture());
      const line = result.match(
        /PackageList\(this\)\.packages\.apply\s*\{\s*\n\s*add\(CalorieWidgetPackage\(\)\)\n/,
      );

      expect(line).not.toBeNull();
    });

    it('throws when PackageList packages block is missing', () => {
      expect(() =>
        installWidgetPackages(
          'package com.sparkyapps.sparkyfitness;\npublic class MainApplication {}\n',
        ),
      ).toThrow('Could not locate PackageList');
    });
  });

  describe('substituteApplicationId', () => {
    it('replaces {{APPLICATION_ID}} for a prod package', () => {
      const src = Buffer.from('import com.sparkyapps.sparkyfitness.R\n', 'utf8');
      const result = substituteApplicationId(src, 'com.sparkyapps.sparkyfitness');
      expect(result.toString('utf8')).toBe('import com.sparkyapps.sparkyfitness.R\n');
    });

    it('replaces {{APPLICATION_ID}} for a dev package namespace', () => {
      const src = Buffer.from(
        'import {{APPLICATION_ID}}.R\npackage com.sparkyapps.sparkyfitness.widget\n',
        'utf8',
      );
      const result = substituteApplicationId(
        src,
        'org.SparkyApps.SparkyFitnessMobile1.dev',
      );
      expect(result.toString('utf8')).toBe(
        'import org.SparkyApps.SparkyFitnessMobile1.dev.R\npackage com.sparkyapps.sparkyfitness.widget\n',
      );
    });
  });

  describe('copyTree', () => {
    it('copies values and values-pl resource directories recursively', async () => {
      const src = makeTempDir('widget-src-');
      const dest = makeTempDir('widget-dest-');
      const valuesDir = path.join(src, 'res', 'values');
      const valuesPlDir = path.join(src, 'res', 'values-pl');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.mkdirSync(valuesPlDir, { recursive: true });
      fs.writeFileSync(
        path.join(valuesDir, 'widget_strings.xml'),
        '<resources/>\n',
        'utf8',
      );
      fs.writeFileSync(
        path.join(valuesPlDir, 'widget_strings.xml'),
        '<resources/>\n',
        'utf8',
      );

      await copyTree(path.join(src, 'res'), path.join(dest, 'res'));

      expect(
        fs.existsSync(path.join(dest, 'res', 'values', 'widget_strings.xml')),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dest, 'res', 'values-pl', 'widget_strings.xml')),
      ).toBe(true);
    });

    it('is idempotent and preserves existing destination files', async () => {
      const src = makeTempDir('widget-src-');
      const dest = makeTempDir('widget-dest-');
      fs.writeFileSync(path.join(src, 'keep.txt'), 'from-source\n', 'utf8');
      fs.writeFileSync(path.join(dest, 'existing.txt'), 'pre-existing\n', 'utf8');

      await copyTree(src, dest);
      await copyTree(src, dest);

      expect(
        fs.readFileSync(path.join(dest, 'keep.txt'), 'utf8'),
      ).toBe('from-source\n');
      expect(
        fs.readFileSync(path.join(dest, 'existing.txt'), 'utf8'),
      ).toBe('pre-existing\n');
    });

    it('strips the .tmpl suffix when a transform is provided', async () => {
      const src = makeTempDir('widget-src-');
      const dest = makeTempDir('widget-dest-');
      fs.writeFileSync(
        path.join(src, 'Foo.kt.tmpl'),
        'import {{APPLICATION_ID}}.R\n',
        'utf8',
      );

      await copyTree(src, dest, (srcPath, contents) => {
        const base = path.basename(srcPath);
        if (base.endsWith('.tmpl')) {
          return {
            destName: base.slice(0, -'.tmpl'.length),
            contents: substituteApplicationId(contents, 'com.sparkyapps.sparkyfitness'),
          };
        }
        return { destName: base, contents };
      });

      expect(fs.existsSync(path.join(dest, 'Foo.kt'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'Foo.kt.tmpl'))).toBe(false);
      expect(
        fs.readFileSync(path.join(dest, 'Foo.kt'), 'utf8'),
      ).toContain('import com.sparkyapps.sparkyfitness.R');
    });
  });
});
