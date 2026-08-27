import fs from 'fs';
import path from 'path';
import { SHIPPED_LOCALES, SOURCE_LOCALE } from '../../src/localization/localeRegistry';

const TARGETS_ROOT = path.join(
  __dirname,
  '../../targets/android-widget',
);

const KOTLIN_ROOT = path.join(TARGETS_ROOT, 'kotlin', 'com', 'sparkyapps', 'sparkyfitness', 'widget');
const RES_ROOT = path.join(TARGETS_ROOT, 'res');

/**
 * Discover every Android widget resource directory below `res/`, mapping
 * locale tags the same way the native validator does (`values` → source,
 * `values-de` → `de`, `values-b+de+DE` → `de-DE`).
 */
function discoverWidgetLocaleDirs(): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of fs.readdirSync(RES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'values') {
      result.set(SOURCE_LOCALE, entry.name);
    } else if (entry.name.startsWith('values-')) {
      const qualifier = entry.name.slice('values-'.length);
      const locale = qualifier.startsWith('b+') ? qualifier.slice(2).replaceAll('+', '-') : qualifier;
      result.set(locale, entry.name);
    }
  }
  return result;
}

const WIDGET_LOCALE_DIRS = discoverWidgetLocaleDirs();
const SHIPPED_WIDGET_LOCALES = Object.keys(SHIPPED_LOCALES).filter((locale) => WIDGET_LOCALE_DIRS.has(locale));

function readWidgetStringResources(locale: string = SOURCE_LOCALE): { name: string; value: string }[] {
  const dir = WIDGET_LOCALE_DIRS.get(locale);
  if (!dir) throw new Error(`No Android widget resource directory for locale "${locale}"`);
  const xml = fs.readFileSync(
    path.join(RES_ROOT, dir, 'widget_strings.xml'),
    'utf8',
  );
  return extractStringResources(xml);
}

function extractStringResources(xml: string): { name: string; value: string }[] {
  const result: { name: string; value: string }[] = [];
  const regex = /<string\b[^>]*\bname="([^"]+)"[^>]*>([^<]*)<\/string>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    result.push({
      name: match[1],
      value: match[2].replace(/\\'/g, "'").replace(/&apos;/g, "'"),
    });
  }
  const declaredCount = (xml.match(/<string\b/g) ?? []).length;
  if (result.length !== declaredCount) {
    throw new Error(`Widget resource parser matched ${result.length} of ${declaredCount} string declarations`);
  }
  return result;
}

const REQUIRED_KEYS = [
  'sparky_calorie_widget_name',
  'sparky_widget_description',
  'sparky_macro_widget_name',
  'sparky_macro_widget_description',
  'widget_kcal_left',
  'widget_kcal_left_empty',
  'widget_grams',
  'widget_protein',
  'widget_carbs',
  'widget_fat',
  'widget_search_food',
  'widget_scan_barcode',
  'widget_preview_calories_left',
  'widget_preview_macros_left',
  'widget_preview_grams_protein',
  'widget_preview_grams_carbs',
  'widget_preview_grams_fat',
];

