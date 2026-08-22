import type { TFunction } from 'i18next';
import { formatLocalizedNumber } from '../localization';

/**
 * Localized presentation helpers for the controlled FOOD_FORM_UNIT_GROUPS
 * canonical set (shared source). The raw canonical unit/group strings are
 * technical identity values (used for conversions, matching, storage, variant
 * identity) and are NEVER mutated. This module only maps those controlled
 * values to localized UI copy at the presentation boundary. Unknown /
 * custom / server-defined units are returned literally.
 *
 * A translator may be passed explicitly for testability; otherwise the single
 * canonical active i18n instance is used (so presentation follows the active
 * application language with no second localization system).
 */


/** Controlled group labels from FOOD_FORM_UNIT_GROUPS. */
const GROUP_KEYS: Record<string, string> = {
  Weight: 'foodUnit.groups.weight',
  Volume: 'foodUnit.groups.volume',
  Quantity: 'foodUnit.groups.quantity',
};

/**
 * Localized presentation label for a controlled unit group label
 * (Weight/Volume/Quantity). Unknown group labels fall back to the literal.
 */
export function localizeFoodUnitGroup(label: string, t: TFunction): string {
  const translate = t;
  const key = GROUP_KEYS[label];
  if (!key) return label;
  return translate(key, { defaultValue: label });
}

/**
 * Map from canonical raw unit -> translation key for the controlled unit set.
 * Units that are standard symbols (g, kg, mg, ml, l) map to themselves and are
 * not inflected; quantity/container units map to their localized nouns.
 */
const UNIT_KEYS: Record<string, string> = {
  g: 'foodUnit.units.g',
  kg: 'foodUnit.units.kg',
  mg: 'foodUnit.units.mg',
  oz: 'foodUnit.units.oz',
  lb: 'foodUnit.units.lb',
  lbs: 'foodUnit.units.lbs',
  ml: 'foodUnit.units.ml',
  l: 'foodUnit.units.l',
  liter: 'foodUnit.units.liter',
  liters: 'foodUnit.units.liters',
  cup: 'foodUnit.units.cup',
  cups: 'foodUnit.units.cups',
  tbsp: 'foodUnit.units.tbsp',
  tsp: 'foodUnit.units.tsp',
  piece: 'foodUnit.units.piece',
  slice: 'foodUnit.units.slice',
  serving: 'foodUnit.units.serving',
  portion: 'foodUnit.units.portion',
  can: 'foodUnit.units.can',
  bottle: 'foodUnit.units.bottle',
  packet: 'foodUnit.units.packet',
  bag: 'foodUnit.units.bag',
  bowl: 'foodUnit.units.bowl',
  plate: 'foodUnit.units.plate',
  handful: 'foodUnit.units.handful',
  scoop: 'foodUnit.units.scoop',
  bar: 'foodUnit.units.bar',
  stick: 'foodUnit.units.stick',
  whole: 'foodUnit.units.whole',
};

/**
 * Countable noun units that decline by quantity (via i18next plural forms).
 * Metric/imperial symbol units (g, kg, mg, ml, l, liter, liters, oz, lb, lbs)
 * are NOT in this set and stay as plain `<qty> <symbol>`.
 */
const COUNTABLE_UNITS: ReadonlySet<string> = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'piece', 'slice', 'serving', 'portion',
  'can', 'bottle', 'packet', 'bag', 'bowl', 'plate', 'handful', 'scoop',
  'bar', 'stick', 'whole',
]);

/**
 * Localized presentation label for a controlled canonical unit in a standalone
 * context (e.g. "cup" in a picker row). Returns the localized UI copy for known
 * units, or the original literal for unknown/custom/server-defined units. The
 * raw unit is never altered.
 */
export function localizeFoodUnit(unit: string | null | undefined, t: TFunction): string {
  if (unit == null) return '';
  const translate = t;
  const normalized = unit.trim().toLowerCase();
  const key = UNIT_KEYS[normalized];
  if (!key) return unit;
  // The canonical raw unit is the readable English defaultValue, so EN output
  // equals the raw value while PL output is the localized noun.
  return translate(key, { defaultValue: unit });
}

/**
 * Localized "quantity + unit" presentation.
 *
 * Metric/imperial symbol units (g, kg, mg, ml, l, liter, liters, oz, lb, lbs)
 * render as plain `<quantity> <symbol>` ("100 g", "250 ml", "1,5 l").
 *
 * Countable noun units render the quantity followed by the locale-aware noun
 * form selected by i18next pluralization, so PL produces natural inflection
 * (1 szklanka, 2 szklanki, 5 szklanek, 1,5 szklanki). Unknown/custom units
 * fall back to `<quantity> <literal unit>`.
 */
export function formatLocalizedUnitQuantity(
  quantity: number,
  unit: string | null | undefined,
  t: TFunction,
): string {
  if (unit == null) return '';
  const translate = t;
  const normalized = unit.trim().toLowerCase();
  const qty = formatLocalizedNumber(quantity, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
    useGrouping: false,
  });

  const key = UNIT_KEYS[normalized];
  if (!key) return `${qty} ${unit}`;
  if (COUNTABLE_UNITS.has(normalized)) {
    // Plural selection uses the raw quantity; the localized numeral is rendered
    // separately so the decimal separator follows the app locale. The plural
    // forms live in the dedicated `foodUnit.unitPlurals.<unit>` namespace so
    // they never collide with the standalone `foodUnit.units.<unit>` label.
    return `${qty} ${translate(`foodUnit.unitPlurals.${normalized}`, {
      defaultValue: unit,
      count: quantity,
    })}`;
  }
  return `${qty} ${translate(key, { defaultValue: unit })}`;
}
