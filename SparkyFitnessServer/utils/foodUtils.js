function sanitizeCustomNutrients(customNutrients) {
  if (!customNutrients || typeof customNutrients !== "object") return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(customNutrients)) {
    // Only keep non-empty, non-null values
    if (value !== "" && value !== null && value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = {
  sanitizeCustomNutrients,
};