// Keys that existed only for the removed resize/responsive experiment layouts.
// A key without a consumer must not linger in any locale.
const DEAD_RESIZE_KEYS = [
  'widget_kcal_left_caption',
  'widget_kcal_left_value',
  'widget_preview_calories_value',
  'widget_preview_macros_value',
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

    it('discovers every shipped locale and the source widget resource directory', () => {
      // The source locale must always have a widget resource directory.
      expect(WIDGET_LOCALE_DIRS.has(SOURCE_LOCALE)).toBe(true);
      // Every shipped locale must have a corresponding Android widget resource directory.
      for (const locale of Object.keys(SHIPPED_LOCALES)) {
        expect(WIDGET_LOCALE_DIRS.has(locale)).toBe(true);
      }
    });

    it('does not require target widget key sets to match source (missing allowed, extra forbidden)', () => {
      // Android resource resolution falls back to default `values` when a key
      // is absent from `values-<locale>`. Missing keys are coverage diagnostics,
      // not blocking. Extra keys that do not exist in source remain blocking.
      const en = new Set(readWidgetStringResources().map((r) => r.name));
      for (const locale of SHIPPED_WIDGET_LOCALES) {
        if (locale === SOURCE_LOCALE) continue;
        const target = readWidgetStringResources(locale);
        for (const resource of target) {
          expect(en.has(resource.name)).toBe(true);
        }
      }
    });

    it('does not keep resource keys that lost their consumer after the resize removal', () => {
      for (const locale of WIDGET_LOCALE_DIRS.keys()) {
        const resources = new Set(readWidgetStringResources(locale).map((r) => r.name));
        for (const key of DEAD_RESIZE_KEYS) {
          expect(resources.has(key)).toBe(false);
        }
      }
    });

    it('has non-empty source values (empty target values are allowed coverage gaps)', () => {
      const en = readWidgetStringResources();
      for (const resource of en) {
        expect(resource.value).not.toBe('');
      }
      // Target locale values may be empty (missing) — that is a non-blocking
      // coverage gap. Structural correctness of present values is verified by
      // the native widget validator and the placeholder tests below.
    });

    it('uses approved Polish translations with diacritics where natural', () => {
      // PL-specific regression guard: these translations were reviewed and
      // approved. This test is intentionally PL-specific (not registry-driven)
      // because it verifies known-good linguistic content, not architecture.
      const pl = new Map(
        readWidgetStringResources('pl').map((r) => [r.name, r.value]),
      );

      expect(pl.get('sparky_calorie_widget_name')).toBe('Kalorie');
      expect(pl.get('sparky_macro_widget_name')).toBe('Makroskładniki');
      expect(pl.get('widget_protein')).toBe('Białko');
      expect(pl.get('widget_carbs')).toBe('Węglowodany');
      expect(pl.get('widget_fat')).toBe('Tłuszcz');
      expect(pl.get('widget_search_food')).toBe('Wyszukaj produkt');
      expect(pl.get('widget_scan_barcode')).toBe('Skanuj kod kreskowy');
      expect(pl.get('widget_kcal_left')).toBe('Pozostało %1$s kcal');
    });

    it('uses approved Spanish translations with diacritics where natural', () => {
      const es = new Map(
        readWidgetStringResources('es').map((r) => [r.name, r.value]),
      );

      expect(es.get('sparky_calorie_widget_name')).toBe('Calorías');
      expect(es.get('sparky_macro_widget_name')).toBe('Macros');
      expect(es.get('widget_protein')).toBe('Proteínas');
      expect(es.get('widget_carbs')).toBe('Carbohidratos');
      expect(es.get('widget_fat')).toBe('Grasas');
      expect(es.get('widget_search_food')).toBe('Buscar comida');
      expect(es.get('widget_scan_barcode')).toBe('Escanear código');
      expect(es.get('widget_kcal_left')).toBe('%1$s kcal restantes');
    });

    it('keeps placeholder positions compatible across all shipped widget locales', () => {
      const en = new Map(
        readWidgetStringResources().map((r) => [r.name, r.value]),
      );
      const placeholderKeys = [
        'widget_kcal_left',
        'widget_grams',
      ];
      for (const locale of SHIPPED_WIDGET_LOCALES) {
        if (locale === SOURCE_LOCALE) continue;
        const target = new Map(readWidgetStringResources(locale).map((r) => [r.name, r.value]));
        for (const key of placeholderKeys) {
          const enCount = (en.get(key)?.match(/%\d+\$[sd]/g) ?? []).length;
          const targetCount = (target.get(key)?.match(/%\d+\$[sd]/g) ?? []).length;
          // Missing key: Android falls back to default `values` — allowed.
          if (!target.has(key) || target.get(key) === '') continue;
          expect(targetCount).toBe(enCount);
          expect(targetCount).toBeGreaterThan(0);
        }
      }
    });

    it('does not use i18next placeholder syntax in any Android widget XML', () => {
      for (const locale of WIDGET_LOCALE_DIRS.keys()) {
        for (const resource of readWidgetStringResources(locale)) {
          expect(resource.value).not.toMatch(/\{\{/);
          expect(resource.value).not.toMatch(/\}\}/);
        }
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
      expect(calorieSrc).toMatch(/R\.string\.widget_kcal_left_empty/);
      expect(calorieSrc).toMatch(/R\.string\.widget_search_food/);
      expect(calorieSrc).toMatch(/R\.string\.widget_scan_barcode/);
      // Classic one-line heading: no caption/value split in the calorie widget.
      expect(calorieSrc).not.toMatch(/R\.string\.widget_kcal_left_caption/);
      expect(calorieSrc).not.toMatch(/R\.string\.widget_kcal_left_value/);

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
        'widget_kcal_left_empty',
        'widget_grams',
      ]) {
        expect(macroSrc).toMatch(new RegExp(`R\\.string\\.${ref}`));
      }
      // Classic one-line header: no caption/value split in the macro widget.
      expect(macroSrc).not.toMatch(/R\.string\.widget_kcal_left_caption/);
      expect(macroSrc).not.toMatch(/R\.string\.widget_kcal_left_value/);
    });

    it('localizes accessibility labels in the Kotlin widgets', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/widgetContext\.getString\(R\.string\.widget_search_food\)/);
        expect(src).toMatch(/widgetContext\.getString\(R\.string\.widget_scan_barcode\)/);
        expect(src).toMatch(/contentDescription = searchFoodLabel/);
        expect(src).toMatch(/contentDescription = scanBarcodeLabel/);
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
      }
    });

    it('keeps the pre-localization per-widget rounding (calorie truncates, macro rounds)', () => {
      const calorieSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'),
        'utf8',
      );
      // PR3 behavior (22415819): calorie widget truncates 1240.7 -> 1240.
      expect(calorieSrc).toMatch(/formatWidgetInt\(context, value\.toLong\(\)\)/);
      expect(calorieSrc).not.toMatch(/\.roundToLong\(\)/);

      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8',
      );
      // PR3 behavior (22415819): macro widget rounds 1240.7 -> 1241.
      expect(macroSrc).toMatch(/formatWidgetInt\(context, value\.roundToLong\(\)\)/);
      expect(macroSrc).not.toMatch(/value\.toLong\(\)/);

      // The shared helper formats ONLY: locale-aware separators, no business
      // rounding inside it (each caller keeps its pre-localization rule).
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(helper).toMatch(/fun formatWidgetInt\(context: Context, value: Long\)/);
      expect(helper).not.toMatch(/roundToLong/);
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
      expect(moduleSrc).toMatch(/catch \(e: CancellationException\)/);
      expect(moduleSrc).toMatch(/var firstFailure: Exception\?/);
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

    it('re-renders all widget instances on ACTION_LOCALE_CHANGED', () => {
      // Out-of-app App Language changes (Android Settings) must refresh the
      // widgets without the app foregrounding. Both receivers react to the
      // manifest-registered LOCALE_CHANGED broadcast and call updateAll.
      for (const template of [
        'CalorieWidgetReceiver.kt.tmpl',
        'MacroWidgetReceiver.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/Intent\.ACTION_LOCALE_CHANGED/);
        expect(src).toMatch(/glanceAppWidget\.updateAll\(context\)/);
      }
    });
  });

  describe('widget provider contract (no resize)', () => {
    // The pre-localization widgets (22415819) define the base visual language.
    // Localization must not change the default footprint or composition: the
    // classic 2x1 calorie card and 2x2 macro card stay fixed and are NOT
    // resizable. This PR removed the resize/responsive experiment entirely.
    it('keeps resizeMode="none" on both provider XMLs', () => {
      for (const infoXml of WIDGET_INFO_XMLS) {
        const src = fs.readFileSync(path.join(RES_ROOT, 'xml', infoXml), 'utf8');
        expect(src).toMatch(/android:resizeMode="none"/);
      }
    });

    it('never re-enables horizontal or vertical resizing', () => {
      for (const infoXml of WIDGET_INFO_XMLS) {
        const src = fs.readFileSync(path.join(RES_ROOT, 'xml', infoXml), 'utf8');
        expect(src).not.toMatch(/resizeMode="horizontal\|vertical"/);
        expect(src).not.toMatch(/minResizeWidth/);
        expect(src).not.toMatch(/minResizeHeight/);
      }
    });

    it('keeps the classic provider footprints (calorie 110x40 2x1, macro 110x110 2x2)', () => {
      const calorie = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_calorie_widget_info.xml'),
        'utf8',
      );
      const macro = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_macro_widget_info.xml'),
        'utf8',
      );

      // Calorie: classic 2x1 footprint with the pre-localization minimums.
      expect(calorie).toMatch(/android:minWidth="110dp"/);
      expect(calorie).toMatch(/android:minHeight="40dp"/);
      expect(calorie).toMatch(/android:targetCellWidth="2"/);
      expect(calorie).toMatch(/android:targetCellHeight="1"/);

      // Macro: classic 2x2 footprint.
      expect(macro).toMatch(/android:minWidth="110dp"/);
      expect(macro).toMatch(/android:minHeight="110dp"/);
      expect(macro).toMatch(/android:targetCellWidth="2"/);
      expect(macro).toMatch(/android:targetCellHeight="2"/);
    });

    it('registers both widget receivers for APPWIDGET_UPDATE and LOCALE_CHANGED', () => {
      // The config plugin declares the receiver intent-filter in the manifest.
      // LOCALE_CHANGED is an explicit exemption from the Android 8+ implicit
      // broadcast limits and covers per-app locale changes, so widgets can
      // re-render when the app language is changed outside the app.
      const pluginSrc = fs.readFileSync(
        path.join(__dirname, '../../plugins/withCalorieWidget.ts'),
        'utf8',
      );
      expect(pluginSrc).toMatch(/android\.appwidget\.action\.APPWIDGET_UPDATE/);
      expect(pluginSrc).toMatch(/android\.intent\.action\.LOCALE_CHANGED/);
      // Keep widget receivers private to external applications. Android system
      // broadcasts remain deliverable to non-exported manifest receivers.
      expect(pluginSrc).toMatch(/'android:exported': 'false'/);
      expect(pluginSrc).toMatch(/for \(const receiver of WIDGET_RECEIVERS\)/);
      expect(pluginSrc).not.toMatch(/'android:exported': 'true'/);
    });

    it('restores the classic macro size mode (single 200x200 responsive size)', () => {
      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8',
      );
      // The pre-localization SizeMode: one responsive size matching the fixed
      // 2x2 footprint — NOT resizable, NOT SizeMode.Exact.
      expect(macroSrc).toMatch(
        /SizeMode\.Responsive\(\s*setOf\(DpSize\(200\.dp, 200\.dp\)\),?\s*\)/,
      );
    });

    it('never uses SizeMode.Exact, LocalSize.current or size-driven logic in the Glance widgets', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).not.toMatch(/import androidx\.glance\.LocalSize/);
        expect(src).not.toMatch(/LocalSize\.current/);
        expect(src).not.toMatch(/SizeMode\.Exact/);
        expect(src).not.toMatch(/size\.width/);
        expect(src).not.toMatch(/size\.height/);
        expect(src).not.toMatch(/showActions/);
        expect(src).not.toMatch(/headingFontSize/);
        expect(src).not.toMatch(/wide/);
      }
    });

    it('keeps the classic calorie composition (one-line heading, progress, actions)', () => {
      const src = fs.readFileSync(path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'), 'utf8');
      // Classic structure: 12dp padding, one-line bold 18sp heading, 8dp gap +
      // 8dp progress, flexible spacer, then the 32dp action row with 24dp
      // icons and a 24dp divider.
      expect(src).toMatch(/\.padding\(12\.dp\)/);
      expect(src).toMatch(/fontSize = 18\.sp/);
      expect(src).toMatch(/maxLines = 1/);
      expect(src).toMatch(/\.height\(8\.dp\)/);
      expect(src).toMatch(/GlanceModifier\.defaultWeight\(\)/);
      expect(src).toMatch(/\.height\(32\.dp\)/);
      expect(src).toMatch(/\.size\(24\.dp\)/);
      expect(src).toMatch(/\.height\(24\.dp\)/);
      // Actions are always part of the classic default; no height-based hiding.
      expect(src).toMatch(/R\.drawable\.ic_widget_search/);
      expect(src).toMatch(/R\.drawable\.ic_widget_scan/);
    });

    it('keeps the classic macro composition (centered content block, inline rows, actions)', () => {
      const src = fs.readFileSync(path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'), 'utf8');
      // Classic container strategy: Box centers a CONTENT-SIZED column.
      expect(src).toMatch(/contentAlignment = Alignment\.Center/);
      expect(src).toMatch(/Column\(modifier = GlanceModifier\.fillMaxWidth\(\)\)/);
      expect(src).not.toMatch(/Column\(modifier = GlanceModifier\.fillMaxSize\(\)\)/);
      // The kcal header and all macro rows are always rendered.
      expect(src).toMatch(/CalorieHeader\(/);
      expect(src).toMatch(/MacroRows\(/);
      // Rows stay inline: colored dot + label + value on one line.
      expect(src).toMatch(/R\.string\.widget_grams/);
      // The action row is always rendered in the classic footprint.
      expect(src).toMatch(/R\.drawable\.ic_widget_search/);
      expect(src).toMatch(/R\.drawable\.ic_widget_scan/);
      expect(src).toMatch(/\.height\(40\.dp\)/);
      expect(src).not.toMatch(/if \(showActions\)/);
    });
  });

  describe('widget locale override contract', () => {
    it('owns the widget locale and render cache in a dedicated SharedPreferences namespace', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(src).toMatch(/PREFS_NAME = "SparkyWidgetLocale"/);
      expect(src).toMatch(/KEY_LOCALE = "widgetLocale"/);
      expect(src).toMatch(/KEY_EFFECTIVE_RENDER_LOCALE = "effectiveRenderLocale"/);
      expect(src).toMatch(/getSharedPreferences\(PREFS_NAME, Context\.MODE_PRIVATE\)/);
      expect(src).toMatch(/LOCALE_RENDER_REVISION_STATE_KEY/);
      expect(src).toMatch(/longPreferencesKey\(\"localeRenderRevision\"\)/);
      expect(src).toMatch(/updateAppWidgetState\(context, glanceId\)/);
      expect(src).toMatch(/previous \+ 1L/);
      expect(src).not.toMatch(/System\.currentTimeMillis|System\.nanoTime/);
      expect(src).toMatch(/synchronized rendering cache/);
      expect(src).toMatch(/not a user preference or locale authority/);
    });

    it('prepares preference and effective language atomically before reload', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8',
      );
      expect(moduleSrc).toMatch(/fun prepareWidgetLocale\(/);
      expect(moduleSrc).toMatch(/preference: String/);
      expect(moduleSrc).toMatch(/effectiveLanguage: String/);
      expect(moduleSrc).toMatch(/WidgetLocale\.prepareWidgetLocale\(ctx, preference, effectiveLanguage\)/);
      expect(moduleSrc).toMatch(/WidgetLocale\.bumpLocaleRenderRevision\(ctx, id\)/);
      const prepareIndex = moduleSrc.indexOf('WidgetLocale.prepareWidgetLocale(ctx, preference, effectiveLanguage)');
      const bumpIndex = moduleSrc.indexOf('WidgetLocale.bumpLocaleRenderRevision(ctx, id)', prepareIndex);
      const resolveIndex = moduleSrc.indexOf('promise.resolve(null)', bumpIndex);
      expect(prepareIndex).toBeGreaterThan(-1);
      expect(bumpIndex).toBeGreaterThan(prepareIndex);
      expect(resolveIndex).toBeGreaterThan(bumpIndex);
      expect(moduleSrc).toMatch(/var firstFailure: Exception\?/);
      expect(moduleSrc).toMatch(/RuntimeException\([^\n]+, firstFailure\)/);
      expect(moduleSrc).toMatch(/catch \(e: CancellationException\)\s*\{\s*throw e/);

      const bridge = fs.readFileSync(
        path.join(__dirname, '../../src/services/CalorieWidgetBridge.ts'),
        'utf8',
      );
      expect(bridge).toMatch(/prepareWidgetLocale\(/);
      expect(bridge).toMatch(/effectiveLanguage/);
    });

    it('resolves the render cache before LocaleManager on Android 13+', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      const renderContextIndex = src.indexOf('fun localizedContext(context: Context): Context');
      const cacheIndex = src.indexOf('effectiveRenderLocale(context)', renderContextIndex);
      const platformIndex = src.indexOf('currentPlatformLanguage(context)', renderContextIndex);
      expect(renderContextIndex).toBeGreaterThan(-1);
      expect(cacheIndex).toBeGreaterThan(renderContextIndex);
      expect(platformIndex).toBeGreaterThan(cacheIndex);
      expect(src).toMatch(/applicationLocales/);
      expect(src).toMatch(/systemLocales/);
      expect(src).toMatch(/createConfigurationContext\(config\)/);
      expect(src).not.toMatch(/if \(isNativeAppLanguageSupported\(\)\) return context/);
    });

    it('keeps API <=32 override behavior and removes the API 33 cache there', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(src).toMatch(/override\(context\)/);
      expect(src).toMatch(/editor\.remove\(KEY_EFFECTIVE_RENDER_LOCALE\)/);
      expect(src).toMatch(/editor\.remove\(KEY_LOCALE\)/);
      expect(src).toMatch(/editor\.putString\(KEY_LOCALE, normalizedPreference\)/);
      expect(src).toMatch(/\{\{SUPPORTED_LOCALES\}\}/);
      expect(src).toMatch(/\{\{FALLBACK_LOCALE\}\}/);
    });

    it('refreshes the broadcast locale payload before LOCALE_CHANGED updateAll', () => {
      for (const receiver of ['CalorieWidgetReceiver.kt.tmpl', 'MacroWidgetReceiver.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, receiver), 'utf8');
        const refreshIndex = src.indexOf('refreshEffectiveRenderLocaleFromBroadcast(context, intent)');
        const bumpIndex = src.indexOf('WidgetLocale.bumpLocaleRenderRevision(context, id)', refreshIndex);
        const updateIndex = src.indexOf('glanceAppWidget.updateAll(context)', bumpIndex);
        expect(refreshIndex).toBeGreaterThan(-1);
        expect(bumpIndex).toBeGreaterThan(refreshIndex);
        expect(updateIndex).toBeGreaterThan(bumpIndex);
        expect(src).toMatch(/GlanceAppWidgetManager\(context\)/);
        expect(src).toMatch(/catch \(e: CancellationException\)/);
        expect(src).toMatch(/throw e/);
        expect(src).toMatch(/catch \(e: Exception\)/);
        expect(src).toMatch(/pending.finish\(\)/);
      }

      const locale = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8',
      );
      expect(locale).toMatch(/Intent\.EXTRA_PACKAGE_NAME/);
      expect(locale).toMatch(/Intent\.EXTRA_LOCALE_LIST/);
      expect(locale).toMatch(/getParcelableExtra\(\s*Intent\.EXTRA_LOCALE_LIST,\s*LocaleList::class\.java,?\s*\)/);
      expect(locale).toMatch(/systemPlatformLanguage\(context\)/);
      expect(locale).toMatch(/refreshEffectiveRenderLocaleFromBroadcast/);
      expect(locale).not.toMatch(/refreshEffectiveRenderLocaleFromPlatform/);
      // The app-locale payload is the primary path. A stale
      // applicationLocales readback may only remain in the non-app fallback.
      const broadcastStart = locale.indexOf('fun refreshEffectiveRenderLocaleFromBroadcast');
      const broadcastEnd = locale.indexOf('/** Reads only the API 33+ synchronized rendering cache. */', broadcastStart);
      const broadcastBody = locale.slice(broadcastStart, broadcastEnd);
      const appBranchStart = broadcastBody.indexOf('val effective = if (hasAppLocaleExtras) {');
      const appBranchEnd = broadcastBody.indexOf(
        '        } else {\n            val contextLocales',
        appBranchStart,
      );
      const appPayloadBranch = broadcastBody.slice(appBranchStart, appBranchEnd);
      expect(appBranchStart).toBeGreaterThan(-1);
      expect(appBranchEnd).toBeGreaterThan(appBranchStart);
      expect(appPayloadBranch).not.toMatch(/currentPlatformLanguage\(context\)/);
      expect(appPayloadBranch).toMatch(/appLocales != null && !appLocales\.isEmpty/);
      expect(appPayloadBranch).toMatch(/languageFromLocaleList\(appLocales\)/);
      expect(broadcastBody).toMatch(/systemPlatformLanguage\(context\)/);
      expect(broadcastBody).toMatch(/editor\.putString\(KEY_EFFECTIVE_RENDER_LOCALE, effective\)/);
    });

    it('exposes prepareWidgetLocale through the native bridge', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8',
      );
      expect(moduleSrc).toMatch(/fun prepareWidgetLocale\(/);
      expect(moduleSrc).toMatch(/WidgetLocale\.prepareWidgetLocale\(ctx, preference, effectiveLanguage\)/);
    });

    it('makes both active widget compositions observe the locale revision state', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/currentState<Preferences>\(\)/);
        expect(src).toMatch(/currentState\(WidgetLocale\.LOCALE_RENDER_REVISION_STATE_KEY\)/);
        expect(src).not.toMatch(/state\[WidgetLocale\.LOCALE_RENDER_REVISION_STATE_KEY\]/);
      }
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

    it('calorie preview mirrors the classic one-line heading', () => {
      const calorieLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_widget_initial_layout.xml'),
        'utf8',
      );
      // Classic one-line heading, not the two-line caption/value split.
      expect(calorieLayout).toContain('@string/widget_preview_calories_left');
      expect(calorieLayout).not.toContain('@string/widget_kcal_left_caption');
      expect(calorieLayout).not.toContain('@string/widget_preview_calories_value');
      // Progress + action row present like the classic default.
      expect(calorieLayout).toContain('@string/widget_search_food');
      expect(calorieLayout).toContain('@string/widget_scan_barcode');
    });

    it('macro preview mirrors the classic one-line header and inline rows', () => {
      const macroLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_macro_widget_initial_layout.xml'),
        'utf8',
      );
      // One-line kcal header (no caption/value split).
      expect(macroLayout).toContain('@string/widget_preview_macros_left');
      expect(macroLayout).not.toContain('@string/widget_kcal_left_caption');
      expect(macroLayout).not.toContain('@string/widget_preview_macros_value');
      // Inline rows: label and gram value live in the SAME row.
      const carbsIndex = macroLayout.indexOf('@string/widget_carbs');
      const gramsCarbsIndex = macroLayout.indexOf('@string/widget_preview_grams_carbs');
      expect(carbsIndex).toBeGreaterThan(-1);
      expect(gramsCarbsIndex).toBeGreaterThan(carbsIndex);
      expect(gramsCarbsIndex - carbsIndex).toBeLessThan(900);
    });
  });
});
