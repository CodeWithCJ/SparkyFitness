function sanitizeCustomNutrients(customNutrients) {
  if (!customNutrients || typeof customNutrients !== "object") return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(customNutrients)) {
    // Only keep non-empty, non-null, and non-whitespace-only string values
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const SERVING_UNIT_ALIASES = {
  g: "g", grm: "g", gm: "g", gram: "g", grams: "g",
  ml: "ml", milliliter: "ml", millilitre: "ml",
  oz: "oz", ounce: "oz", ounces: "oz",
  tbsp: "tbsp", tablespoon: "tbsp",
  tsp: "tsp", teaspoon: "tsp",
  cup: "cup", cups: "cup",
};

function normalizeServingUnit(unit) {
  if (!unit) return "g";
  const key = unit.toLowerCase().trim();
  return SERVING_UNIT_ALIASES[key] || key;
}

function normalizeBarcode(barcode) {
  if (typeof barcode === "string" && barcode.length === 12) {
    return "0" + barcode;
  }
  return barcode;
}

module.exports = {
  sanitizeCustomNutrients,
  normalizeServingUnit,
  normalizeBarcode,
};
