import fs from 'fs';
import path from 'path';

const TARGETS_ROOT = path.join(
  __dirname,
  '../../targets/android-widget',
);

const KOTLIN_ROOT = path.join(TARGETS_ROOT, 'kotlin', 'com', 'sparkyapps', 'sparkyfitness', 'widget');
const RES_ROOT = path.join(TARGETS_ROOT, 'res');

function readWidgetStringResources(): { name: string; value: string }[] {
  const xml = fs.readFileSync(
    path.join(RES_ROOT, 'values', 'widget_strings.xml'),
    'utf8',
  );
  return extractStringResources(xml);
}

function readWidgetStringResourcesPl(): { name: string; value: string }[] {
  const xml = fs.readFileSync(
    path.join(RES_ROOT, 'values-pl', 'widget_strings.xml'),
    'utf8',
  );
  return extractStringResources(xml);
}

function extractStringResources(xml: string): { name: string; value: string }[] {
  const result: { name: string; value: string }[] = [];
  const regex = /<string\s+name="([^"]+)">([^<]*)<\/string>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    result.push({
      name: match[1],
      value: match[2].replace(/\\'/g, "'").replace(/&apos;/g, "'"),
    });
  }
  return result;
}

const REQUIRED_KEYS = [
  'sparky_calorie_widget_name',
  'sparky_widget_description',
  'sparky_macro_widget_name',
  'sparky_macro_widget_description',
  'widget_kcal_left',
  'widget_kcal_left_caption',
  'widget_kcal_left_value',
  'widget_kcal_left_empty',
  'widget_grams',
  'widget_protein',
  'widget_carbs',
  'widget_fat',
  'widget_search_food',
  'widget_scan_barcode',
  'widget_preview_calories_left',
  'widget_preview_calories_value',
  'widget_preview_macros_left',
  'widget_preview_macros_value',
  'widget_preview_grams_protein',
  'widget_preview_grams_carbs',
  'widget_preview_grams_fat',
];

const FORBIDDEN_KOTLIN_LITERALS = [
  'kcal left',
  'Search food',
  'Scan barcode',
  '="Protein"',
  '="Carbs"',
  '="Fat"',
  '"Protein"',
  '"Carbs"',
  '"Fat"',
  'Locale.US',
];

const KOTLIN_TEMPLATES = [
  'CalorieWidget.kt.tmpl',
  'MacroWidget.kt.tmpl',
  'CalorieWidgetReceiver.kt.tmpl',
  'MacroWidgetReceiver.kt.tmpl',
  'CalorieWidgetModule.kt.tmpl',
  'WidgetLocale.kt.tmpl',
];

const WIDGET_INFO_XMLS = [
  'sparky_calorie_widget_info.xml',
  'sparky_macro_widget_info.xml',
];

