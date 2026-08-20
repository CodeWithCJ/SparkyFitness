import type { TFunction } from 'i18next';
import i18n from '../localization/i18n';

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

const defaultTranslator: TFunction = i18n.t.bind(i18n);
function resolveTranslator(t?: TFunction): TFunction {
  return t ?? defaultTranslator;
}

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
export function localizeFoodUnitGroup(label: string, t?: TFunction): string {
  const translate = resolveTranslator(t);
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
 * Localized presentation label for a controlled canonical unit (e.g. "cup").
 * Returns the localized UI copy for known units, or the original literal for
 * unknown/custom/server-defined units. The raw unit is never altered.
 */
export function localizeFoodUnit(unit: string | null | undefined, t?: TFunction): string {
  if (unit == null) return '';
  const translate = resolveTranslator(t);
  const normalized = unit.trim().toLowerCase();
  const key = UNIT_KEYS[normalized];
  if (!key) return unit;
  // The canonical raw unit is the readable English defaultValue, so EN output
  // equals the raw value while PL output is the localized noun.
  return translate(key, { defaultValue: unit });
}
