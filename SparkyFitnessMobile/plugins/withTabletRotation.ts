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

const ACTIVITY_INFO_IMPORT = 'import android.content.pm.ActivityInfo';
const ROTATION_MARKER = 'Tablets rotate; phones keep the portrait lock';

export const TABLET_ROTATION = `    // ${ROTATION_MARKER}.
    if (resources.configuration.smallestScreenWidthDp >= 600) {
      requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_USER
    }
`;

export function addTabletRotation(source: string): string {
  if (source.includes(ROTATION_MARKER)) return source;
  const superCall = source.match(/^[ \t]*super\.onCreate\(/m);
  const importBlock = source.match(/((?:^import [^\n]+\n)+)/m);
  if (!superCall || superCall.index === undefined || !importBlock) {
    throw new Error(
      '[withTabletRotation] Could not locate super.onCreate in MainActivity.'
    );
  }
  let next = `${source.slice(0, superCall.index)}${TABLET_ROTATION}${source.slice(superCall.index)}`;
  if (!next.includes(ACTIVITY_INFO_IMPORT)) {
    next = next.replace(
      importBlock[1],
      `${importBlock[1]}${ACTIVITY_INFO_IMPORT}\n`
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
