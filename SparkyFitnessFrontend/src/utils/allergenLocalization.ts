import type { TFunction } from 'i18next';

const ALLERGEN_KEYS: Readonly<Record<string, string>> = {
  gluten: 'gluten',
  wheat: 'wheat',
  milk: 'milk',
  eggs: 'eggs',
  peanuts: 'peanuts',
  'tree nuts': 'treeNuts',
  soy: 'soy',
  fish: 'fish',
  shellfish: 'shellfish',
  crustaceans: 'crustaceans',
  sesame: 'sesame',
  celery: 'celery',
  mustard: 'mustard',
  lupin: 'lupin',
  sulphites: 'sulphites',
};

export const getLocalizedAllergenLabel = (
  allergen: string,
  t: TFunction
): string => {
  const trimmedAllergen = allergen.trim();
  const key = ALLERGEN_KEYS[trimmedAllergen.toLowerCase()];

  return key
    ? t(`foodVariant.allergens.${key}`, { defaultValue: trimmedAllergen })
    : trimmedAllergen;
};
