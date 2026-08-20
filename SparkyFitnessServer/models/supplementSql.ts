/**
 * SQL fragments for the supplement arm of a day's nutrition.
 *
 * A logged supplement contributes its immutable per-entry `nutrients_snapshot`, scaled by
 * the dose count taken. Three model queries need that contribution — the Diary's
 * supplement-only totals and its combined food+supplement summary (both `foodMisc.ts`),
 * and the range query behind trends and the chatbot (`reportRepository.ts`) — and until
 * this module they each spelled it out. Two copies had already drifted in shape while
 * agreeing in meaning, which is one edit away from disagreeing in meaning: the status
 * filter and the dose clamp are the parts that must never differ between them, since
 * either one being wrong in one place shows up as a plausible number rather than an error.
 *
 * `userExpr` / `dateExpr` are the SQL expressions to correlate on, so a caller can bind
 * params ($1/$2) for a single-date query or reference grouped columns (`d.user_id`,
 * `d.entry_date`) for a per-date one. `alias` is the `medication_entries` alias in scope;
 * the fixed and custom fragments appear in the same statement and so cannot share one. Pass
 * an empty alias where the query selects from the bare table.
 */

/** `me.entry_date`, or plain `entry_date` when no alias is in scope. */
function col(alias: string, name: string): string {
  return alias ? `${alias}.${name}` : name;
}

/**
 * How many doses a `medication_entries` row counts for. Missing means one; non-positive
 * clamps to zero so a bad snapshot can only fail to add, never subtract from a total.
 *
 * Exported on its own because `getNutritionData` scales per row before summing while the
 * daily aggregations sum the scaled products, so those two cannot share a whole expression
 * — but they must not disagree about what a dose count means.
 */
function doseScale(alias: string): string {
  return `GREATEST(COALESCE(${col(alias, 'dose_amount_snapshot')}, 1), 0)`;
}

/**
 * Which `medication_entries` rows count toward nutrition at all: a dose the user actually
 * took, carrying a snapshot to read. Every read applies this; only the date predicate
 * differs between them (one day, or a range), which is why it is not folded in here.
 *
 * Shared rather than repeated because adding a status that should count is otherwise a
 * five-site edit with nothing to catch the site you miss — and missing one shows up as a
 * total that is quietly low, not as an error.
 */
function supplementCountable(alias: string): string {
  return `${col(alias, 'status')} IN ('taken', 'prn_taken') AND ${col(alias, 'nutrients_snapshot')} IS NOT NULL`;
}

/**
 * The full row filter for a single-date read: this user, this date, and countable.
 */
function supplementScanWhere(
  alias: string,
  userExpr: string,
  dateExpr: string
): string {
  return `${col(alias, 'user_id')} = ${userExpr} AND ${col(alias, 'entry_date')} = ${dateExpr} AND ${supplementCountable(alias)}`;
}

/**
 * The dose-scaled sum of one fixed nutrient field, as an aggregate over rows already
 * filtered by `supplementScanWhere`. Use this when the caller supplies its own single
 * `FROM medication_entries` scan; use `supplementFixed` when it needs a self-contained
 * scalar expression.
 */
function supplementFixedSum(key: string, alias: string): string {
  return `SUM(public.sf_try_numeric(${alias}.nutrients_snapshot->>'${key}') * ${doseScale(alias)})`;
}

/**
 * The dose-scaled total of one fixed nutrient field as a self-contained scalar subquery,
 * for callers adding it onto a food SUM in a grouped query. Zero rather than NULL on a day
 * with no doses, so it can be added unconditionally.
 */
function supplementFixed(
  key: string,
  userExpr: string,
  dateExpr: string
): string {
  return `COALESCE((SELECT ${supplementFixedSum(key, 'me')} FROM medication_entries me WHERE ${supplementScanWhere('me', userExpr, dateExpr)}), 0)`;
}

/**
 * One scaled row per (custom nutrient, dose) pair. Kept apart from the UNION wrapper below
 * because the daily-summary query needs the supplement contribution on its own, not merged
 * into the food rows.
 */
function supplementCustomRows(userExpr: string, dateExpr: string): string {
  return `
                SELECT key, public.sf_try_numeric(value) * ${doseScale('me2')} AS scaled
                FROM medication_entries me2
                CROSS JOIN LATERAL jsonb_each_text(me2.nutrients_snapshot->'custom_nutrients')
                WHERE ${supplementScanWhere('me2', userExpr, dateExpr)}`;
}

/** The same rows as an arm of a food query's custom-nutrient UNION. */
function supplementCustomUnion(userExpr: string, dateExpr: string): string {
  return `
                UNION ALL${supplementCustomRows(userExpr, dateExpr)}`;
}

/**
 * The same rows aggregated by nutrient name and with no food arm, for the supplement-only
 * totals the Diary needs. Empty object rather than NULL on a day with no doses, so callers
 * can iterate unconditionally.
 */
function supplementCustomTotals(userExpr: string, dateExpr: string): string {
  return `COALESCE(
          (
            SELECT jsonb_object_agg(key, value)
            FROM (
              SELECT key, SUM(scaled) AS value
              FROM (${supplementCustomRows(userExpr, dateExpr)}
              ) supplement_custom
              GROUP BY key
            ) supplement_custom_agg
          ),
          '{}'::jsonb
        )`;
}

export {
  doseScale,
  supplementCountable,
  supplementScanWhere,
  supplementFixedSum,
  supplementFixed,
  supplementCustomRows,
  supplementCustomUnion,
  supplementCustomTotals,
};
