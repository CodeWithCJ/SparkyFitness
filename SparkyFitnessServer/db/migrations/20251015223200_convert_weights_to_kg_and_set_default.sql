-- Convert existing weights to KG if the user's preference was LBS
UPDATE exercise_entry_sets ees
SET weight = ees.weight / 2.20462
FROM exercise_entries ee
JOIN user_preferences up ON ee.user_id = up.user_id
WHERE ees.exercise_entry_id = ee.id AND up.default_weight_unit = 'lbs';

UPDATE workout_preset_exercise_sets wpes
SET weight = wpes.weight / 2.20462
FROM workout_preset_exercises wpe
JOIN workout_presets wp ON wpe.workout_preset_id = wp.id
JOIN user_preferences up ON wp.user_id = up.user_id
WHERE wpes.workout_preset_exercise_id = wpe.id AND up.default_weight_unit = 'lbs';

-- Set the default_weight_unit to 'kg' for users that don't have it set
UPDATE user_preferences SET default_weight_unit = 'kg' WHERE default_weight_unit IS NULL;