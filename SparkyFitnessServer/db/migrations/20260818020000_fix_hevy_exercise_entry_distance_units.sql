-- Correct Hevy exercise entries that stored distance in metres.
--
-- exercise_entries.distance is kilometres everywhere else: Strava and Polar
-- divide their metre payloads by 1000, Google Health divides millimetres by
-- 1e6, and the CSV importer converts miles to km before insert. The Hevy
-- processor instead summed the API's `distance_meters` (which the Hevy public
-- API always reports in metres, independent of the user's display-unit
-- setting) and wrote it raw, so every Hevy distance is 1000x too large -- a
-- 500 m row was recorded as 500 km, inflating distance totals and charts.
--
-- The write path is fixed in integrations/hevy/hevyDataProcessor.ts; this
-- repairs the rows already on disk.
--
-- Scoped to source = 'Hevy' because that is exactly what the Hevy processor
-- passes to createExerciseEntry, and no other writer touches those rows. It is
-- safe to convert ALL of them: the integration has never written a correct
-- value, so there is no mix of metres and kilometres to tell apart.
--
-- This statement is NOT idempotent, and no predicate can make it so -- once
-- corrected, a Hevy distance is indistinguishable from an unconverted one, and
-- replaying it would divide by 1000 a second time. Single execution is
-- guaranteed by the migration runner's tracking table, which is the only thing
-- that makes this safe. Do not run it by hand.
--
-- Rounded to 3 decimals (1 m resolution) to match the write path. Hevy
-- distances are typically short -- a 50 m farmer's walk becomes 0.05 km -- so
-- fewer decimals would round real efforts away to zero.
--
-- NULL and 0 distances are left alone: they carry no unit and dividing them
-- changes nothing.

UPDATE public.exercise_entries
SET distance = ROUND((distance / 1000)::numeric, 3)
WHERE source = 'Hevy'
  AND distance IS NOT NULL
  AND distance > 0;
