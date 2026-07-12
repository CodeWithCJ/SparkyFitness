type ServingLike = {
  serving_size?: number | null;
  serving_unit?: string | null;
  serving_description?: string | null;
};

export function formatServingLabel(variant: ServingLike): string {
  const description = variant.serving_description?.trim();
  if (description) return description;

  const unit = variant.serving_unit?.trim() || '';
  if (variant.serving_size == null) return unit;
  return `${variant.serving_size} ${unit}`.trim();
}

export function formatQuantityServingLabel(
  quantity: number,
  variant: ServingLike
): string {
  if (
    variant.serving_size === quantity &&
    variant.serving_description?.trim()
  ) {
    return variant.serving_description.trim();
  }

  return `${quantity} ${variant.serving_unit || ''}`.trim();
}
