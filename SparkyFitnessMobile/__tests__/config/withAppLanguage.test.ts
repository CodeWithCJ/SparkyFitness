import {
  LANGUAGE_ADD_LINE,
  LANGUAGE_IMPORT,
  installAppLanguagePackage,
} from '../../plugins/withAppLanguage';

function mainApplicationFixture(): string {
  return `package org.SparkyApps.SparkyFitnessMobile1.dev

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
}

describe('withAppLanguage plugin transforms', () => {
  it('registers the native package import and add line in MainApplication', () => {
    const once = installAppLanguagePackage(mainApplicationFixture());
    const twice = installAppLanguagePackage(once);

    expect(once).toContain(LANGUAGE_IMPORT);
    expect(once).toContain(LANGUAGE_ADD_LINE);
    expect(once.indexOf(LANGUAGE_IMPORT)).toBeLessThan(once.indexOf('PackageList(this)'));
    expect(twice).toBe(once);
  });

  it('does not duplicate the package import or registration on repeat application', () => {
    const once = installAppLanguagePackage(mainApplicationFixture());

    expect(once.split('\n').filter((l) => l.includes(LANGUAGE_IMPORT))).toHaveLength(1);
    expect(once.split('\n').filter((l) => l.includes(LANGUAGE_ADD_LINE))).toHaveLength(1);
  });

  it('adds the package line inside the PackageList packages block', () => {
    const result = installAppLanguagePackage(mainApplicationFixture());
    const packageListLine = result.match(/PackageList\(this\)\.packages\.apply\s*\{\s*\n\s*add\(AppLanguagePackage\(\)\)\n/);

    expect(packageListLine).not.toBeNull();
  });

  it('throws when PackageList packages block is missing', () => {
    expect(() =>
      installAppLanguagePackage('package com.sparkyapps.sparkyfitness;\npublic class MainApplication {}\n'),
    ).toThrow('Could not locate PackageList packages block');
  });
});
