// Android: lets tablets rotate while phones stay portrait.
//
// app.json's `orientation: "portrait"` becomes android:screenOrientation on
// MainActivity for every device, and the manifest cannot vary it by screen
// size. Android 16+ ignores that lock on large screens for apps targeting API
// 36, but older tablets keep it, so a tablet (smallest width 600 dp or more)
// asks for the user's rotation here, which still honours the system rotation
// lock. The screens lay themselves out for a wide window through
// src/components/ReadableWidthLayout.tsx.
import { ConfigPlugin, withMainActivity } from 'expo/config-plugins';

const IMPORTS = [
  'import android.content.pm.ActivityInfo',
  'import android.content.res.Configuration',
];
const ROTATION_MARKER = 'Tablets rotate; phones keep the portrait lock';

export const TABLET_ROTATION = `    // ${ROTATION_MARKER}.
    applyTabletRotation(resources.configuration)
`;

// Also re-checked when the window changes size without the activity being
// recreated (split screen, a foldable, a resizable window), so the lock follows
// the current width rather than the one at launch.
export const TABLET_ROTATION_METHODS = `
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyTabletRotation(newConfig)
  }

  private fun applyTabletRotation(config: Configuration) {
    requestedOrientation =
      if (config.smallestScreenWidthDp >= 600) ActivityInfo.SCREEN_ORIENTATION_FULL_USER
      else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
  }
`;

export function addTabletRotation(source: string): string {
  if (source.includes(ROTATION_MARKER)) return source;
  if (/fun onConfigurationChanged\(/.test(source)) {
    throw new Error(
      '[withTabletRotation] MainActivity already overrides onConfigurationChanged; merge the tablet rotation check into it.'
    );
  }
  const superCall = source.match(/^[ \t]*super\.onCreate\(/m);
  const importBlock = source.match(/((?:^import [^\n]+\n)+)/m);
  const classEnd = source.lastIndexOf('}');
  if (
    !superCall ||
    superCall.index === undefined ||
    !importBlock ||
    classEnd < superCall.index
  ) {
    throw new Error(
      '[withTabletRotation] Could not locate super.onCreate in MainActivity.'
    );
  }
  let next =
    source.slice(0, superCall.index) +
    TABLET_ROTATION +
    source.slice(superCall.index, classEnd).replace(/\s*$/, '\n') +
    TABLET_ROTATION_METHODS +
    source.slice(classEnd);
  const missing = IMPORTS.filter((line) => !next.includes(`${line}\n`));
  if (missing.length > 0) {
    next = next.replace(
      importBlock[1],
      `${importBlock[1]}${missing.map((line) => `${line}\n`).join('')}`
    );
  }
  return next;
}

const withTabletRotation: ConfigPlugin = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error('[withTabletRotation] Expected a Kotlin MainActivity.');
    }
    config.modResults.contents = addTabletRotation(config.modResults.contents);
    return config;
  });

export default withTabletRotation;
