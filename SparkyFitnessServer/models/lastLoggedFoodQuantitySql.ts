// Requires foods f, its default food_variants fv, and the authenticated user as a bound parameter.
// Compare the most recent entry, not the most recent *matching* entry:
// a later switch to pieces must not resurrect an old gram quantity.
export const lastLoggedFoodQuantitySql = (ownerParam: number) => `
  (SELECT CASE WHEN last_entry.variant_id = fv.id
                AND last_entry.unit = fv.serving_unit
                AND last_entry.quantity > 0
               THEN last_entry.quantity::double precision END
     FROM food_entries last_entry
    WHERE last_entry.user_id = $${ownerParam} AND last_entry.food_id = f.id
    ORDER BY last_entry.created_at DESC NULLS LAST, last_entry.id DESC
    LIMIT 1) AS last_logged_quantity
`;
