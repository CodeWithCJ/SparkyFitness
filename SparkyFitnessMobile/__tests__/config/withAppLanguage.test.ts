import {
  APPCOMPAT_DEPENDENCY,
  LANGUAGE_ADD_LINE,
  LANGUAGE_IMPORT,
  addAppBuildDependency,
  addAppLocalesService,
  installAppLanguagePackage,
  type AndroidManifestApplication,
} from '../../plugins/withAppLanguage';

const APP_LOCALES_SERVICE = 'androidx.appcompat.app.AppLocalesMetadataHolderService';

function buildGradleFixture(): string {
  return `android {
    namespace "com.sparkyapps.sparkyfitness"
    compileSdkVersion 36
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
`;
}

describe('withAppLanguage plugin transforms', () => {
  it('adds the AppCompat dependency once to app/build.gradle', () => {
    const once = addAppBuildDependency(buildGradleFixture());
    const twice = addAppBuildDependency(once);

    expect(once).toContain(APPCOMPAT_DEPENDENCY);
    expect(twice).toBe(once);
    expect(once.split('\n').filter((l) => l.includes('androidx.appcompat'))).toHaveLength(1);
  });

  it('throws when app/build.gradle has no dependencies block', () => {
    expect(() => addAppBuildDependency('android {}\n')).toThrow(
      'Could not find dependencies block',
    );
  });

  it('registers the AppLocalesMetadataHolderService with autoStoreLocales', () => {
    const application: AndroidManifestApplication = {
      $: { 'android:name': 'com.sparkyapps.sparkyfitness.MainApplication' },
    };

    const once = addAppLocalesService(application);
    const twice = addAppLocalesService(once);

    expect(once?.service).toHaveLength(1);
    expect(once?.service?.[0]?.$?.['android:name']).toBe(APP_LOCALES_SERVICE);
    expect(once?.service?.[0]?.['meta-data']?.[0]?.$?.['android:name']).toBe('autoStoreLocales');
    expect(once?.service?.[0]?.['meta-data']?.[0]?.$?.['android:value']).toBe('true');
    expect(twice?.service).toHaveLength(1);
  });

  it('is a no-op when the application element is missing', () => {
    expect(addAppLocalesService(undefined)).toBeUndefined();
  });

  it('keeps existing manifest services intact', () => {
    const application: AndroidManifestApplication = {
      service: [
        {
          $: { 'android:name': 'com.sparkyapps.sparkyfitness.SomeService' },
        },
      ],
    };

    const result = addAppLocalesService(application);

    expect(result?.service).toHaveLength(2);
    expect(result?.service?.map((s) => s.$?.['android:name'])).toEqual([
      'com.sparkyapps.sparkyfitness.SomeService',
      APP_LOCALES_SERVICE,
    ]);
  });

  it('registers the native package import and add line in MainApplication', () => {
    const fixture = `package org.SparkyApps.SparkyFitnessMobile1.dev

import android.app.Application
import android.content.res.Configuration
import com.sparkyapps.sparkyfitness.exactalarm.ExactAlarmPackage
import com.sparkyapps.sparkyfitness.widget.CalorieWidgetPackage

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
              add(CalorieWidgetPackage())
              add(ExactAlarmPackage())
        }
    )
  }
}
`;

    const once = installAppLanguagePackage(fixture);
    const twice = installAppLanguagePackage(once);

    expect(once).toContain(LANGUAGE_IMPORT);
    expect(once).toContain(LANGUAGE_ADD_LINE);
    expect(once.indexOf(LANGUAGE_IMPORT)).toBeLessThan(once.indexOf('PackageList(this)'));
    expect(twice).toBe(once);
  });

  it('adds the package line inside the PackageList packages block', () => {
    const fixture = `package org.SparkyApps.SparkyFitnessMobile1.dev

import com.facebook.react.PackageList
import com.facebook.react.ReactPackage

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
              add(CalorieWidgetPackage())
        }
    )
  }
}
`;
    const result = installAppLanguagePackage(fixture);
    const packageListLine = result.match(/PackageList\(this\)\.packages\.apply\s*\{\s*\n\s*add\(AppLanguagePackage\(\)\)\n/);

    expect(packageListLine).not.toBeNull();
  });

  it('throws when PackageList packages block is missing', () => {
    expect(() =>
      installAppLanguagePackage('package com.sparkyapps.sparkyfitness;\npublic class MainApplication {}\n'),
    ).toThrow('Could not locate PackageList packages block');
  });
});
