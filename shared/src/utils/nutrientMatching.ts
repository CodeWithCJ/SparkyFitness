/**
 * Nutrient-name normalization used to match online-provider nutrient fields
 * against a user's custom nutrient names and aliases.
 *
 * Matching is case-insensitive and ignores punctuation/diacritics/whitespace
 * differences, so the user can enter aliases like "Magnesium, Mg" and still
 * match a provider field reported as "magnesium" or "Magnesium (mg)".
 *
 * Canonical source shared by the server (provider import) and the web client.
 */
export function normalizeNutrientName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Normalize a provider's unit string (e.g. USDA "UG", OFF "µg") into the form a
// user would type for a custom nutrient. Unknown units pass through trimmed.
const NUTRIENT_UNIT_ALIASES: Record<string, string> = {
  g: "g",
  mg: "mg",
  ug: "µg",
  µg: "µg",
  mcg: "µg",
  kcal: "kcal",
  kj: "kJ",
  iu: "IU",
};

export function normalizeNutrientUnit(unit: string): string {
  const trimmed = unit.trim();
  return NUTRIENT_UNIT_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

// Grams per unit, for converting a provider's reported amount into the unit a
// user chose for their custom nutrient (e.g. USDA "g" -> user "mg").
const MASS_TO_GRAMS: Record<string, number> = {
  kg: 1000,
  g: 1,
  mg: 1e-3,
  µg: 1e-6,
  mcg: 1e-6,
  ug: 1e-6,
  ng: 1e-9,
};

// kJ per unit, for energy custom nutrients.
const ENERGY_TO_KJ: Record<string, number> = {
  kj: 1,
  kcal: 4.184,
};

/**
 * Convert a nutrient amount from one unit to another when they're in the same
 * convertible family (mass or energy). Returns null when conversion isn't safe
 * — unknown units, cross-family, or non-convertible units like IU — so callers
 * can fall back to storing the raw value. Same unit returns the value unchanged.
 */
export function convertNutrientAmount(
  value: number,
  fromUnit: string | undefined,
  toUnit: string | undefined,
): number | null {
  if (!fromUnit || !toUnit) return null;
  const from = fromUnit.trim().toLowerCase();
  const to = toUnit.trim().toLowerCase();
  if (!from || !to) return null;
  if (from === to) return value;
  const fromMass = MASS_TO_GRAMS[from];
  const toMass = MASS_TO_GRAMS[to];
  if (fromMass !== undefined && toMass !== undefined) {
    return value * (fromMass / toMass);
  }
  const fromKj = ENERGY_TO_KJ[from];
  const toKj = ENERGY_TO_KJ[to];
  if (fromKj !== undefined && toKj !== undefined) {
    return value * (fromKj / toKj);
  }
  return null;
}