describe('Android widget localization contract', () => {
  describe('string resources', () => {
    it('defines every required key in the default values', () => {
      const en = new Set(readWidgetStringResources().map((r) => r.name));
      for (const key of REQUIRED_KEYS) {
        expect(en.has(key)).toBe(true);
      }
    });

    it('defines the same key set in values and values-pl', () => {
      const en = readWidgetStringResources().map((r) => r.name).sort();
      const pl = readWidgetStringResourcesPl().map((r) => r.name).sort();

      expect(pl).toEqual(en);
    });

    it('has non-empty values in both locales', () => {
      const en = readWidgetStringResources();
      const pl = readWidgetStringResourcesPl();

      for (const resource of [...en, ...pl]) {
        expect(resource.value).not.toBe('');
      }
    });

    it('uses approved Polish translations with diacritics where natural', () => {
      const pl = new Map(
        readWidgetStringResourcesPl().map((r) => [r.name, r.value]),
      );

      expect(pl.get('sparky_calorie_widget_name')).toBe('Kalorie');
      expect(pl.get('sparky_macro_widget_name')).toBe('Makroskładniki');
      expect(pl.get('widget_protein')).toBe('Białko');
      expect(pl.get('widget_carbs')).toBe('Węglowodany');
      expect(pl.get('widget_fat')).toBe('Tłuszcz');
      expect(pl.get('widget_search_food')).toBe('Wyszukaj produkt');
      expect(pl.get('widget_scan_barcode')).toBe('Skanuj kod kreskowy');
      expect(pl.get('widget_kcal_left')).toBe('Pozostało %1$s kcal');
      expect(pl.get('widget_kcal_left_caption')).toBe('Pozostało');
      expect(pl.get('widget_kcal_left_value')).toBe('%1$s kcal');
    });

    it('keeps placeholder position compatible between EN and PL', () => {
      const en = new Map(
        readWidgetStringResources().map((r) => [r.name, r.value]),
      );
      const pl = new Map(
        readWidgetStringResourcesPl().map((r) => [r.name, r.value]),
      );

      const placeholderKeys = [
        'widget_kcal_left',
        'widget_kcal_left_value',
        'widget_grams',
      ];
      for (const key of placeholderKeys) {
        const enCount = (en.get(key)?.match(/%\d+\$[sd]/g) ?? []).length;
        const plCount = (pl.get(key)?.match(/%\d+\$[sd]/g) ?? []).length;
        expect(plCount).toBe(enCount);
        expect(plCount).toBeGreaterThan(0);
      }
    });

    it('does not use i18next placeholder syntax in Android XML', () => {
      const en = readWidgetStringResources();
      const pl = readWidgetStringResourcesPl();
      for (const resource of [...en, ...pl]) {
        expect(resource.value).not.toMatch(/\{\{/);
        expect(resource.value).not.toMatch(/\}\}/);
      }
    });

    it('does not mix user data into resource values', () => {
      const en = readWidgetStringResources();
      for (const resource of en) {
        // Preview sample numbers are legitimate localized samples, not user data.
        if (resource.name.startsWith('widget_preview_')) continue;
        expect(resource.value).not.toMatch(/\b\d{2,4}\s*kcal\b/);
      }
    });
  });

  describe('Kotlin templates', () => {
    it('contains no forbidden hardcoded English user-facing literals', () => {
      for (const template of KOTLIN_TEMPLATES) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        for (const literal of FORBIDDEN_KOTLIN_LITERALS) {
          expect(src).not.toContain(literal);
        }
      }
    });

    it('resolves widget labels through context.getString(R.string...)', () => {
      const calorieSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'),
        'utf8',
      );
      expect(calorieSrc).toMatch(/R\.string\.widget_kcal_left/);
      expect(calorieSrc).toMatch(/R\.string\.widget_kcal_left_caption/);
      expect(calorieSrc).toMatch(/R\.string\.widget_kcal_left_value/);
      expect(calorieSrc).toMatch(/R\.string\.widget_search_food/);
      expect(calorieSrc).toMatch(/R\.string\.widget_scan_barcode/);
      expect(calorieSrc).toMatch(/R\.string\.widget_kcal_left_empty/);

      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8',
      );
      for (const ref of [
        'widget_protein',
        'widget_carbs',
        'widget_fat',
        'widget_search_food',
        'widget_scan_barcode',
        'widget_kcal_left',
        'widget_kcal_left_caption',
        'widget_kcal_left_value',
        'widget_kcal_left_empty',
        'widget_grams',
      ]) {
        expect(macroSrc).toMatch(new RegExp(`R\\.string\\.${ref}`));
      }
    });

    it('uses locale-aware number formatting without hardcoding English separators', () => {
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(helper).toMatch(/NumberFormat\.getIntegerInstance/);
      expect(helper).not.toContain('String.format(Locale.US');
      expect(helper).not.toContain('%,d');

      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/formatWidgetInt\(/);
        expect(src).not.toContain('String.format(Locale.US');
        expect(src).not.toContain('%,d');
        // No divergent per-widget rounding survives: the shared helper owns it.
        expect(src).not.toMatch(/\.toLong\(\)/);
        expect(src).not.toMatch(/\.roundToLong\(\)/);
      }
    });

    it('rounds the same value identically in every widget surface', () => {
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(helper).toMatch(/formatWidgetInt/);
      expect(helper).toMatch(/roundToLong\(\)/);
      expect(helper).not.toMatch(/\.toLong\(\)/);
    });

    it('updates every GlanceId and continues past a failing instance', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8',
      );
      expect(moduleSrc).toMatch(/getGlanceIds\(CalorieWidget::class\.java\)\.forEach/);
      expect(moduleSrc).toMatch(/getGlanceIds\(MacroWidget::class\.java\)\.forEach/);
      expect(moduleSrc).not.toMatch(/getGlanceIds\([^)]*\)\[0\]/);
      expect(moduleSrc).toMatch(/catch \(ignored: Exception\)/);
    });

    it('keeps the midnight refresh mechanism with distinct request codes', () => {
      const calorieReceiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetReceiver.kt.tmpl'),
        'utf8',
      );
      const macroReceiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidgetReceiver.kt.tmpl'),
        'utf8',
      );

      for (const src of [calorieReceiver, macroReceiver]) {
        expect(src).toMatch(/ACTION_MIDNIGHT_REFRESH/);
        expect(src).toMatch(/updateAll\(context\)/);
        expect(src).toMatch(/scheduleMidnightRefresh\(context\)/);
        expect(src).toMatch(/cancelMidnightRefresh\(context\)/);
        expect(src).toMatch(/setAndAllowWhileIdle/);
      }
    });
  });

  describe('widget resize contract', () => {
    it('enables horizontal and vertical resizing on both provider XMLs', () => {
      for (const infoXml of WIDGET_INFO_XMLS) {
        const src = fs.readFileSync(path.join(RES_ROOT, 'xml', infoXml), 'utf8');
        expect(src).toMatch(/android:resizeMode="horizontal\|vertical"/);
      }
    });

    it('never regresses to resizeMode="none"', () => {
      for (const infoXml of WIDGET_INFO_XMLS) {
        const src = fs.readFileSync(path.join(RES_ROOT, 'xml', infoXml), 'utf8');
        expect(src).not.toMatch(/resizeMode="none"/);
      }
    });

    it('keeps honest non-zero minimum resize dimensions on both providers', () => {
      const calorie = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_calorie_widget_info.xml'),
        'utf8',
      );
      const macro = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_macro_widget_info.xml'),
        'utf8',
      );

      // Calorie minimums match the SHORT layout (value + progress): 56dp of
      // height fits caption(11sp) + value(16sp) + progress(4dp) + padding.
      const calorieWidth = calorie.match(/android:minResizeWidth="(\d+)dp"/);
      const calorieHeight = calorie.match(/android:minResizeHeight="(\d+)dp"/);
      expect(calorieWidth?.[1]).toBe('110');
      expect(calorieHeight?.[1]).toBe('56');

      // Macro minimums match the SHORT layout (inline rows only): 150dp of
      // width fits the longest inline Polish row ("Węglowodany 136 g") at
      // 12sp, and 110dp of height fits three inline rows + progress bars.
      const macroWidth = macro.match(/android:minResizeWidth="(\d+)dp"/);
      const macroHeight = macro.match(/android:minResizeHeight="(\d+)dp"/);
      expect(macroWidth?.[1]).toBe('150');
      expect(macroHeight?.[1]).toBe('110');

      // minWidth/minHeight must agree with the resize minimums so pre-31
      // devices render the same supported compact layout.
      expect(calorie).toMatch(/android:minHeight="56dp"/);
      expect(macro).toMatch(/android:minWidth="150dp"/);
    });

    it('uses SizeMode.Exact with LocalSize.current in both Glance widgets', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/import androidx\.glance\.LocalSize/);
        expect(src).toMatch(/import androidx\.glance\.appwidget\.SizeMode/);
        expect(src).toMatch(/SizeMode\.Exact/);
        expect(src).toMatch(/LocalSize\.current/);
        // The reported size must actually drive the layout, not sit unused:
        // both dimensions feed the layout decision, because the provider
        // allows independent horizontal and vertical resizing.
        expect(src).toMatch(/size\.width/);
        expect(src).toMatch(/size\.height/);
      }
    });

    it('branches the calorie layout on a height class and hides actions when short', () => {
      const src = fs.readFileSync(path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'), 'utf8');
      expect(src).toMatch(/enum class CalorieHeightClass \{ SHORT, NORMAL, TALL \}/);
      expect(src).toMatch(/fun calorieHeightClass\(height: Dp\)/);
      expect(src).toMatch(/heightClass != CalorieHeightClass\.SHORT/);
      // The action row must be conditional on height, never unconditional.
      expect(src).toMatch(/if \(heightClass != CalorieHeightClass\.SHORT\) \{/);
      // SHORT keeps the primary calorie info: caption/value are rendered with
      // a smaller vertical budget (no 30dp action row at minimum height).
      expect(src).toMatch(/CalorieHeightClass\.SHORT && !wide/);
    });

    it('never chooses the tall stacked macro layout for a short narrow widget', () => {
      const src = fs.readFileSync(path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'), 'utf8');
      expect(src).toMatch(/enum class MacroHeightClass \{ SHORT, NORMAL, TALL \}/);
      expect(src).toMatch(/fun macroHeightClass\(height: Dp\)/);
      // Stacked rows (label above value) are only used on narrow + TALL.
      expect(src).toMatch(/val stacked = !wide && heightClass == MacroHeightClass\.TALL/);
      // Header and actions are omitted at SHORT so the primary macro rows
      // (including "Węglowodany") fit the honest minimum height.
      expect(src).toMatch(/if \(!short\) \{/);
      expect(src).toMatch(/val short = heightClass == MacroHeightClass\.SHORT/);
    });

    it('keeps the primary macro rows at minimum height (no header/action requirement)', () => {
      const src = fs.readFileSync(path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'), 'utf8');
      // The short layout must still render all three macro rows with progress.
      expect(src).toMatch(/MacroRows\(/);
      // The kcal header is skipped when short (it would overflow 110dp).
      const headerCall = src.match(/CalorieHeader\(context = widgetContext/);
      expect(headerCall).not.toBeNull();
    });

    it('does not lock the macro widget to a single fixed responsive breakpoint', () => {
      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8',
      );
      expect(macroSrc).not.toMatch(/SizeMode\.Responsive\(\s*setOf\(DpSize\(200\.dp, 200\.dp\)\)/);
    });
  });

  describe('widget locale override contract', () => {
    it('owns the widget locale in a dedicated SharedPreferences namespace', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(src).toMatch(/PREFS_NAME = "SparkyWidgetLocale"/);
      expect(src).toMatch(/getSharedPreferences\(PREFS_NAME, Context\.MODE_PRIVATE\)/);
    });

    it('resolves en/pl overrides and treats anything else as system', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(src).toMatch(/Locale\.forLanguageTag\("en"\)/);
      expect(src).toMatch(/Locale\.forLanguageTag\("pl"\)/);
      expect(src).toMatch(/Only en, pl, or null are supported/);
    });

    it('builds a localized context without global locale mutation', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(src).toMatch(/createConfigurationContext\(config\)/);
      expect(src).toMatch(/config\.setLocale\(locale\)/);
      expect(src).not.toContain('Locale.setDefault');
      expect(src).not.toContain('Resources.getSystem');
    });

    it('never applies the override on Android 13+ (native LocaleManager authoritative)', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      // localizedContext returns the ORIGINAL context on API 33+ before any
      // override is consulted: the native app locale wins even with a stale
      // stored "pl" (e.g. after an OS upgrade 12 -> 13 with LocaleManager en).
      expect(src).toMatch(/TIRAMISU/);
      expect(src).toMatch(/fun localizedContext\(context: Context\): Context \{\s*if \(isNativeAppLanguageSupported\(\)\) return context/);
    });

    it('clears any stale override on Android 13+ for every request (en/pl/system)', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      // setOverride on API 33+ removes the key for en, pl AND null — the
      // actual locale is already controlled by LocaleManager.
      expect(src).toMatch(/if \(isNativeAppLanguageSupported\(\) \|\| normalized == null\) \{\s*editor\.remove\(KEY_LOCALE\)/);
    });

    it('keeps the API <=32 override behavior for en/pl', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      // On API <=32 the override is read from the dedicated namespace and
      // applied through a localized configuration context.
      expect(src).toMatch(/getString\(KEY_LOCALE, null\)/);
      expect(src).toMatch(/Locale\.forLanguageTag\("en"\)/);
      expect(src).toMatch(/Locale\.forLanguageTag\("pl"\)/);
      expect(src).toMatch(/putString\(KEY_LOCALE, normalized\)/);
    });

    it('ignores a stale <=12 preference on API 33+ (OS-upgrade safety)', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      // override() short-circuits to null before reading the stored value on
      // API 33+, so a persisted "pl" from an Android 12 install is harmless
      // when the device later runs Android 13 with a native English locale.
      expect(src).toMatch(/fun override\(context: Context\): Locale\? \{\s*if \(isNativeAppLanguageSupported\(\)\) return null/);
    });

    it('exposes the override via the native bridge for the JS hook', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8',
      );
      expect(moduleSrc).toMatch(/fun setWidgetLocale\(locale: String\?, promise: Promise\)/);
      expect(moduleSrc).toMatch(/WidgetLocale\.setOverride\(ctx, locale\)/);
    });
  });

  describe('widget picker metadata', () => {
    it('uses resource labels and descriptions in the receiver info XML', () => {
      const calorieInfo = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_calorie_widget_info.xml'),
        'utf8',
      );
      const macroInfo = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_macro_widget_info.xml'),
        'utf8',
      );

      expect(calorieInfo).toContain('@string/sparky_widget_description');
      expect(macroInfo).toContain('@string/sparky_macro_widget_description');
    });
  });

  describe('preview layouts', () => {
    it('references localized strings instead of hardcoded English text', () => {
      for (const layout of [
        'sparky_widget_initial_layout.xml',
        'sparky_macro_widget_initial_layout.xml',
      ]) {
        const src = fs.readFileSync(path.join(RES_ROOT, 'layout', layout), 'utf8');
        const textValues = [
          ...src.matchAll(/android:text="([^"]*)"/g),
        ].map((m) => m[1]);
        const contentDescriptions = [
          ...src.matchAll(/android:contentDescription="([^"]*)"/g),
        ].map((m) => m[1]);

        for (const value of [...textValues, ...contentDescriptions]) {
          if (value === '') continue;
          expect(value).toMatch(/^@string\//);
          expect(value).not.toMatch(/^@string\/(?!widget_)/);
        }
      }
    });

    it('reuses localized labels for macros and grams samples', () => {
      const macroLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_macro_widget_initial_layout.xml'),
        'utf8',
      );
      expect(macroLayout).toContain('@string/widget_protein');
      expect(macroLayout).toContain('@string/widget_carbs');
      expect(macroLayout).toContain('@string/widget_fat');
      expect(macroLayout).toContain('@string/widget_preview_grams_protein');
    });

    it('keeps the calorie preview from clipping the long Polish phrase', () => {
      const calorieLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_widget_initial_layout.xml'),
        'utf8',
      );
      // The compact two-line presentation: caption line + value line.
      expect(calorieLayout).toContain('@string/widget_kcal_left_caption');
      expect(calorieLayout).toContain('@string/widget_preview_calories_value');
      // No single-line maxLines=1 full-phrase text remains.
      expect(calorieLayout).not.toMatch(
        /widget_preview_calories_left[\s\S]{0,200}maxLines="1"/,
      );
    });

    it('keeps the macro preview from clipping Węglowodany in the same row', () => {
      const macroLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_macro_widget_initial_layout.xml'),
        'utf8',
      );
      // The carbs label is rendered on its own stacked line (label above value).
      const carbsIndex = macroLayout.indexOf('@string/widget_carbs');
      const gramsCarbsIndex = macroLayout.indexOf('@string/widget_preview_grams_carbs');
      expect(carbsIndex).toBeGreaterThan(-1);
      expect(gramsCarbsIndex).toBeGreaterThan(carbsIndex);
      expect(gramsCarbsIndex - carbsIndex).toBeLessThan(900);
      expect(macroLayout).toContain('@string/widget_preview_macros_value');
    });
  });
});
