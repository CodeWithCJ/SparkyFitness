// Nutrition labels (EU, UK and others) print salt in grams, while the food
// record stores sodium in milligrams. Labelling rules treat salt as
// sodium x 2.5, so 1 g of salt is 400 mg of sodium. These helpers are only an
// entry convenience in the web and mobile food editors; the stored value stays
// sodium (mg).
const SODIUM_MG_PER_GRAM_OF_SALT = 400;

/** 0.1 g of salt -> 40 mg of sodium. Rounded to 0.1 mg, the sodium field's precision. */
export function saltGramsToSodiumMg(
  saltGrams: number | undefined
): number | undefined {
  if (saltGrams === undefined) return undefined;
  return Math.round(saltGrams * SODIUM_MG_PER_GRAM_OF_SALT * 10) / 10;
}

/**
 * 40 mg of sodium -> 0.1 g of salt. Rounded to 0.01 g, the precision the salt
 * field displays, so an untouched field hands the same number back and does
 * not nudge the stored sodium on blur.
 */
export function sodiumMgToSaltGrams(
  sodiumMg: number | undefined
): number | undefined {
  if (sodiumMg === undefined) return undefined;
  return Math.round((sodiumMg / SODIUM_MG_PER_GRAM_OF_SALT) * 100) / 100;
}
