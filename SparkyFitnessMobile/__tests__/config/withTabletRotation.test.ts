import { addQuickActionLaunchGuard } from '../../plugins/withQuickActionLaunchGuard';
import {
  TABLET_ROTATION,
  TABLET_ROTATION_METHODS,
  addTabletRotation,
} from '../../plugins/withTabletRotation';

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

describe('addTabletRotation', () => {
  it('unlocks rotation on large screens before super.onCreate', () => {
    const result = addTabletRotation(mainActivityFixture());

    expect(result).toContain('import android.content.pm.ActivityInfo\n');
    expect(result).toContain(`${TABLET_ROTATION}    super.onCreate(null)`);
    expect(result).toContain('smallestScreenWidthDp >= 600');
    expect(result).toContain('SCREEN_ORIENTATION_FULL_USER');
  });

  it('re-checks the width when the window changes size', () => {
    const result = addTabletRotation(mainActivityFixture());

    expect(result).toContain('import android.content.res.Configuration\n');
    expect(result).toContain(
      'override fun onConfigurationChanged(newConfig: Configuration)'
    );
    expect(result).toContain('SCREEN_ORIENTATION_PORTRAIT');
    // The methods sit inside the class, after onCreate.
    expect(result.indexOf(TABLET_ROTATION_METHODS)).toBeGreaterThan(
      result.indexOf('super.onCreate(null)')
    );
    expect(result.trimEnd().endsWith('}')).toBe(true);
  });

  it('refuses to add a second onConfigurationChanged', () => {
    const source = mainActivityFixture().replace(
      '    super.onCreate(null)\n  }\n',
      '    super.onCreate(null)\n  }\n  override fun onConfigurationChanged(newConfig: Configuration) {}\n'
    );
    expect(() => addTabletRotation(source)).toThrow('onConfigurationChanged');
  });

  it('is idempotent', () => {
    const once = addTabletRotation(mainActivityFixture());
    expect(addTabletRotation(once)).toBe(once);
  });

  it('applies alongside the quick action launch guard', () => {
    const result = addTabletRotation(
      addQuickActionLaunchGuard(mainActivityFixture())
    );
    expect(result).toContain(TABLET_ROTATION);
    expect(result).toContain('Restored after the app was killed');
    expect(result.match(/super\.onCreate\(/g)).toHaveLength(1);
  });

  it('throws when MainActivity has no onCreate', () => {
    expect(() =>
      addTabletRotation('import a.b\nclass MainActivity {}\n')
    ).toThrow('Could not locate super.onCreate');
  });
});
