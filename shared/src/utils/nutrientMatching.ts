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
