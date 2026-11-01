import fs from 'fs';
import path from 'path';
import {
  LAUNCH_GUARD,
  addQuickActionLaunchGuard,
} from '../../plugins/withQuickActionLaunchGuard';

function mainActivityFixture(): string {
  return `package org.SparkyApps.SparkyFitnessMobile1.dev
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY)
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }
}
`;
}

describe('addQuickActionLaunchGuard', () => {
  it('drops the shortcut from a restored activity before super.onCreate', () => {
    const result = addQuickActionLaunchGuard(mainActivityFixture());

    expect(result).toContain('import android.content.Intent\n');
    expect(result).toContain(`${LAUNCH_GUARD}    super.onCreate(null)`);
    expect(
      result.indexOf('SplashScreenManager.registerOnActivity')
    ).toBeLessThan(result.indexOf(LAUNCH_GUARD));
  });

  it("also drops the app's own links, so a tile or widget link is not replayed", () => {
    const { scheme } = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../app.json'), 'utf8')
    ).expo;
    expect(LAUNCH_GUARD).toContain('intent?.action == Intent.ACTION_VIEW');
    expect(LAUNCH_GUARD).toContain(`intent?.data?.scheme == "${scheme}"`);
    expect(LAUNCH_GUARD).toContain('.setData(null)');
  });

  it('also drops an NFC tag tap, so a restored app does not log it twice', () => {
    expect(LAUNCH_GUARD).toContain(
      'intent?.action == "android.nfc.action.NDEF_DISCOVERED"'
    );
    expect(LAUNCH_GUARD).toContain(
      'intent?.data?.host == "tag.sparkyfitness.com"'
    );
  });

  it('changes nothing on a second run', () => {
    const once = addQuickActionLaunchGuard(mainActivityFixture());
    expect(addQuickActionLaunchGuard(once)).toBe(once);
  });

  it('fails loudly when the template no longer calls super.onCreate', () => {
    expect(() =>
      addQuickActionLaunchGuard(
        'import android.os.Bundle\nclass MainActivity\n'
      )
    ).toThrow('super.onCreate');
  });
});
