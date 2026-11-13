-- Loaded carries and holds (issue #127 step 1, upstream #2481).
--
-- Two new modalities. weight_distance: sets carry a weight and a distance
-- (farmer's walk, yoke, sandbag, sled push); the distance is stored in km in
-- exercise_entry_sets.distance like every other set distance. weight_duration:
-- sets carry a weight and a duration in seconds (weighted plank). Neither
-- records reps.
--
-- Only the CHECK constraints change; no existing row is converted. Idempotent:
-- each constraint is dropped if present and recreated with the full list.
-- NOT VALID takes a short lock; the next file validates in its own
-- transaction, so the scan does not hold the add-constraint lock.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_modality_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_modality_check
    CHECK (modality IN ('weight_reps', 'reps_only', 'bodyweight_reps', 'weight_duration', 'weight_distance', 'duration', 'duration_distance'))
    NOT VALID;

ALTER TABLE exercise_entries DROP CONSTRAINT IF EXISTS exercise_entries_modality_check;
ALTER TABLE exercise_entries ADD CONSTRAINT exercise_entries_modality_check
    CHECK (modality IN ('weight_reps', 'reps_only', 'bodyweight_reps', 'weight_duration', 'weight_distance', 'duration', 'duration_distance'))
    NOT VALID;
