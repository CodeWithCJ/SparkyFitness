import fs from 'fs';
import path from 'path';
import type { AndroidConfig } from 'expo/config-plugins';
import { addQuickSettingsTiles } from '../../plugins/withQuickSettingsTiles';

type ManifestApplication = AndroidConfig.Manifest.ManifestApplication;

const RES_ROOT = path.join(__dirname, '../../targets/android-widget/res');
const TILES_SOURCE = fs.readFileSync(
  path.join(
    __dirname,
    '../../targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/QuickSettingsTiles.kt.tmpl'
  ),
  'utf8'
);

const application = (): ManifestApplication => ({
  $: { 'android:name': '.MainApplication' },
});

const tiles = (app: ManifestApplication) =>
  (app.service ?? []).filter((service) =>
    service.$['android:name'].endsWith('TileService')
  );

describe('addQuickSettingsTiles', () => {
  it('declares the four tiles so only the system can bind them', () => {
    const app = application();
    addQuickSettingsTiles(app);

    expect(tiles(app).map((tile) => tile.$['android:name'])).toEqual([
      'com.sparkyapps.sparkyfitness.widget.LogWaterTileService',
      'com.sparkyapps.sparkyfitness.widget.ScanFoodTileService',
      'com.sparkyapps.sparkyfitness.widget.SearchFoodTileService',
      'com.sparkyapps.sparkyfitness.widget.CaloriesLeftTileService',
    ]);
    for (const tile of tiles(app)) {
      expect(tile.$).toMatchObject({
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      });
      expect(tile['intent-filter']).toEqual([
        {
          action: [
            {
              $: {
                'android:name': 'android.service.quicksettings.action.QS_TILE',
              },
            },
          ],
        },
      ]);
    }
  });

  it('replaces the entries an earlier prebuild left and keeps other services', () => {
    const app = application();
    app.service = [
      {
        $: {
          'android:name':
            'com.sparkyapps.sparkyfitness.widget.LogWaterTileService',
        },
      },
      { $: { 'android:name': 'expo.modules.SomeService' } },
    ];
    addQuickSettingsTiles(app);
    addQuickSettingsTiles(app);

    expect(tiles(app)).toHaveLength(4);
    expect(
      app.service?.some(
        (service) => service.$['android:name'] === 'expo.modules.SomeService'
      )
    ).toBe(true);
  });

  it('points every tile at a string and an icon that exist', () => {
    const app = application();
    addQuickSettingsTiles(app);
    const strings = fs.readFileSync(
      path.join(RES_ROOT, 'values/widget_strings.xml'),
      'utf8'
    );
    for (const tile of tiles(app)) {
      const attributes = tile.$ as Record<string, string>;
      const label = attributes['android:label'].replace('@string/', '');
      const icon = attributes['android:icon'].replace('@drawable/', '');
      expect(strings).toContain(`name="${label}"`);
      expect(
        fs.existsSync(path.join(RES_ROOT, 'drawable', `${icon}.xml`))
      ).toBe(true);
      // The label the tile sets at runtime is the same resource.
      const service = attributes['android:name'].split('.').pop();
      expect(TILES_SOURCE).toMatch(
        new RegExp(
          `class ${service} [^{]*\\{\\s*override val labelRes = R\\.string\\.${label}\\b`
        )
      );
    }
  });

  it('keeps every tile a button that is never left on', () => {
    // Log water reports in the notification list, not on the tile: some
    // panels (HyperOS) do not show a subtitle, so an "on" tile only looked stuck.
    expect(TILES_SOURCE).not.toMatch(/STATE_ACTIVE/);
    expect(TILES_SOURCE).toMatch(
      /enqueueLogWater\(applicationContext, fromTile = true\)/
    );
  });

  it('opens only links the app can route, and is applied by app.config.ts', () => {
    const appSource = fs.readFileSync(
      path.join(__dirname, '../../App.tsx'),
      'utf8'
    );
    const paths = [...TILES_SOURCE.matchAll(/openApp\("([^"]+)"\)/g)].map(
      (match) => match[1]
    );
    expect(paths).toEqual(['scan', 'search', 'diary']);
    for (const linkPath of paths) {
      expect(appSource).toMatch(new RegExp(`: '${linkPath}',`));
    }
    expect(
      fs.readFileSync(path.join(__dirname, '../../app.config.ts'), 'utf8')
    ).toContain("'./plugins/withQuickSettingsTiles'");
  });
});
