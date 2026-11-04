import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  SHIPPED_LOCALES,
  SOURCE_LOCALE,
} from '../../src/localization/localeRegistry';

const require = createRequire(pathToFileURL(__filename));
const { localeFromAndroidDir } =
  require('../../scripts/androidLocaleQualifiers.cjs') as {
    localeFromAndroidDir: (name: string, source: string) => string | null;
  };

const TARGETS_ROOT = path.join(__dirname, '../../targets/android-widget');

const KOTLIN_ROOT = path.join(
  TARGETS_ROOT,
  'kotlin',
  'com',
  'sparkyapps',
  'sparkyfitness',
  'widget'
);
const RES_ROOT = path.join(TARGETS_ROOT, 'res');

/**
 * Discover every Android widget resource directory below `res/`, mapping
 * locale tags with the same helper the native validator uses.
 */
function discoverWidgetLocaleDirs(): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of fs.readdirSync(RES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const locale = localeFromAndroidDir(entry.name, SOURCE_LOCALE);
    if (locale) result.set(locale, entry.name);
  }
  return result;
}

const WIDGET_LOCALE_DIRS = discoverWidgetLocaleDirs();
const SHIPPED_WIDGET_LOCALES = Object.keys(SHIPPED_LOCALES).filter((locale) =>
  WIDGET_LOCALE_DIRS.has(locale)
);

function readWidgetStringResources(
  locale: string = SOURCE_LOCALE
): { name: string; value: string }[] {
  const dir = WIDGET_LOCALE_DIRS.get(locale);
  if (!dir)
    throw new Error(
      `No Android widget resource directory for locale "${locale}"`
    );
  const xml = fs.readFileSync(
    path.join(RES_ROOT, dir, 'widget_strings.xml'),
    'utf8'
  );
  return extractStringResources(xml);
}

function extractStringResources(
  xml: string
): { name: string; value: string }[] {
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
    throw new Error(
      `Widget resource parser matched ${result.length} of ${declaredCount} string declarations`
    );
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
  'widget_open_diary',
  'widget_open_fasting',
  'widget_kcal_eaten',
  'widget_goal',
  'widget_food',
  'widget_burned',
  'widget_amount_of_goal',
  'tile_log_water',
  'tile_calories_left',
  'widget_preview_calories_left',
  'widget_preview_macros_left',
  'widget_preview_grams_protein',
  'widget_preview_grams_carbs',
  'widget_preview_grams_fat',
  'sparky_water_widget_name',
  'sparky_water_widget_description',
  'widget_water_title',
  'widget_water_amount',
  'widget_water_amount_no_goal',
  'widget_water_amount_empty',
  'widget_water_unit_ml',
  'widget_water_unit_oz',
  'widget_water_unit_liter',
  'widget_water_add',
  'widget_water_remove',
  'widget_water_status_sign_in',
  'widget_water_status_pick_container',
  'widget_water_status_expired',
  'widget_water_status_unreachable',
  'widget_water_status_failed',
  'widget_water_status_nothing_to_remove',
  'widget_preview_water_amount',
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
  'WaterWidget.kt.tmpl',
  'WaterWidgetReceiver.kt.tmpl',
  'CalorieWidgetModule.kt.tmpl',
  'WidgetLocale.kt.tmpl',
  'QuickSettingsTiles.kt.tmpl',
];

