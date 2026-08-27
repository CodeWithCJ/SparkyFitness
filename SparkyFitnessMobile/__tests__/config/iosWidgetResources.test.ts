import fs from 'fs';
import path from 'path';

const WIDGET_ROOT = path.join(__dirname, '../../targets/widget');

function readStringsFile(relativePath: string): Map<string, string> {
  const content = fs.readFileSync(
    path.join(WIDGET_ROOT, relativePath),
    'utf8',
  );
  const map = new Map<string, string>();
  const regex = /"([^"]+)"\s*=\s*"([^"]*)";/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

const REQUIRED_KEYS = [
  'widget.calorie.name',
  'widget.calorie.description',
  'widget.macro.name',
  'widget.macro.description',
  'widget.kcal_left',
  'widget.kcal',
  'widget.food',
  'widget.burned',
  'widget.goal',
  'widget.protein',
  'widget.carbs',
  'widget.fat',
  'widget.grams',
  'widget.a11y.kcal_left',
  'widget.a11y.kcal',
  'widget.search_food',
  'widget.scan_barcode',
];

describe('iOS WidgetKit localization resources', () => {
  describe('Localizable.strings contract', () => {
    it('defines every required key in the English catalog', () => {
      const en = readStringsFile('en.lproj/Localizable.strings');
      for (const key of REQUIRED_KEYS) {
        expect(en.has(key)).toBe(true);
      }
    });

    it('defines the same key set in English, Polish and Spanish', () => {
      const en = [...readStringsFile('en.lproj/Localizable.strings').keys()].sort();
      const pl = [...readStringsFile('pl.lproj/Localizable.strings').keys()].sort();
      const es = [...readStringsFile('es.lproj/Localizable.strings').keys()].sort();

      expect(pl).toEqual(en);
      expect(es).toEqual(en);
    });

    it('has non-empty values in all shipped locales', () => {
      for (const locale of ['en.lproj', 'pl.lproj', 'es.lproj']) {
        const strings = readStringsFile(`${locale}/Localizable.strings`);
        for (const [key, value] of strings) {
          expect(`${locale}:${key}`).not.toBe('');
          expect(value).not.toBe('');
        }
      }
    });

    it('uses approved Polish translations for key labels', () => {
      const pl = readStringsFile('pl.lproj/Localizable.strings');

      expect(pl.get('widget.calorie.name')).toBe('Kalorie');
      expect(pl.get('widget.macro.name')).toBe('Makroskładniki');
      expect(pl.get('widget.protein')).toBe('Białko');
      expect(pl.get('widget.carbs')).toBe('Węglowodany');
      expect(pl.get('widget.fat')).toBe('Tłuszcz');
      expect(pl.get('widget.food')).toBe('Spożycie');
      expect(pl.get('widget.burned')).toBe('Spalone');
      expect(pl.get('widget.goal')).toBe('Cel');
      // Word order under the ring number: "1515 / kcal pozostało" reads as
      // "1515 kcal pozostało". The a11y string stays "Pozostało %@ kcal".
      expect(pl.get('widget.kcal_left')).toBe('kcal pozostało');
      expect(pl.get('widget.search_food')).toBe('Wyszukaj produkt');
      expect(pl.get('widget.scan_barcode')).toBe('Skanuj kod kreskowy');
    });

    it('uses approved Spanish translations for key labels', () => {
      const es = readStringsFile('es.lproj/Localizable.strings');

      expect(es.get('widget.calorie.name')).toBe('Calorías');
      expect(es.get('widget.macro.name')).toBe('Macros');
      expect(es.get('widget.protein')).toBe('Proteínas');
      expect(es.get('widget.carbs')).toBe('Carbohidratos');
      expect(es.get('widget.fat')).toBe('Grasas');
      expect(es.get('widget.food')).toBe('Comida');
      expect(es.get('widget.burned')).toBe('Quemadas');
      expect(es.get('widget.goal')).toBe('Objetivo');
      expect(es.get('widget.kcal_left')).toBe('kcal restantes');
      expect(es.get('widget.search_food')).toBe('Buscar comida');
      expect(es.get('widget.scan_barcode')).toBe('Escanear código');
    });

    it('keeps the two widget names distinct', () => {
      const en = readStringsFile('en.lproj/Localizable.strings');
      const pl = readStringsFile('pl.lproj/Localizable.strings');
      const es = readStringsFile('es.lproj/Localizable.strings');

      expect(en.get('widget.calorie.name')).not.toBe(en.get('widget.macro.name'));
      expect(pl.get('widget.calorie.name')).not.toBe(pl.get('widget.macro.name'));
      expect(es.get('widget.calorie.name')).not.toBe(es.get('widget.macro.name'));
    });

    it('does not use i18next placeholder syntax', () => {
      for (const locale of ['en.lproj', 'pl.lproj', 'es.lproj']) {
        const strings = readStringsFile(`${locale}/Localizable.strings`);
        for (const value of strings.values()) {
          expect(value).not.toMatch(/\{\{/);
          expect(value).not.toMatch(/\}\}/);
        }
      }
    });

    it('keeps format placeholder compatibility between EN, PL and ES', () => {
      const en = readStringsFile('en.lproj/Localizable.strings');
      const pl = readStringsFile('pl.lproj/Localizable.strings');
      const es = readStringsFile('es.lproj/Localizable.strings');

      for (const key of ['widget.grams', 'widget.a11y.kcal_left', 'widget.a11y.kcal']) {
        const enCount = (en.get(key)?.match(/%\@/g) ?? []).length;
        const plCount = (pl.get(key)?.match(/%\@/g) ?? []).length;
        const esCount = (es.get(key)?.match(/%\@/g) ?? []).length;
        expect(plCount).toBe(enCount);
        expect(esCount).toBe(enCount);
        expect(plCount).toBeGreaterThan(0);
        expect(esCount).toBeGreaterThan(0);
      }
    });
  });
});
