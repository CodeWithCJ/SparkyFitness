// Android: keeps an app shortcut (src/hooks/useQuickActions.ts), a Quick
// Settings tile or a widget link from running again when Android brings back
// a task it started.
//
// After the system kills the app in the background, reopening it recreates
// MainActivity with the intent the task was first started with. For a task an
// app shortcut started, that is the shortcut's intent, which expo-quick-actions
// would read as a fresh launch action; for one a tile or widget started, it is
// a sparkyfitnessmobile:// link, which React Native hands back as the initial
// URL. Either way the screen would open again without a tap. A restored
// activity has a saved state, so the action and the link are dropped from the
// intent before either reads it.
import { ConfigPlugin, withMainActivity } from 'expo/config-plugins';

// expo-quick-actions' UNIQ_ACTION_ID and the extra it keeps the action in.
const SHORTCUT_ACTION = 'expo.modules.quickactions.SHORTCUT';
const SHORTCUT_EXTRA = 'shortcut_data';
// The app's own scheme (app.json "scheme").
const APP_SCHEME = 'sparkyfitnessmobile';
// An NFC tag tap arrives as a web link on the tag host (Android 16 and later)
// or as an NDEF discovery for the same link. Replaying either after the system
// restored the app would run the tag again and log a second drink (#941).
// Keep the host in step with ACTION_TAG_HOST in @workspace/shared.
const TAG_HOST = 'tag.sparkyfitness.com';
const NDEF_ACTION = 'android.nfc.action.NDEF_DISCOVERED';
const INTENT_IMPORT = 'import android.content.Intent';
const GUARD_MARKER = 'Restored after the app was killed';

export const LAUNCH_GUARD = `    // ${GUARD_MARKER}: the shortcut or link that started this task already ran.
    if (savedInstanceState != null && (
        intent?.action == "${SHORTCUT_ACTION}" ||
        intent?.action == "${NDEF_ACTION}" ||
        (intent?.action == Intent.ACTION_VIEW && (
          intent?.data?.scheme == "${APP_SCHEME}" ||
          intent?.data?.host == "${TAG_HOST}"
        ))
      )) {
      intent = Intent(intent).setAction(Intent.ACTION_MAIN).setData(null).apply {
        removeExtra("${SHORTCUT_EXTRA}")
      }
    }
`;

export function addQuickActionLaunchGuard(source: string): string {
  if (source.includes(GUARD_MARKER)) return source;
  const superCall = source.match(/^[ \t]*super\.onCreate\(/m);
  const importBlock = source.match(/((?:^import [^\n]+\n)+)/m);
  if (!superCall || superCall.index === undefined || !importBlock) {
    throw new Error(
      '[withQuickActionLaunchGuard] Could not locate super.onCreate in MainActivity.'
    );
  }
  let next = `${source.slice(0, superCall.index)}${LAUNCH_GUARD}${source.slice(superCall.index)}`;
  if (!next.includes(INTENT_IMPORT)) {
    next = next.replace(importBlock[1], `${importBlock[1]}${INTENT_IMPORT}\n`);
  }
  return next;
}

const withQuickActionLaunchGuard: ConfigPlugin = (config) =>
  withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      throw new Error(
        '[withQuickActionLaunchGuard] Expected a Kotlin MainActivity.'
      );
    }
    config.modResults.contents = addQuickActionLaunchGuard(
      config.modResults.contents
    );
    return config;
  });

export default withQuickActionLaunchGuard;
