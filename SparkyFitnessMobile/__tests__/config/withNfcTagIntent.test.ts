import type { AndroidConfig } from 'expo/config-plugins';
import {
  NDEF_ACTION,
  addNdefIntentFilter,
} from '../../plugins/withNfcTagIntent';

function manifestFixture(): AndroidConfig.Manifest.AndroidManifest {
  return {
    manifest: {
      application: [
        {
          activity: [
            {
              $: { 'android:name': '.MainActivity' },
              'intent-filter': [
                {
                  action: [
                    { $: { 'android:name': 'android.intent.action.MAIN' } },
                  ],
                  category: [
                    {
                      $: {
                        'android:name': 'android.intent.category.LAUNCHER',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as AndroidConfig.Manifest.AndroidManifest;
}

const filtersOf = (manifest: AndroidConfig.Manifest.AndroidManifest) =>
  manifest.manifest.application?.[0]?.activity?.[0]?.['intent-filter'] ?? [];

describe('addNdefIntentFilter', () => {
  it('adds an NDEF_DISCOVERED filter under its real action name', () => {
    const manifest = manifestFixture();
    addNdefIntentFilter(manifest);
    const added = filtersOf(manifest).find((filter) =>
      filter.action?.some((action) => action.$['android:name'] === NDEF_ACTION)
    );
    // Not prefixed with android.intent.action., which is what Expo's
    // `intentFilters` option would have written.
    expect(NDEF_ACTION).toBe('android.nfc.action.NDEF_DISCOVERED');
    expect(added?.data?.[0]?.$).toEqual({
      'android:scheme': 'https',
      'android:host': 'tag.sparkyfitness.com',
      'android:pathPrefix': '/t/',
    });
    expect(added?.category?.[0]?.$['android:name']).toBe(
      'android.intent.category.DEFAULT'
    );
  });

  it('keeps the launcher filter and changes nothing on a second run', () => {
    const manifest = manifestFixture();
    addNdefIntentFilter(manifest);
    addNdefIntentFilter(manifest);
    expect(filtersOf(manifest)).toHaveLength(2);
  });
});