const WIDGET_INFO_XMLS = [
  'sparky_calorie_widget_info.xml',
  'sparky_macro_widget_info.xml',
  'sparky_water_widget_info.xml',
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
      for (const locale of SHIPPED_WIDGET_LOCALES) {
        const resources = new Set(
          readWidgetStringResources(locale).map((r) => r.name)
        );
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

    it('keeps the widget names distinct in every shipped locale', () => {
      const nameKeys = [
        'sparky_calorie_widget_name',
        'sparky_macro_widget_name',
        'sparky_water_widget_name',
      ];
      for (const locale of SHIPPED_WIDGET_LOCALES) {
        const strings = new Map(
          readWidgetStringResources(locale).map((r) => [r.name, r.value])
        );
        // An absent key is a non-blocking coverage gap that falls back to the
        // distinct English names; only a present pair can collapse two.
        const names = nameKeys
          .map((key) => strings.get(key))
          .filter((name): name is string => name !== undefined);
        expect(new Set(names).size).toBe(names.length);
      }
    });

    it('keeps placeholder positions compatible across all shipped widget locales', () => {
      const en = new Map(
        readWidgetStringResources().map((r) => [r.name, r.value])
      );
      const placeholderKeys = [
        'widget_kcal_left',
        'widget_grams',
        'widget_amount_of_goal',
        'widget_kcal_eaten',
        'widget_water_amount',
        'widget_water_amount_no_goal',
        'widget_water_amount_empty',
      ];
      for (const locale of SHIPPED_WIDGET_LOCALES) {
        if (locale === SOURCE_LOCALE) continue;
        const target = new Map(
          readWidgetStringResources(locale).map((r) => [r.name, r.value])
        );
        for (const key of placeholderKeys) {
          const enCount = (en.get(key)?.match(/%\d+\$[sd]/g) ?? []).length;
          const targetCount = (target.get(key)?.match(/%\d+\$[sd]/g) ?? [])
            .length;
          // Missing key: Android falls back to default `values` — allowed.
          if (!target.has(key) || target.get(key) === '') continue;
          expect(targetCount).toBe(enCount);
          expect(targetCount).toBeGreaterThan(0);
        }
      }
    });

    // Weblate writes a directory long before anyone ships it, so these assertions
    // cover the source and the registered locales; the rest are candidates and are
    // reported by the native validator instead.
    it('does not use i18next placeholder syntax in any shipped Android widget XML', () => {
      for (const locale of SHIPPED_WIDGET_LOCALES) {
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
        'utf8'
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
        'utf8'
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

    it('renders the Quick Settings tiles in the widget language from resources', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'QuickSettingsTiles.kt.tmpl'),
        'utf8'
      );
      expect(src).toMatch(
        /render\(tile, WidgetLocale\.localizedContext\(this\)\)/
      );
      expect(src).toMatch(/context\.getString\(labelRes\)/);
      expect(src).toMatch(/R\.string\.widget_kcal_left/);
      // No label or subtitle set from a hardcoded string.
      expect(src).not.toMatch(/tile\.(label|subtitle) = "/);
    });

    it('erases every snapshot on an account change, in order with the writes', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8'
      );
      expect(moduleSrc).toMatch(/fun clearSnapshots\(promise: Promise\)/);
      expect(moduleSrc).toMatch(/\.remove\(prefsKey\)\.commit\(\)/);
      // Every widget, its stored copy and every instance's state, each part
      // tried and redrawn past one that fails.
      expect(moduleSrc).toMatch(
        /CalorieWidgetReceiver\.PREFS_KEY_SNAPSHOT,\s*\n\s*CalorieWidget\(\),\s*\n\s*CalorieWidget\.SNAPSHOT_STATE_KEY/
      );
      expect(moduleSrc).toMatch(
        /MacroWidgetReceiver\.PREFS_KEY_SNAPSHOT,\s*\n\s*MacroWidget\(\),\s*\n\s*MacroWidget\.SNAPSHOT_STATE_KEY/
      );
      expect(moduleSrc).toMatch(
        /WaterWidgetReceiver\.PREFS_KEY_SNAPSHOT,\s*\n\s*WaterWidget\(\),\s*\n\s*WaterWidget\.SNAPSHOT_STATE_KEY/
      );
      // The water taps not yet sent were made for the previous account.
      expect(moduleSrc).toMatch(/\+ clearWaterWidget\(ctx\)/);
      expect(moduleSrc).toMatch(
        /WaterWidgetStore\.onAccountChangedLocked\(ctx\)/
      );
      expect(moduleSrc).toMatch(
        /updateAppWidgetState\(ctx, id\) \{ state -> state\.remove\(stateKey\) \}\s*\n\s*widget\.update\(ctx, id\)/
      );
      expect(moduleSrc.match(/failures \+= /g)?.length).toBeGreaterThanOrEqual(
        3
      );
      // Writes and the clear share one serial executor and one lock, so a
      // write for the previous account cannot land after the clear. The
      // water widget's buttons, worker and receiver take the same lock.
      expect(
        moduleSrc.match(/moduleScope\.launch\(snapshotWrites\)/g)
      ).toHaveLength(4);
      expect(
        moduleSrc.match(/WidgetSnapshotLock\.mutex\.withLock \{/g)
      ).toHaveLength(4);
      expect(moduleSrc).not.toMatch(/= Mutex\(\)/);

      // A live Glance session reads the stored copy at composition instead of
      // one captured at its start, which would bring a cleared snapshot back.
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).not.toMatch(/fallbackSnapshot/);
        expect(src).toMatch(
          /parseSnapshot\(state\[SNAPSHOT_STATE_KEY\]\) \?: loadSnapshot\(context\)/
        );
      }
      const waterSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidget.kt.tmpl'),
        'utf8'
      );
      expect(waterSrc).toMatch(
        /WaterWidgetStore\.parse\(state\[SNAPSHOT_STATE_KEY\]\)\s*\n\s*\?: WaterWidgetStore\.loadSnapshot\(context\)/
      );
    });

    it('keeps every water snapshot change under the shared widget lock', () => {
      const lock = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetSnapshots.kt'),
        'utf8'
      );
      expect(lock).toMatch(
        /object WidgetSnapshotLock \{\s*val mutex = Mutex\(\)/
      );

      const store = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetStore.kt'),
        'utf8'
      );
      // Everything that writes the snapshot says it needs the lock held.
      for (const fn of [
        'mergeFromAppLocked',
        'addTapLocked',
        'takePendingLocked',
        'applyOutcomeLocked',
        'applyTotalsLocked',
        'onAccountChangedLocked',
      ]) {
        expect(store).toMatch(new RegExp(`fun ${fn}\\(`));
      }
      // A late answer for the previous account is dropped.
      expect(store).toMatch(
        /if \(accountEpoch\(context\) != batch\.accountEpoch\) return/
      );
      expect(store).toMatch(/cancelUniqueWork\(WORK_NAME\)/);
      // Taps go out in order, one request at a time.
      expect(store).toMatch(/ExistingWorkPolicy\.APPEND_OR_REPLACE/);

      const actions = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetActions.kt'),
        'utf8'
      );
      expect(
        actions.match(/WidgetSnapshotLock\.mutex\.withLock \{/g)
      ).toHaveLength(4);
      // A worker first forgets taps an earlier one took and never answered
      // (stopped, or its process died), so they do not inflate the total.
      const doWork = actions.slice(
        actions.indexOf('override suspend fun doWork')
      );
      expect(doWork.indexOf('reclaimSendingLocked(context)')).toBeGreaterThan(
        -1
      );
      expect(doWork.indexOf('reclaimSendingLocked(context)')).toBeLessThan(
        doWork.indexOf('while (true)')
      );
      // An answer for a day the app has since moved past is dropped, and so
      // is a shortcut total sent before an account change.
      expect(store).toMatch(
        /if \(obj\.optString\("date", ""\) != batch\.date\) return/
      );
      expect(store).toMatch(
        /if \(accountEpoch != null && accountEpoch != accountEpoch\(context\)\) return/
      );
      // The manual part comes with every push and is never carried over.
      const merge = store.slice(
        store.indexOf('suspend fun mergeFromAppLocked'),
        store.indexOf('suspend fun addTapLocked')
      );
      expect(merge).not.toMatch(/manualMl/);
      expect(merge).toMatch(
        /if \(!isSnapshotToday\(incoming\.optString\("date", ""\)\)\) return/
      );
      // The request itself is made outside the lock.
      expect(actions).toMatch(
        /withContext\(Dispatchers\.IO\) \{ postWaterChange\(context, batch\.drinks\) \}/
      );

      const receiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetReceiver.kt.tmpl'),
        'utf8'
      );
      expect(receiver).toMatch(
        /WidgetSnapshotLock\.mutex\.withLock \{\s*\n\s*WaterWidgetStore\.applyTotalsLocked/
      );
    });

    it('shows the water buttons only for a container that logs plain water', () => {
      const store = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetStore.kt'),
        'utf8'
      );
      expect(store).toMatch(
        /val showsButtons: Boolean = canLog && \(drinkMl \?: 0\.0\) > 0\.0/
      );
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidget.kt.tmpl'),
        'utf8'
      );
      expect(src).toMatch(/if \(snapshot\?\.showsButtons == true\)/);
      expect(src).toMatch(/actionRunCallback<WaterChangeAction>/);
      // A greyed-out − stays clickable with a change of 0, which does
      // nothing, so the tap never reaches the open-the-app action behind it.
      expect(src).toMatch(/CHANGE_KEY to if \(enabled\) change else 0/);
      const actions = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetActions.kt'),
        'utf8'
      );
      expect(actions).toMatch(/if \(change == 0\) return/);
      // cornerRadius is a no-op before Android 12, so the buttons' shape
      // comes from a drawable there, in a light and a night colour.
      expect(src).toMatch(
        /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.S[\s\S]*R\.drawable\.bg_widget_water_button/
      );
      expect(src).toMatch(
        /if \(roundsCorners\) 0 else R\.drawable\.bg_widget_water_button_ripple/
      );
      expect(
        fs.readFileSync(
          path.join(RES_ROOT, 'drawable', 'bg_widget_water_button_ripple.xml'),
          'utf8'
        )
      ).toMatch(/<corners android:radius="20dp" \/>/);
      for (const dir of ['drawable', 'drawable-night']) {
        expect(
          fs.readFileSync(
            path.join(RES_ROOT, dir, 'bg_widget_water_button.xml'),
            'utf8'
          )
        ).toMatch(/<corners android:radius="20dp" \/>/);
      }
      expect(src).toMatch(
        /contentDescription = widgetContext\.getString\(R\.string\.widget_water_add\)/
      );
      // A greyed-out − is announced as having nothing to remove.
      expect(src).toMatch(
        /if \(snapshot\.canRemove\) \{\s*R\.string\.widget_water_remove\s*\} else \{\s*R\.string\.widget_water_status_nothing_to_remove\s*\}/
      );
      // Amounts use the widget locale's separators.
      expect(src).toMatch(
        /NumberFormat\.getNumberInstance\(currentWidgetLocale\(context\)\)/
      );
    });

    it('localizes accessibility labels in the Kotlin widgets', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(
          /widgetContext\.getString\(R\.string\.widget_search_food\)/
        );
        expect(src).toMatch(
          /widgetContext\.getString\(R\.string\.widget_scan_barcode\)/
        );
        expect(src).toMatch(/contentDescription = searchFoodLabel/);
        expect(src).toMatch(/contentDescription = scanBarcodeLabel/);
      }
    });

    it('uses locale-aware number formatting without hardcoding English separators', () => {
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8'
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
        'utf8'
      );
      // PR3 behavior (22415819): calorie widget truncates 1240.7 -> 1240.
      expect(calorieSrc).toMatch(
        /formatWidgetInt\(context, value\.toLong\(\)\)/
      );
      expect(calorieSrc).not.toMatch(/\.roundToLong\(\)/);

      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8'
      );
      // PR3 behavior (22415819): macro widget rounds 1240.7 -> 1241.
      expect(macroSrc).toMatch(
        /formatWidgetInt\(context, value\.roundToLong\(\)\)/
      );
      expect(macroSrc).not.toMatch(/value\.toLong\(\)/);

      // The shared helper formats ONLY: locale-aware separators, no business
      // rounding inside it (each caller keeps its pre-localization rule).
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8'
      );
      expect(helper).toMatch(
        /fun formatWidgetInt\(context: Context, value: Long\)/
      );
      expect(helper).not.toMatch(/roundToLong/);
      expect(helper).not.toMatch(/\.toLong\(\)/);
    });

    it('sets the next midnight alarm even when the midnight redraw fails', () => {
      // Each alarm fires once: a redraw that threw used to crash the process
      // and leave no alarm for the following night.
      for (const receiver of [
        'CalorieWidgetReceiver.kt.tmpl',
        'MacroWidgetReceiver.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, receiver), 'utf8');
        const midnight = src.slice(
          src.indexOf('if (intent.action == ACTION_MIDNIGHT_REFRESH)'),
          src.indexOf('if (intent.action == Intent.ACTION_LOCALE_CHANGED)')
        );
        expect(midnight).toMatch(
          /catch \(e: CancellationException\) \{\s*throw e\s*\} catch \(e: Exception\)/
        );
        expect(midnight).toMatch(
          /\} finally \{[\s\S]*scheduleMidnightRefresh\(context\)[\s\S]*pending\.finish\(\)/
        );
      }
    });

    it('updates every GlanceId and continues past a failing instance', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8'
      );
      expect(moduleSrc).toMatch(
        /getGlanceIds\(CalorieWidget::class\.java\)\.forEach/
      );
      expect(moduleSrc).toMatch(
        /getGlanceIds\(MacroWidget::class\.java\)\.forEach/
      );
      expect(moduleSrc).toMatch(
        /getGlanceIds\(WaterWidget::class\.java\)\.forEach/
      );
      expect(moduleSrc).not.toMatch(/getGlanceIds\([^)]*\)\[0\]/);
      expect(moduleSrc).toMatch(/catch \(e: CancellationException\)/);
      expect(moduleSrc).toMatch(/var firstFailure: Exception\?/);
    });

    it('keeps the midnight refresh mechanism with distinct alarm actions', () => {
      const calorieReceiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetReceiver.kt.tmpl'),
        'utf8'
      );
      const macroReceiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidgetReceiver.kt.tmpl'),
        'utf8'
      );
      const waterReceiver = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidgetReceiver.kt.tmpl'),
        'utf8'
      );

      // Each receiver's alarm carries its own action, so one widget's
      // alarm never replaces another's.
      const actions = new Set<string>();
      for (const src of [calorieReceiver, macroReceiver, waterReceiver]) {
        expect(src).toMatch(/ACTION_MIDNIGHT_REFRESH/);
        expect(src).toMatch(/updateAll\(context\)/);
        expect(src).toMatch(/scheduleMidnightRefresh\(context\)/);
        expect(src).toMatch(/cancelMidnightRefresh\(context\)/);
        expect(src).toMatch(/setAndAllowWhileIdle/);
        actions.add(
          src.match(/ACTION_MIDNIGHT_REFRESH =\s*\n?\s*"([^"]+)"/)?.[1] ??
            'missing'
        );
      }
      expect(actions.size).toBe(3);
      // The water receiver sets the next alarm even when its redraw fails,
      // since each alarm fires once.
      const waterMidnight = waterReceiver.slice(
        waterReceiver.indexOf('if (intent.action == ACTION_MIDNIGHT_REFRESH)'),
        waterReceiver.indexOf(
          'if (intent.action == Intent.ACTION_LOCALE_CHANGED)'
        )
      );
      expect(waterMidnight).toMatch(
        /catch \(e: CancellationException\) \{\s*throw e\s*\} catch \(e: Exception\)/
      );
      expect(waterMidnight).toMatch(
        /\} finally \{[\s\S]*scheduleMidnightRefresh\(context\)[\s\S]*pending\.finish\(\)/
      );
      expect(actions.has('missing')).toBe(false);
    });

    it('re-renders all widget instances on ACTION_LOCALE_CHANGED', () => {
      // Out-of-app App Language changes (Android Settings) must refresh the
      // widgets without the app foregrounding. Every receiver reacts to the
      // manifest-registered LOCALE_CHANGED broadcast and calls updateAll.
      for (const template of [
        'CalorieWidgetReceiver.kt.tmpl',
        'MacroWidgetReceiver.kt.tmpl',
        'WaterWidgetReceiver.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/Intent\.ACTION_LOCALE_CHANGED/);
        expect(src).toMatch(/glanceAppWidget\.updateAll\(context\)/);
      }
    });
  });

  describe('widget provider contract (resizable, classic default)', () => {
    // The widgets can be resized (#2050). Their default footprint and classic
    // composition stay as they were, and every other size step keeps that
    // content: the steps live in WidgetSizes.kt.
    const MIN_RESIZE: Record<string, [string, string]> = {
      'sparky_calorie_widget_info.xml': ['110dp', '40dp'],
      'sparky_macro_widget_info.xml': ['110dp', '110dp'],
      'sparky_water_widget_info.xml': ['110dp', '40dp'],
    };

    /** The DpSize steps of one set in WidgetSizes.kt, resolved to dp numbers. */
    function readWidgetSizes(setName: string): [number, number][] {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetSizes.kt'),
        'utf8'
      );
      const dps = new Map<string, number>();
      for (const m of src.matchAll(/val (\w+) = (\d+)\.dp/g)) {
        dps.set(m[1], Number(m[2]));
      }
      const sizes = new Map<string, [number, number]>();
      const dim = (token: string): number => {
        const literal = /^(\d+)\.dp$/.exec(token);
        if (literal) return Number(literal[1]);
        const member = /^(\w+)\.(width|height)$/.exec(token);
        if (member) {
          const size = sizes.get(member[1]);
          if (!size) throw new Error(`Unknown size ${member[1]}`);
          return member[2] === 'width' ? size[0] : size[1];
        }
        const value = dps.get(token);
        if (value === undefined) throw new Error(`Unknown dp ${token}`);
        return value;
      };
      for (const m of src.matchAll(/val (\w+) = DpSize\(([^,]+), ([^)]+)\)/g)) {
        sizes.set(m[1], [dim(m[2].trim()), dim(m[3].trim())]);
      }
      const set = new RegExp(
        `val ${setName}: Set<DpSize> = setOf\\(([\\s\\S]*?)\\n    \\)`
      ).exec(src);
      if (!set) throw new Error(`Missing ${setName}`);
      return set[1]
        .split('\n')
        .map((line) => line.trim().replace(/,$/, ''))
        .filter(Boolean)
        .map((entry) => {
          const pair = /^DpSize\(([^,]+), ([^)]+)\)$/.exec(entry);
          if (pair) return [dim(pair[1].trim()), dim(pair[2].trim())];
          const named = sizes.get(entry);
          if (!named) throw new Error(`Unknown step ${entry}`);
          return named;
        });
    }

    it('lets every widget be resized from its default footprint', () => {
      for (const infoXml of WIDGET_INFO_XMLS) {
        const src = fs.readFileSync(
          path.join(RES_ROOT, 'xml', infoXml),
          'utf8'
        );
        // A plain string: as a regex the pipe would need escaping.
        expect(src).toContain('android:resizeMode="horizontal|vertical"');
        expect(src).not.toMatch(/android:resizeMode="none"/);
        const [width, height] = MIN_RESIZE[infoXml];
        expect(src).toContain(`android:minResizeWidth="${width}"`);
        expect(src).toContain(`android:minResizeHeight="${height}"`);
        // No cap: a launcher turns a maximum into cells per screen
        // orientation, which can cap the widget below what is intended.
        expect(src).not.toMatch(/maxResize/);
      }
    });

    it('keeps the classic provider footprints (calorie 110x40 2x1, macro and water 110x110 2x2)', () => {
      const calorie = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_calorie_widget_info.xml'),
        'utf8'
      );
      const macro = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_macro_widget_info.xml'),
        'utf8'
      );

      // Calorie: classic 2x1 footprint with the pre-localization minimums.
      expect(calorie).toMatch(/android:minWidth="110dp"/);
      expect(calorie).toMatch(/android:minHeight="40dp"/);
      expect(calorie).toMatch(/android:targetCellWidth="2"/);
      expect(calorie).toMatch(/android:targetCellHeight="1"/);

      // Macro and water: classic 2x2 footprint.
      const water = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_water_widget_info.xml'),
        'utf8'
      );
      for (const square of [macro, water]) {
        expect(square).toMatch(/android:minWidth="110dp"/);
        expect(square).toMatch(/android:minHeight="110dp"/);
        expect(square).toMatch(/android:targetCellWidth="2"/);
        expect(square).toMatch(/android:targetCellHeight="2"/);
      }
    });

    it('registers every widget receiver for APPWIDGET_UPDATE and LOCALE_CHANGED', () => {
      // The config plugin declares the receiver intent-filter in the manifest.
      // LOCALE_CHANGED is an explicit exemption from the Android 8+ implicit
      // broadcast limits and covers per-app locale changes, so widgets can
      // re-render when the app language is changed outside the app.
      const pluginSrc = fs.readFileSync(
        path.join(__dirname, '../../plugins/withCalorieWidget.ts'),
        'utf8'
      );
      expect(pluginSrc).toMatch(/android\.appwidget\.action\.APPWIDGET_UPDATE/);
      expect(pluginSrc).toMatch(/android\.intent\.action\.LOCALE_CHANGED/);
      // Keep widget receivers private to external applications. Android system
      // broadcasts remain deliverable to non-exported manifest receivers.
      expect(pluginSrc).toMatch(/'android:exported': 'false'/);
      expect(pluginSrc).toMatch(/for \(const receiver of WIDGET_RECEIVERS\)/);
      for (const receiver of [
        'CalorieWidgetReceiver',
        'MacroWidgetReceiver',
        'WaterWidgetReceiver',
      ]) {
        expect(pluginSrc).toContain(`\${WIDGET_PACKAGE}.${receiver}\``);
      }
      expect(pluginSrc).toContain("'@xml/sparky_water_widget_info'");
      expect(pluginSrc).not.toMatch(/'android:exported': 'true'/);
    });

    it('draws every widget at its WidgetSizes steps', () => {
      const calorieSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'),
        'utf8'
      );
      const macroSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8'
      );
      expect(calorieSrc).toContain(
        'SizeMode.Responsive(WidgetSizes.calorieSizes)'
      );
      expect(macroSrc).toContain('SizeMode.Responsive(WidgetSizes.macroSizes)');
      expect(
        fs.readFileSync(path.join(KOTLIN_ROOT, 'WaterWidget.kt.tmpl'), 'utf8')
      ).toContain('SizeMode.Responsive(WidgetSizes.waterSizes)');

      for (const [setName, minimum] of [
        ['calorieSizes', [110, 40]],
        ['macroSizes', [110, 110]],
        ['waterSizes', [110, 40]],
      ] as const) {
        const steps = readWidgetSizes(setName);
        // RemoteViews takes at most 16 sizes, and throws past that.
        expect(steps.length).toBeLessThanOrEqual(16);
        // The smallest step is the provider minimum, so a widget at its
        // minimum size still matches a step.
        expect(steps).toContainEqual([...minimum]);
        for (const [width, height] of steps) {
          expect(width).toBeGreaterThanOrEqual(minimum[0]);
          expect(height).toBeGreaterThanOrEqual(minimum[1]);
        }
        // The launcher picks the closest step that fits; with the larger of
        // any two steps in the set, that is always the largest step that
        // fits, never a smaller layout.
        for (const a of steps) {
          for (const b of steps) {
            expect(steps).toContainEqual([
              Math.max(a[0], b[0]),
              Math.max(a[1], b[1]),
            ]);
          }
        }
      }

      // A Pixel 2x1 is about 102 dp tall, so the default calorie widget keeps
      // the classic layout there; the steps that add content are sized for
      // that content at font scale 1.3 (figures 154 dp), or a little under it
      // so a HyperOS 4x3 (260 dp) still gets the large macro layout.
      const calorieHeights = readWidgetSizes('calorieSizes').map(([, h]) => h);
      expect(calorieHeights).toContain(96);
      expect(Math.max(...calorieHeights)).toBeGreaterThanOrEqual(154);
      const macroHeights = readWidgetSizes('macroSizes').map(([, h]) => h);
      expect(Math.max(...macroHeights)).toBeGreaterThanOrEqual(252);
      // The classic water layout needs about 132 dp at font scale 1.0, and a
      // HyperOS 2x2 (167 dp) must keep it at the default size.
      const waterHeights = readWidgetSizes('waterSizes').map(([, h]) => h);
      expect(Math.max(...waterHeights)).toBeGreaterThanOrEqual(132);
      expect(Math.max(...waterHeights)).toBeLessThanOrEqual(167);
    });

    it('keeps the classic water layout at its default size and the buttons in every layout', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WaterWidget.kt.tmpl'),
        'utf8'
      );
      // Narrow and at least the classic height: the 2x2 composition with its
      // 14dp padding. One row tall it goes compact, and wide side by side.
      expect(src).toMatch(
        /wide -> SideBySide\([\s\S]*short -> Compact\([\s\S]*else -> Column\(modifier = GlanceModifier\.fillMaxWidth\(\)\)/
      );
      expect(src).toMatch(/else -> GlanceModifier\.padding\(14\.dp\)/);
      // One composable draws the − / + pair in all three layouts, so the
      // greyed-out − and its announcement are the same everywhere.
      expect([
        ...src.matchAll(/WaterButtons\(\s*widgetContext = /g),
      ]).toHaveLength(3);
      // The short layouts have no room for the status line under the bar: the
      // status goes under the amount (compact, when tall enough), in its
      // place (compact, on a shorter row) or in place of the bar (side by
      // side), so the amount stays wherever it can.
      expect([
        ...src.matchAll(/val status = statusRes\(snapshot\)/g),
      ]).toHaveLength(2);
      expect(src).toMatch(
        /if \(status == null \|\| roomForStatus\) \{\s*AmountText\(/
      );
      expect(src).toMatch(
        /roomForStatus = WidgetSizes\.fitsWaterStatusUnderAmount\(size\)/
      );
    });

    it('never uses SizeMode.Exact or lambda actions in the Glance widgets', () => {
      for (const template of [
        'CalorieWidget.kt.tmpl',
        'MacroWidget.kt.tmpl',
        'WaterWidget.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        // Exact rebuilds the widget on every resize; with Responsive the
        // launcher picks among the layouts already sent (Android 12L and up).
        expect(src).not.toMatch(/SizeMode\.Exact/);
        // With several sizes each layout is composed separately, so a lambda
        // action would run once per size.
        expect(src).not.toMatch(/clickable\s*\{/);
        expect(src).not.toMatch(/onClick\s*=/);
        expect(src).not.toMatch(/actionRunBlock/);
      }
    });

    it('keeps the classic calorie composition (one-line heading, progress, actions)', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'),
        'utf8'
      );
      // Classic structure: 12dp padding, one-line bold 18sp heading, 8dp gap +
      // 8dp progress, flexible spacer, then the 32dp action row with 24dp
      // icons and a 24dp divider.
      expect(src).toMatch(/\.padding\(12\.dp\)/);
      expect(src).toMatch(/fontSize = 18\.sp/);
      expect(src).toMatch(/maxLines = 1/);
      expect(src).toMatch(/\.height\(8\.dp\)/);
      expect(src).toMatch(/GlanceModifier\.defaultWeight\(\)/);
      expect(src).toMatch(/\.height\(32\.dp\)/);
      expect(src).toMatch(/iconSize = 24\.dp/);
      expect(src).toMatch(/\.height\(24\.dp\)/);
      // Search and scan are in every layout; only Diary depends on the width.
      expect(src).toMatch(/R\.drawable\.ic_widget_search, contentDescription/);
      expect(src).toMatch(/R\.drawable\.ic_widget_scan, contentDescription/);
      expect(src).toMatch(
        /if \(wide\) \{\s*add\(Shortcut\(diaryIntent, R\.drawable\.ic_widget_diary/
      );
    });

    it('shows the calorie figures against the food budget, not the base goal', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidget.kt.tmpl'),
        'utf8'
      );
      for (const key of ['widget_goal', 'widget_food', 'widget_burned']) {
        expect(src).toContain(`R.string.${key}`);
      }
      // Goal is eaten + remaining, as on the Dashboard; the snapshot's `goal`
      // leaves out the exercise calories some modes add back. No figures
      // without a goal, as on the Dashboard.
      expect(src).toMatch(
        /figures = if \(goal > 0\.0 && food != null && burned != null\) \{\s*CalorieFigures\(goal = food \+ remaining, food = food, burned = burned\)/
      );
      // Only wide and tall enough; the default 2x1 never shows them.
      expect(src).toMatch(
        /val figures = snapshot\?\.figures\?\.takeIf \{\s*wide && size\.height >= WidgetSizes\.CALORIE_FIGURES_HEIGHT\s*\}/
      );
      // Each label over its own value, in the order Goal, Food, Burned.
      expect(src).toMatch(
        /Figure\(context\.getString\(R\.string\.widget_goal\), formatInt\(context, figures\.goal\)\)\s*Figure\(context\.getString\(R\.string\.widget_food\), formatInt\(context, figures\.food\)\)\s*Figure\(context\.getString\(R\.string\.widget_burned\), formatInt\(context, figures\.burned\)\)/
      );
      // food and burned are optional, so a snapshot stored by an older app
      // still reads and just shows no figures.
      expect(src).toMatch(/val food = obj\.optionalDouble\("food"\)/);
      expect(src).toMatch(/val burned = obj\.optionalDouble\("burned"\)/);
      // In the flexible space, so a short widget cuts the figures and keeps
      // the shortcuts.
      expect(src).toMatch(
        /Box\(\s*modifier = GlanceModifier\.defaultWeight\(\)\.fillMaxWidth\(\),[\s\S]{0,200}FiguresRow\(/
      );
    });

    it('keeps the classic macro composition (centered content block, inline rows, actions)', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8'
      );
      // Classic container strategy: Box centers a CONTENT-SIZED column.
      expect(src).toMatch(/contentAlignment = Alignment\.Center/);
      expect(src).toMatch(
        /Column\(modifier = GlanceModifier\.fillMaxWidth\(\)\)/
      );
      expect(src).not.toMatch(
        /Column\(modifier = GlanceModifier\.fillMaxSize\(\)\)/
      );
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

    it('keeps the grams whole and in the translated unit', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8'
      );
      const row = src.slice(
        src.indexOf('private fun MacroRow('),
        src.indexOf(
          'LinearProgressIndicator(',
          src.indexOf('private fun MacroRow(')
        )
      );
      // The label takes the width the value leaves, so a long label is cut
      // and the number is not.
      expect(row).toMatch(
        /maxLines = 1,\s*modifier = GlanceModifier\.defaultWeight\(\)/
      );
      expect(row).not.toMatch(
        /Spacer\(modifier = GlanceModifier\.defaultWeight\(\)\)/
      );
      // "51 / 150" goes inside the gram string, so "г" or "克" stays.
      expect(src).toMatch(/R\.string\.widget_amount_of_goal/);
      expect(src).toMatch(/getString\(R\.string\.widget_grams, amount\)/);
    });

    it('shows the kcal eaten under the kcal left in the large macro layout', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'MacroWidget.kt.tmpl'),
        'utf8'
      );
      expect(src).toMatch(/R\.string\.widget_kcal_eaten/);
      // Wrapped with the header in one column, so the outer column keeps nine
      // children.
      expect(src).toMatch(
        /Column\(modifier = GlanceModifier\.fillMaxWidth\(\)\) \{\s*CalorieHeader\(context = widgetContext, snapshot = snapshot\)\s*EatenLine\(/
      );
    });

    it('puts the Diary and fasting shortcuts beside scan, never in a container of their own', () => {
      for (const template of ['CalorieWidget.kt.tmpl', 'MacroWidget.kt.tmpl']) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        const diaries = [...src.matchAll(/R\.drawable\.ic_widget_diary/g)];
        const fastings = [...src.matchAll(/R\.drawable\.ic_widget_fasting/g)];
        expect(diaries.length).toBeGreaterThan(0);
        expect(fastings).toHaveLength(diaries.length);
        for (const [shortcuts, before] of [
          [diaries, 'R.drawable.ic_widget_scan'],
          [fastings, 'R.drawable.ic_widget_diary'],
        ] as const) {
          for (const shortcut of shortcuts) {
            const previous = src.lastIndexOf(before, shortcut.index);
            expect(previous).toBeGreaterThan(-1);
            // Glance drops a container's children past the tenth, and the
            // macro column already has nine: the new shortcuts join the
            // existing row or column of shortcuts instead of adding one.
            expect(src.slice(previous, shortcut.index)).not.toMatch(
              /\b(Row|Column|Box)\(/
            );
          }
        }
        expect(src).toContain('sparkyfitnessmobile://diary');
        expect(src).toContain('sparkyfitnessmobile://fasting');
        expect(src).toMatch(
          /widgetContext\.getString\(R\.string\.widget_open_diary\)/
        );
        expect(src).toMatch(
          /widgetContext\.getString\(R\.string\.widget_open_fasting\)/
        );
      }
      // The fasting link needs its own entry in the app's linking config, on
      // the root stack beside the scan and search links (not under Tabs, and
      // not commented out).
      const app = fs.readFileSync(
        path.join(__dirname, '../../App.tsx'),
        'utf8'
      );
      const rootLink = app.match(/^( +)FoodScan: 'scan',$/m);
      expect(rootLink).not.toBeNull();
      expect(app).toMatch(
        new RegExp(`^${rootLink?.[1]}FastingDetail: 'fasting',$`, 'm')
      );
    });
  });

  describe('widget locale override contract', () => {
    it('owns the widget locale and render cache in a dedicated SharedPreferences namespace', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8'
      );
      expect(src).toMatch(/PREFS_NAME = "SparkyWidgetLocale"/);
      expect(src).toMatch(/KEY_LOCALE = "widgetLocale"/);
      expect(src).toMatch(
        /KEY_EFFECTIVE_RENDER_LOCALE = "effectiveRenderLocale"/
      );
      expect(src).toMatch(
        /getSharedPreferences\(PREFS_NAME, Context\.MODE_PRIVATE\)/
      );
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
        'utf8'
      );
      expect(moduleSrc).toMatch(/fun prepareWidgetLocale\(/);
      expect(moduleSrc).toMatch(/preference: String/);
      expect(moduleSrc).toMatch(/effectiveLanguage: String/);
      expect(moduleSrc).toMatch(
        /WidgetLocale\.prepareWidgetLocale\(ctx, preference, effectiveLanguage\)/
      );
      expect(moduleSrc).toMatch(
        /WidgetLocale\.bumpLocaleRenderRevision\(ctx, id\)/
      );
      const prepareIndex = moduleSrc.indexOf(
        'WidgetLocale.prepareWidgetLocale(ctx, preference, effectiveLanguage)'
      );
      const bumpIndex = moduleSrc.indexOf(
        'WidgetLocale.bumpLocaleRenderRevision(ctx, id)',
        prepareIndex
      );
      const resolveIndex = moduleSrc.indexOf(
        'promise.resolve(null)',
        bumpIndex
      );
      expect(prepareIndex).toBeGreaterThan(-1);
      expect(bumpIndex).toBeGreaterThan(prepareIndex);
      expect(resolveIndex).toBeGreaterThan(bumpIndex);
      expect(moduleSrc).toMatch(/var firstFailure: Exception\?/);
      expect(moduleSrc).toMatch(/RuntimeException\([^\n]+, firstFailure\)/);
      expect(moduleSrc).toMatch(
        /catch \(e: CancellationException\)\s*\{\s*throw e/
      );

      const bridge = fs.readFileSync(
        path.join(__dirname, '../../src/services/CalorieWidgetBridge.ts'),
        'utf8'
      );
      expect(bridge).toMatch(/prepareWidgetLocale\(/);
      expect(bridge).toMatch(/effectiveLanguage/);
    });

    it('resolves the render cache before LocaleManager on Android 13+', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8'
      );
      const renderContextIndex = src.indexOf(
        'fun localizedContext(context: Context): Context'
      );
      const cacheIndex = src.indexOf(
        'effectiveRenderLocale(context)',
        renderContextIndex
      );
      const platformIndex = src.indexOf(
        'currentPlatformLanguage(context)',
        renderContextIndex
      );
      expect(renderContextIndex).toBeGreaterThan(-1);
      expect(cacheIndex).toBeGreaterThan(renderContextIndex);
      expect(platformIndex).toBeGreaterThan(cacheIndex);
      expect(src).toMatch(/applicationLocales/);
      expect(src).toMatch(/systemLocales/);
      expect(src).toMatch(/createConfigurationContext\(config\)/);
      expect(src).not.toMatch(
        /if \(isNativeAppLanguageSupported\(\)\) return context/
      );
    });

    it('keeps API <=32 override behavior and removes the API 33 cache there', () => {
      const src = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocale.kt.tmpl'),
        'utf8'
      );
      expect(src).toMatch(/override\(context\)/);
      expect(src).toMatch(/editor\.remove\(KEY_EFFECTIVE_RENDER_LOCALE\)/);
      expect(src).toMatch(/editor\.remove\(KEY_LOCALE\)/);
      expect(src).toMatch(
        /editor\.putString\(KEY_LOCALE, normalizedPreference\)/
      );
      expect(src).toMatch(/\{\{SUPPORTED_LOCALES\}\}/);
      expect(src).toMatch(/\{\{FALLBACK_LOCALE\}\}/);
    });

    it('refreshes the broadcast locale payload before LOCALE_CHANGED updateAll', () => {
      for (const receiver of [
        'CalorieWidgetReceiver.kt.tmpl',
        'MacroWidgetReceiver.kt.tmpl',
        'WaterWidgetReceiver.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, receiver), 'utf8');
        const refreshIndex = src.indexOf(
          'refreshEffectiveRenderLocaleFromBroadcast(context, intent)'
        );
        const bumpIndex = src.indexOf(
          'WidgetLocale.bumpLocaleRenderRevision(context, id)',
          refreshIndex
        );
        const updateIndex = src.indexOf(
          'glanceAppWidget.updateAll(context)',
          bumpIndex
        );
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
        'utf8'
      );
      expect(locale).toMatch(/Intent\.EXTRA_PACKAGE_NAME/);
      expect(locale).toMatch(/Intent\.EXTRA_LOCALE_LIST/);
      // The API 33+ getParcelableExtra(String, Class<T>) overload is isolated
      // in WidgetLocaleApi33 (issue #2253); the common WidgetLocale object only
      // delegates to it.
      expect(locale).toMatch(/WidgetLocaleApi33\.getLocaleListExtra\(intent\)/);
      expect(locale).not.toMatch(
        /getParcelableExtra\(\s*Intent\.EXTRA_LOCALE_LIST,\s*LocaleList::class\.java,?\s*\)/
      );
      expect(locale).toMatch(/systemPlatformLanguage\(context\)/);
      expect(locale).toMatch(/refreshEffectiveRenderLocaleFromBroadcast/);
      expect(locale).not.toMatch(/refreshEffectiveRenderLocaleFromPlatform/);
      // The app-locale payload is the primary path. A stale
      // applicationLocales readback may only remain in the non-app fallback.
      const broadcastStart = locale.indexOf(
        'fun refreshEffectiveRenderLocaleFromBroadcast'
      );
      const broadcastEnd = locale.indexOf(
        '/** Reads only the API 33+ synchronized rendering cache. */',
        broadcastStart
      );
      const broadcastBody = locale.slice(broadcastStart, broadcastEnd);
      const appBranchStart = broadcastBody.indexOf(
        'val effective = if (hasAppLocaleExtras) {'
      );
      const appBranchEnd = broadcastBody.indexOf(
        '        } else {\n            val contextLocales',
        appBranchStart
      );
      const appPayloadBranch = broadcastBody.slice(
        appBranchStart,
        appBranchEnd
      );
      expect(appBranchStart).toBeGreaterThan(-1);
      expect(appBranchEnd).toBeGreaterThan(appBranchStart);
      expect(appPayloadBranch).not.toMatch(
        /currentPlatformLanguage\(context\)/
      );
      expect(appPayloadBranch).toMatch(
        /appLocales != null && !appLocales\.isEmpty/
      );
      expect(appPayloadBranch).toMatch(/languageFromLocaleList\(appLocales\)/);
      expect(broadcastBody).toMatch(/systemPlatformLanguage\(context\)/);
      expect(broadcastBody).toMatch(
        /editor\.putString\(KEY_EFFECTIVE_RENDER_LOCALE, effective\)/
      );

      // The API 33+ overload must live in the isolated helper (issue #2253).
      const helper = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'WidgetLocaleApi33.kt.tmpl'),
        'utf8'
      );
      expect(helper).toMatch(
        /getParcelableExtra\(\s*Intent\.EXTRA_LOCALE_LIST,\s*LocaleList::class\.java,?\s*\)/
      );
    });

    it('exposes prepareWidgetLocale through the native bridge', () => {
      const moduleSrc = fs.readFileSync(
        path.join(KOTLIN_ROOT, 'CalorieWidgetModule.kt.tmpl'),
        'utf8'
      );
      expect(moduleSrc).toMatch(/fun prepareWidgetLocale\(/);
      expect(moduleSrc).toMatch(
        /WidgetLocale\.prepareWidgetLocale\(ctx, preference, effectiveLanguage\)/
      );
    });

    it('makes every active widget composition observe the locale revision state', () => {
      for (const template of [
        'CalorieWidget.kt.tmpl',
        'MacroWidget.kt.tmpl',
        'WaterWidget.kt.tmpl',
      ]) {
        const src = fs.readFileSync(path.join(KOTLIN_ROOT, template), 'utf8');
        expect(src).toMatch(/currentState<Preferences>\(\)/);
        expect(src).toMatch(
          /currentState\(WidgetLocale\.LOCALE_RENDER_REVISION_STATE_KEY\)/
        );
        expect(src).not.toMatch(
          /state\[WidgetLocale\.LOCALE_RENDER_REVISION_STATE_KEY\]/
        );
      }
    });
  });

  describe('widget picker metadata', () => {
    it('uses resource labels and descriptions in the receiver info XML', () => {
      const calorieInfo = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_calorie_widget_info.xml'),
        'utf8'
      );
      const macroInfo = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_macro_widget_info.xml'),
        'utf8'
      );

      const waterInfo = fs.readFileSync(
        path.join(RES_ROOT, 'xml', 'sparky_water_widget_info.xml'),
        'utf8'
      );

      expect(calorieInfo).toContain('@string/sparky_widget_description');
      expect(macroInfo).toContain('@string/sparky_macro_widget_description');
      expect(waterInfo).toContain('@string/sparky_water_widget_description');
    });
  });

  describe('preview layouts', () => {
    it('references localized strings instead of hardcoded English text', () => {
      for (const layout of [
        'sparky_widget_initial_layout.xml',
        'sparky_macro_widget_initial_layout.xml',
        'sparky_water_widget_initial_layout.xml',
      ]) {
        const src = fs.readFileSync(
          path.join(RES_ROOT, 'layout', layout),
          'utf8'
        );
        const textValues = [...src.matchAll(/android:text="([^"]*)"/g)].map(
          (m) => m[1]
        );
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
        'utf8'
      );
      expect(macroLayout).toContain('@string/widget_protein');
      expect(macroLayout).toContain('@string/widget_carbs');
      expect(macroLayout).toContain('@string/widget_fat');
      expect(macroLayout).toContain('@string/widget_preview_grams_protein');
    });

    it('calorie preview mirrors the classic one-line heading', () => {
      const calorieLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_widget_initial_layout.xml'),
        'utf8'
      );
      // Classic one-line heading, not the two-line caption/value split.
      expect(calorieLayout).toContain('@string/widget_preview_calories_left');
      expect(calorieLayout).not.toContain('@string/widget_kcal_left_caption');
      expect(calorieLayout).not.toContain(
        '@string/widget_preview_calories_value'
      );
      // Progress + action row present like the classic default.
      expect(calorieLayout).toContain('@string/widget_search_food');
      expect(calorieLayout).toContain('@string/widget_scan_barcode');
    });

    it('macro preview mirrors the classic one-line header and inline rows', () => {
      const macroLayout = fs.readFileSync(
        path.join(RES_ROOT, 'layout', 'sparky_macro_widget_initial_layout.xml'),
        'utf8'
      );
      // One-line kcal header (no caption/value split).
      expect(macroLayout).toContain('@string/widget_preview_macros_left');
      expect(macroLayout).not.toContain('@string/widget_kcal_left_caption');
      expect(macroLayout).not.toContain('@string/widget_preview_macros_value');
      // Inline rows: label and gram value live in the SAME row.
      const carbsIndex = macroLayout.indexOf('@string/widget_carbs');
      const gramsCarbsIndex = macroLayout.indexOf(
        '@string/widget_preview_grams_carbs'
      );
      expect(carbsIndex).toBeGreaterThan(-1);
      expect(gramsCarbsIndex).toBeGreaterThan(carbsIndex);
      expect(gramsCarbsIndex - carbsIndex).toBeLessThan(900);
    });
  });
});
