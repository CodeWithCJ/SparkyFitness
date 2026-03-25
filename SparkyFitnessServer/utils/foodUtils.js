function sanitizeCustomNutrients(customNutrients) {
  if (!customNutrients || typeof customNutrients !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(customNutrients)) {
    // Only keep non-empty, non-null, and non-whitespace-only string values
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const SERVING_UNIT_ALIASES = {
  g: 'g',
  grm: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  cup: 'cup',
  cups: 'cup',
  slice: 'slice',
  slices: 'slice',
  portion: 'serving',
  portions: 'serving',
  servings: 'serving',
  serving: 'serving',
  container: 'container',
  containers: 'container',
  package: 'packet',
  packages: 'packet',
  piece: 'piece',
  pieces: 'piece',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  lb: 'lb',
  pound: 'lb',
  pounds: 'lb',
  l: 'l',
  liter: 'l',
  litre: 'l',
  liters: 'l',
  litres: 'l',
  can: 'can',
  cans: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  packet: 'packet',
  packets: 'packet',
  bag: 'bag',
  bags: 'bag',
  bowl: 'bowl',
  bowls: 'bowl',
  plate: 'plate',
  plates: 'plate',
  handful: 'handful',
  handfuls: 'handful',
  scoop: 'scoop',
  scoops: 'scoop',
  bar: 'bar',
  bars: 'bar',
  stick: 'stick',
  sticks: 'stick',
};

function normalizeServingUnit(unit) {
  if (!unit) return 'g';
  // Strip anything in parentheses at the end: "serving (237g)" -> "serving"
  let clean = unit
    .replace(/\s*\([^)]*\)\s*$/i, '')
    .toLowerCase()
    .trim();

  // Try exact match first
  if (SERVING_UNIT_ALIASES[clean]) return SERVING_UNIT_ALIASES[clean];

  // Try first word match (e.g., "cup pieces" -> "cup")
  const firstWord = clean.split(/\s+/)[0];
  if (SERVING_UNIT_ALIASES[firstWord]) return SERVING_UNIT_ALIASES[firstWord];

  return clean;
}

function normalizeBarcode(barcode) {
  if (typeof barcode === 'string' && barcode.length === 12) {
    return '0' + barcode;
  }
  return barcode;
}

module.exports = {
  sanitizeCustomNutrients,
  normalizeServingUnit,
  normalizeBarcode,
};
