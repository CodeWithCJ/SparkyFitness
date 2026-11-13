/**
 * SQL mirror of `effectiveLoadKg` / `bodyWeightOnDay` in @workspace/shared,
 * for volume sums done in the database. Keep the two in step: a bodyweight
 * set (`bodyweight_reps`) moves the lifter's body weight plus its signed
 * weight, floored at zero, and with no reading at all only its weight.
 */

/**
 * `LEFT JOIN LATERAL` giving `bw.weight`: the latest check-in weight on or
 * before the entry's day, else the earliest one after it, else null. Uses the
 * `(user_id, entry_date)` unique index on check_in_measurements.
 */
export function bodyWeightJoinSql(entryAlias: string): string {
  return `
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT cim.weight FROM public.check_in_measurements cim
            WHERE cim.user_id = ${entryAlias}.user_id AND cim.weight > 0
              AND cim.entry_date <= ${entryAlias}.entry_date
            ORDER BY cim.entry_date DESC LIMIT 1),
          (SELECT cim.weight FROM public.check_in_measurements cim
            WHERE cim.user_id = ${entryAlias}.user_id AND cim.weight > 0
              AND cim.entry_date > ${entryAlias}.entry_date
            ORDER BY cim.entry_date ASC LIMIT 1)
        ) AS weight
      ) bw ON true`;
}

/** The load one set moved, given `bw` from `bodyWeightJoinSql`. */
export function setLoadSql(entryAlias: string, setAlias: string): string {
  return `CASE WHEN ${entryAlias}.modality = 'bodyweight_reps'
          THEN GREATEST(0, COALESCE(bw.weight, 0) + COALESCE(${setAlias}.weight, 0))
          ELSE ${setAlias}.weight END`;
}

/**
 * Whether an exercise entry counts as cardio, the way Exercise Statistics'
 * Cardio view decides. `entryAlias` qualifies the columns; omit it when they
 * are in scope unqualified.
 *
 * Word boundaries, not substrings: "crunch" contains "run" and was showing up
 * as cardio. Strength is out even when an old row was stored with category
 * Cardio, or when a gym session has a little distance from walking between
 * sets. Past those exclusions, any positive distance counts: a synced paddle
 * can reuse a "General" reps-only custom exercise and still carry a route.
 */
export function cardioPredicateSql(entryAlias?: string): string {
  const c = (column: string) =>
    entryAlias ? `${entryAlias}.${column}` : column;
  return `(
        COALESCE(${c('modality')}, '') NOT IN ('weight_reps', 'weight_duration', 'weight_distance')
        AND LOWER(COALESCE(${c('category')}, '')) NOT IN ('strength', 'powerlifting', 'olympic weightlifting', 'strongman')
        AND LOWER(${c('exercise_name')}) !~* '\\m(strength|crunch|sit-?up|plank)\\M'
        AND (
          COALESCE(${c('modality')}, '') IN ('duration', 'duration_distance')
          OR LOWER(COALESCE(${c('category')}, '')) IN ('cardio', 'running', 'cycling', 'walking', 'swimming', 'endurance', 'garmin')
          OR LOWER(${c('exercise_name')}) ~* '\\m(run(ning|s)?|walk(ing|s)?|cycl(e|ing)|bike|biking|swim(ming)?|hik(e|ing)|treadmill|elliptical|rower|rowing|cardio|stairs?)\\M'
          OR COALESCE(${c('distance')}, 0) > 0
        )
      )`;
}
