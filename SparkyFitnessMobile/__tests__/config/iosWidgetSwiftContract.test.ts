import fs from 'fs';
import path from 'path';

const WIDGET_ROOT = path.join(__dirname, '../../targets/widget');

const SWIFT_FILES = [
  'index.swift',
  'widgets.swift',
  'macroWidget.swift',
  'SharedHelpers.swift',
];

function readSwift(relativePath: string): string {
  return fs.readFileSync(path.join(WIDGET_ROOT, relativePath), 'utf8');
}

describe('iOS WidgetKit Swift contract', () => {
  describe('hardcoded user-facing text removal', () => {
    const FORBIDDEN_LITERALS = [
      '"kcal left"',
      '"kcal"',
      '"Food"',
      '"Burned"',
      '"Goal"',
      '"Calorie Tracker"',
      '"Today\'s calorie intake at a glance."',
      '"Protein"',
      '"Carbs"',
      '"Fat"',
      '"Macros"',
      '"Today\'s protein, carbs, and fat at a glance."',
    ];

    // SharedHelpers.swift intentionally hosts the stable readable English
    // fallback map (fallbackWidgetString), so its literal strings are expected;
    // the rendering files must never inline user-facing English.
    it.each(SWIFT_FILES.filter((file) => file !== 'SharedHelpers.swift'))(
      '%s contains no forbidden English user-facing literals',
      (file) => {
        const src = readSwift(file);
        for (const literal of FORBIDDEN_LITERALS) {
          expect(src).not.toContain(literal);
        }
      },
    );

    it('resolves calorie labels through the localization helper', () => {
      const src = readSwift('widgets.swift');
      expect(src).toMatch(/localizedWidgetString\("widget\.kcal_left"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.food"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.burned"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.goal"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.a11y\.kcal_left"\)/);
    });

    it('resolves macro labels through the localization helper', () => {
      const src = readSwift('macroWidget.swift');
      expect(src).toMatch(/localizedWidgetString\("widget\.kcal"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.protein"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.carbs"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.fat"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.grams"\)/);
      expect(src).toMatch(/localizedWidgetString\("widget\.a11y\.kcal"\)/);
    });

    it('localizes gallery metadata through LocalizedStringKey keys', () => {
      const calorie = readSwift('widgets.swift');
      expect(calorie).toMatch(/configurationDisplayName\("widget\.calorie\.name"\)/);
      expect(calorie).toMatch(/\.description\("widget\.calorie\.description"\)/);

      const macro = readSwift('macroWidget.swift');
      expect(macro).toMatch(/configurationDisplayName\("widget\.macro\.name"\)/);
      expect(macro).toMatch(/\.description\("widget\.macro\.description"\)/);
    });
  });

  describe('number formatting', () => {
    it('formats numbers through a locale-aware helper, not a hardcoded locale', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toMatch(/func localizedNumberString/);
      expect(shared).toMatch(/NumberFormatter/);
      expect(shared).toMatch(/formatter\.locale = widgetLocale\(\)/);
      expect(shared).not.toContain('Locale(identifier: "en_US")');
    });

    it('does not manually assemble thousands separators', () => {
      for (const file of ['widgets.swift', 'macroWidget.swift', 'SharedHelpers.swift']) {
        const src = readSwift(file);
        expect(src).not.toContain('NumberFormatter.GroupingSeparator');
      }
    });

    it('keeps the existing business rounding (rounded())', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toMatch(/value\.rounded\(\)/);
    });
  });

  describe('widget identity and timeline reload', () => {
    it('keeps the widget kinds unchanged', () => {
      expect(readSwift('widgets.swift')).toContain('let kind: String = "widget"');
      expect(readSwift('macroWidget.swift')).toContain('let kind: String = "macroWidget"');
    });

    it('reloads both kinds by the same identifiers used by the JS bridge', () => {
      const js = fs.readFileSync(
        path.join(__dirname, '../../src/hooks/useIOSWidgetLanguageRefresh.ts'),
        'utf8',
      );
      expect(js).toContain("const WIDGET_KIND = 'widget'");
      expect(js).toContain("const MACRO_WIDGET_KIND = 'macroWidget'");

      const sync = fs.readFileSync(
        path.join(__dirname, '../../src/hooks/useWidgetSync.ts'),
        'utf8',
      );
      expect(sync).toContain("const WIDGET_KIND = 'widget'");
      expect(sync).toContain("const MACRO_WIDGET_KIND = 'macroWidget'");
    });

    it('keeps the timeline refresh cadence (15 minutes and midnight)', () => {
      for (const file of ['widgets.swift', 'macroWidget.swift']) {
        const src = readSwift(file);
        expect(src).toContain('byAdding: .minute, value: 15');
        expect(src).toContain('matching: DateComponents(hour: 0, minute: 0, second: 0)');
      }
    });
  });

  describe('platform-authoritative locale contract (final PR3)', () => {
    it('does not persist a widget-only locale override in the shared app group', () => {
      const shared = readSwift('SharedHelpers.swift');
      // iOS per-app language is OS-authoritative: no JS-written widgetLocale
      // value may survive (it could leave the widget stuck in an old language
      // after a per-app language change in iOS Settings).
      expect(shared).not.toContain('defaults.string(forKey: "widgetLocale")');
      expect(shared).not.toMatch(/widgetLocaleCode/);
      expect(shared).not.toMatch(/UserDefaults\(suiteName: appGroup\)/);
    });

    it('resolves the widget locale from the native .current locale', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toMatch(/func widgetLocale\(\) -> Locale \{\s*return \.current\s*\}/);
    });

    it('still shares widget data through the app group identifier', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toMatch(/func appGroupIdentifier\(\) -> String\?/);
      expect(shared).toContain('APP_GROUP_IDENTIFIER');
    });
  });

  describe('icon-only action accessibility', () => {
    it('exposes localized accessibility labels on both icon-only action buttons', () => {
      for (const file of ['widgets.swift', 'macroWidget.swift']) {
        const src = readSwift(file);
        expect(src).toMatch(/accessibilityLabel: localizedWidgetString\("widget\.search_food"\)/);
        expect(src).toMatch(/accessibilityLabel: localizedWidgetString\("widget\.scan_barcode"\)/);
      }
    });

    it('does not rely on SF Symbol names for user-facing accessibility', () => {
      for (const file of ['widgets.swift', 'macroWidget.swift']) {
        const src = readSwift(file);
        expect(src).not.toMatch(/accessibilityLabel: "magnifyingglass"/);
        expect(src).not.toMatch(/accessibilityLabel: "barcode\.viewfinder"/);
      }
    });
  });

  describe('localization fallback hardening', () => {
    it('falls back through the native and English bundles before the stable map', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toContain('forResource: "en", ofType: "lproj"');
      expect(shared).toContain('fallbackWidgetString');
      // No JS-written bundle is ever selected: the native bundle comes first.
      expect(shared).not.toContain('requested.flatMap');
      expect(shared).not.toContain('widgetLocaleCode()');
    });

    it('never returns the raw key from the localization helper', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toContain('!value.isEmpty && value != key');
    });

    it('covers the search/scan keys in the stable fallback map', () => {
      const shared = readSwift('SharedHelpers.swift');
      expect(shared).toContain('case "widget.search_food": return "Search food"');
      expect(shared).toContain('case "widget.scan_barcode": return "Scan barcode"');
    });
  });

  describe('target config', () => {
    it('keeps the widget target on @bacons/apple-targets, not expo-widgets', () => {
      const config = fs.readFileSync(
        path.join(WIDGET_ROOT, 'expo-target.config.js'),
        'utf8',
      );
      expect(config).toContain("type: 'widget'");
      expect(config).toContain('name:');
    });

    it('keeps the widget bundle in the widget extension', () => {
      const config = fs.readFileSync(
        path.join(WIDGET_ROOT, 'expo-target.config.js'),
        'utf8',
      );
      expect(config).toMatch(/bundleIdentifier/);
    });
  });
});
