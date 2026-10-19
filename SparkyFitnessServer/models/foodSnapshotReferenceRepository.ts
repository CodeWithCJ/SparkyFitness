import type { PoolClient } from 'pg';

/** Copy logged nutrition independently of the library. Detach missing/hidden
 * links only on new copies, including independent legacy serving links whose
 * parent food is gone; the INSERT's FK supplies concurrent-delete locks.
 * Inspection stays SELECT-only so public servings need no mutation permission.
 * The caller owns the copy transaction and historical rows stay unchanged. */
export async function prepareCopiedFoodSnapshots<
  T extends { food_id?: unknown; variant_id?: unknown },
>(client: PoolClient, rows: readonly T[]): Promise<T[]> {
  const copies = rows.map((row) =>
    row.food_id === null &&
    row.variant_id !== null &&
    row.variant_id !== undefined
      ? { ...row, variant_id: null }
      : row
  );
  const foodIds = [
    ...new Set(
      copies.flatMap((row) =>
        typeof row.food_id === 'string' ? [row.food_id] : []
      )
    ),
  ];
  const variantIds = [
    ...new Set(
      copies.flatMap((row) =>
        typeof row.variant_id === 'string' ? [row.variant_id] : []
      )
    ),
  ];
  if (!foodIds.length && !variantIds.length) return copies;
  const references = await client.query<{
    reference_kind: 'food' | 'variant';
    id: string;
  }>(
    `SELECT 'food' AS reference_kind,id FROM public.foods WHERE id=ANY($1::uuid[])
     UNION ALL
     SELECT 'variant' AS reference_kind,id FROM public.food_variants WHERE id=ANY($2::uuid[])
     ORDER BY reference_kind,id`,
    [foodIds, variantIds]
  );
  const availableFoods = new Set(
    references.rows
      .filter((row) => row.reference_kind === 'food')
      .map((row) => row.id)
  );
  const availableVariants = new Set(
    references.rows
      .filter((row) => row.reference_kind === 'variant')
      .map((row) => row.id)
  );
  return copies.map((row) =>
    typeof row.food_id === 'string' && !availableFoods.has(row.food_id)
      ? { ...row, food_id: null, variant_id: null }
      : typeof row.variant_id === 'string' &&
          !availableVariants.has(row.variant_id)
        ? { ...row, variant_id: null }
        : row
  );
}
