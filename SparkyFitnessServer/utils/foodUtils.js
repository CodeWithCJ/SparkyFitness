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

module.exports = {
  sanitizeCustomNutrients,
};
