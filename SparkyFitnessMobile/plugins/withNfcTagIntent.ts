// Android 15 and older hand a tapped NFC tag to the app as an NDEF_DISCOVERED
// intent (Android 16 and later send a web-link VIEW intent instead, which the
// `android.intentFilters` in app.config.ts cover). Expo's `intentFilters`
// option prefixes every action with `android.intent.action.`, so it cannot
// express `android.nfc.action.NDEF_DISCOVERED`; this plugin writes the filter
// into the manifest as it is (#941).
import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
} from 'expo/config-plugins';

// Keep the host in step with ACTION_TAG_HOST in @workspace/shared.
const TAG_HOST = 'tag.sparkyfitness.com';
const TAG_PATH_PREFIX = '/t/';
export const NDEF_ACTION = 'android.nfc.action.NDEF_DISCOVERED';

export function addNdefIntentFilter(
  manifest: AndroidConfig.Manifest.AndroidManifest
): void {
  const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const filters = mainActivity['intent-filter'] ?? [];
  const alreadyThere = filters.some((filter) =>
    filter.action?.some((action) => action.$['android:name'] === NDEF_ACTION)
  );
  if (alreadyThere) return;
  filters.push({
    action: [{ $: { 'android:name': NDEF_ACTION } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    data: [
      {
        $: {
          'android:scheme': 'https',
          'android:host': TAG_HOST,
          'android:pathPrefix': TAG_PATH_PREFIX,
        },
      },
    ],
  });
  mainActivity['intent-filter'] = filters;
}

const withNfcTagIntent: ConfigPlugin = (config) =>
  withAndroidManifest(config, (innerConfig) => {
    addNdefIntentFilter(innerConfig.modResults);
    return innerConfig;
  });

export default withNfcTagIntent;
