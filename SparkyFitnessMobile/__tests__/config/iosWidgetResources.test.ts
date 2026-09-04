import fs from 'fs';
import path from 'path';
import {
  SHIPPED_LOCALES,
  SOURCE_LOCALE,
} from '../../src/localization/localeRegistry';
import { parseIosStrings } from '../../scripts/validate-native-widget-locales.mjs';
import { galleryKeyUsages, helperKeyUsages } from './helpers/widgetSwiftKeys';

const WIDGET_ROOT = path.join(__dirname, '../../targets/widget');
const SHIPPED = Object.keys(SHIPPED_LOCALES);

/** The validator's reader understands escaped quotes; a naive regex silently drops them. */
function readStringsFile(locale: string): Map<string, string> {
  return parseIosStrings(
    fs.readFileSync(
      path.join(WIDGET_ROOT, `${locale}.lproj/Localizable.strings`),
      'utf8'
    )
  );
}

const REQUIRED_KEYS = [
  ...new Set(
    [...helperKeyUsages(), ...galleryKeyUsages()].map((usage) => usage.key)
  ),
].sort();

describe('iOS WidgetKit localization resources', () => {
  describe('Localizable.strings contract', () => {
    it('defines every key the Swift sources reference in the English catalog', () => {
      const en = readStringsFile(SOURCE_LOCALE);
      expect(REQUIRED_KEYS.length).toBeGreaterThan(0);
      const missing = [...helperKeyUsages(), ...galleryKeyUsages()]
        .filter((usage) => !en.has(usage.key))
        .map((usage) => `${usage.file}: ${usage.key}`);
      expect(missing).toEqual([]);
    });

    it('ships a Localizable.strings for every registered locale', () => {
      for (const locale of SHIPPED) {
        expect(
          fs.existsSync(
            path.join(WIDGET_ROOT, `${locale}.lproj/Localizable.strings`)
          )
        ).toBe(true);
      }
    });

    it('never emits a key the source does not define', () => {
      // Missing keys are allowed: localizedWidgetString falls back to en.lproj.
      // Extra keys would be dead weight and stay blocking.
      const en = new Set(readStringsFile(SOURCE_LOCALE).keys());
      for (const locale of SHIPPED) {
        for (const key of readStringsFile(locale).keys()) {
          expect(en.has(key)).toBe(true);
        }
      }
    });

    it('has non-empty values in every shipped locale', () => {
      for (const locale of SHIPPED) {
        for (const [key, value] of readStringsFile(locale)) {
          expect(`${locale}:${key}:${value}`).not.toBe(`${locale}:${key}:`);
        }
      }
    });

    it('keeps the two widget names distinct in every shipped locale', () => {
      for (const locale of SHIPPED) {
        const strings = readStringsFile(locale);
        expect(strings.get('widget.calorie.name')).not.toBe(
          strings.get('widget.macro.name')
        );
      }
    });

    it('does not use i18next placeholder syntax', () => {
      for (const locale of SHIPPED) {
        for (const value of readStringsFile(locale).values()) {
          expect(value).not.toMatch(/\{\{/);
          expect(value).not.toMatch(/\}\}/);
        }
      }
    });

    it('keeps format placeholder compatibility across every shipped locale', () => {
      const en = readStringsFile(SOURCE_LOCALE);
      const placeholderKeys = [
        'widget.grams',
        'widget.a11y.kcal_left',
        'widget.a11y.kcal',
      ];
      for (const locale of SHIPPED) {
        const target = readStringsFile(locale);
        for (const key of placeholderKeys) {
          const enCount = (en.get(key)?.match(/%@/g) ?? []).length;
          expect(enCount).toBeGreaterThan(0);
          if (!target.has(key)) continue;
          expect((target.get(key)?.match(/%@/g) ?? []).length).toBe(enCount);
        }
      }
    });
  });
});
