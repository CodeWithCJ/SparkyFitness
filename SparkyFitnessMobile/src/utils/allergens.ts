import type { TFunction } from 'i18next';

export const COMMON_ALLERGENS = [
  'gluten',
  'wheat',
  'milk',
  'eggs',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'crustaceans',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'sulphites',
] as const;

export function normalizeAllergen(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Returns the food's allergens and traces that the user tracks. Matching is
 * case-insensitive, mirroring web's AllergenBadges.
 */
export function matchAllergens(
  tracked: readonly string[] | undefined,
  allergens?: readonly string[] | null,
  traces?: readonly string[] | null
): { allergens: string[]; traces: string[] } {
  if (!tracked?.length) return { allergens: [], traces: [] };
  const trackedSet = new Set(tracked.map(normalizeAllergen));
  const keep = (list?: readonly string[] | null) =>
    (list ?? []).filter((a) => trackedSet.has(normalizeAllergen(a)));
  return { allergens: keep(allergens), traces: keep(traces) };
}

/** Translate the common allergen names; custom allergens remain literal. */
export function localizeAllergen(t: TFunction, name: string): string {
  switch (name) {
    case 'gluten':
      return t('allergenSettings.names.gluten', { defaultValue: 'gluten' });
    case 'wheat':
      return t('allergenSettings.names.wheat', { defaultValue: 'wheat' });
    case 'milk':
      return t('allergenSettings.names.milk', { defaultValue: 'milk' });
    case 'eggs':
      return t('allergenSettings.names.eggs', { defaultValue: 'eggs' });
    case 'peanuts':
      return t('allergenSettings.names.peanuts', { defaultValue: 'peanuts' });
    case 'tree nuts':
      return t('allergenSettings.names.treeNuts', {
        defaultValue: 'tree nuts',
      });
    case 'soy':
      return t('allergenSettings.names.soy', { defaultValue: 'soy' });
    case 'fish':
      return t('allergenSettings.names.fish', { defaultValue: 'fish' });
    case 'shellfish':
      return t('allergenSettings.names.shellfish', {
        defaultValue: 'shellfish',
      });
    case 'crustaceans':
      return t('allergenSettings.names.crustaceans', {
        defaultValue: 'crustaceans',
      });
    case 'sesame':
      return t('allergenSettings.names.sesame', { defaultValue: 'sesame' });
    case 'celery':
      return t('allergenSettings.names.celery', { defaultValue: 'celery' });
    case 'mustard':
      return t('allergenSettings.names.mustard', { defaultValue: 'mustard' });
    case 'lupin':
      return t('allergenSettings.names.lupin', { defaultValue: 'lupin' });
    case 'sulphites':
      return t('allergenSettings.names.sulphites', {
        defaultValue: 'sulphites',
      });
    default:
      return name;
  }
}
