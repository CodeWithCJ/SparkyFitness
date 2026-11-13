// Android: declares the Quick Settings tiles, the Android side of the iOS
// Control Center controls (targets/widget/Controls.swift).
//
// The tiles' Kotlin (QuickSettingsTiles.kt.tmpl) lives with the widgets in
// targets/android-widget and is copied by plugins/withCalorieWidget.ts: the
// tiles share the widgets' strings, icons, language handling and calorie
// snapshot. The Log water tile runs the background-water job, so it also needs
// plugins/withBackgroundWater.ts.
import {
  AndroidConfig,
  ConfigPlugin,
  withAndroidManifest,
} from 'expo/config-plugins';

const TILE_PACKAGE = 'com.sparkyapps.sparkyfitness.widget';

const QUICK_SETTINGS_TILES = [
  {
    name: `${TILE_PACKAGE}.LogWaterTileService`,
    label: '@string/tile_log_water',
    icon: '@drawable/ic_tile_log_water',
  },
  {
    name: `${TILE_PACKAGE}.ScanFoodTileService`,
    label: '@string/widget_scan_barcode',
    icon: '@drawable/ic_widget_scan',
  },
  {
    name: `${TILE_PACKAGE}.SearchFoodTileService`,
    label: '@string/widget_search_food',
    icon: '@drawable/ic_widget_search',
  },
  {
    name: `${TILE_PACKAGE}.CaloriesLeftTileService`,
    label: '@string/tile_calories_left',
    icon: '@drawable/ic_tile_calories',
  },
];

type ManifestApplication = AndroidConfig.Manifest.ManifestApplication;
type ManifestService = NonNullable<ManifestApplication['service']>[number];

/**
 * Declares the tiles, replacing any entry an earlier prebuild left behind.
 * Exported so the system UI can bind them; the permission keeps every other
 * app out.
 */
export function addQuickSettingsTiles(app: ManifestApplication): void {
  const names = new Set(QUICK_SETTINGS_TILES.map((tile) => tile.name));
  app.service = [
    ...(app.service ?? []).filter(
      (service) => !names.has(service.$['android:name'])
    ),
    ...QUICK_SETTINGS_TILES.map((tile): ManifestService => ({
      $: {
        'android:name': tile.name,
        'android:exported': 'true',
        'android:label': tile.label,
        'android:icon': tile.icon,
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      } as ManifestService['$'],
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.quicksettings.action.QS_TILE',
              },
            },
          ],
        },
      ],
    })),
  ];
}

const withQuickSettingsTiles: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) addQuickSettingsTiles(app);
    return config;
  });

export default withQuickSettingsTiles;
