import type { FoodVariant } from '@/types/food';

interface ResumeReconciliationContext {
  readonly baselineVariantIds: readonly string[];
  readonly attemptedVariantKeys: readonly string[];
  readonly updatedReferenceId?: string;
}

export function foodVariantKey(variant: FoodVariant): string {
  return `${Number(variant.serving_size)}|${variant.serving_unit.trim().toLocaleLowerCase()}`;
}

/** Reuse read-back rows when a previous write committed but its response was lost. */
export function planFoodVariantReconciliation(
  requestedVariants: readonly FoodVariant[],
  existingVariants: readonly FoodVariant[],
  resume?: ResumeReconciliationContext
) {
  // Reserve explicit IDs first so a same-key draft cannot claim another row's ID.
  const claimedIds = new Set(
    requestedVariants.flatMap((variant) => (variant.id ? [variant.id] : []))
  );
  const reconciledVariants = requestedVariants.map((variant) => {
    if (variant.id) return variant;
    const existing = existingVariants.find(
      (candidate) =>
        candidate.id &&
        !claimedIds.has(candidate.id) &&
        foodVariantKey(candidate) === foodVariantKey(variant)
    );
    if (!existing?.id) return variant;
    claimedIds.add(existing.id);
    return { ...variant, id: existing.id };
  });
  const variantsToCreate = reconciledVariants.filter((variant) => !variant.id);
  const variantsToUpdate = reconciledVariants.filter(
    (variant) =>
      variant.id &&
      (!resume ||
        variant.id === resume.updatedReferenceId ||
        !resume.baselineVariantIds.includes(variant.id))
  );
  const variantsToDelete = existingVariants.filter(
    (existing) =>
      !reconciledVariants.some((variant) => variant.id === existing.id) &&
      (!resume ||
        (!!existing.id &&
          !resume.baselineVariantIds.includes(existing.id) &&
          resume.attemptedVariantKeys.includes(foodVariantKey(existing))))
  );

  // Current keys become the next checkpoint, never deletion authority for this plan.
  const nextAttemptedVariantKeys = resume
    ? [
        ...new Set([
          ...resume.attemptedVariantKeys,
          ...requestedVariants
            .filter((variant) => !variant.is_default)
            .map(foodVariantKey),
        ]),
      ]
    : [];

  return {
    variantsToCreate,
    variantsToUpdate,
    variantsToDelete,
    nextAttemptedVariantKeys,
  };
}
