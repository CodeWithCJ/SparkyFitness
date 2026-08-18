-- exercises.equipment/primary_muscles/secondary_muscles/instructions/images
-- (and the matching columns on exercise_entries) are TEXT columns holding a
-- JSON-array-encoded string by design (20250927180257_alter_exercises_table.sql:
-- "-- Stored as JSON array of strings"). Some rows hold a bare JSON string
-- instead of a one-item array (free-exercise-db's raw JSON uses a single
-- string for a solo value, and the import path historically passed that
-- through unnormalized) or, for a handful of legacy rows, plain non-JSON text
-- (e.g. a comma-separated equipment list). Every read path that JSON-parses
-- these columns without checking it got an array back then either crashes
-- (application code prior to this fix) or, if guarded, silently drops the
-- value. This backfills existing rows into the one true shape: a JSON array.
--
-- Idempotent: normalize_exercise_json_array() is a pure function of the
-- input value, and each UPDATE only touches rows where the function's output
-- actually differs from the stored value, so a re-run updates zero rows.

CREATE OR REPLACE FUNCTION normalize_exercise_json_array(value text)
RETURNS text
LANGUAGE plpgsql
AS $func$
DECLARE
    parsed jsonb;
BEGIN
    IF value IS NULL OR btrim(value) = '' THEN
        RETURN value;
    END IF;

    BEGIN
        parsed := value::jsonb;
    EXCEPTION WHEN OTHERS THEN
        -- Not valid JSON at all (legacy plain/comma-separated text, e.g.
        -- "Barbell, Dumbbell"). Recover it the same way the application's
        -- own getDistinctEquipment fallback does: strip brackets/quotes/
        -- backticks, split on comma, trim, drop empties. ORDER BY ord keeps
        -- the original comma order, since aggregation order is otherwise
        -- unspecified.
        RETURN (
            SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)::text
            FROM (
                SELECT btrim(piece) AS item, ord
                FROM unnest(string_to_array(translate(value, '[]''"`', ''), ',')) WITH ORDINALITY AS u(piece, ord)
                WHERE btrim(piece) <> ''
            ) AS pieces
        );
    END;

    IF jsonb_typeof(parsed) = 'array' THEN
        RETURN value; -- already the correct shape
    END IF;

    -- A bare JSON scalar/object (most commonly a single string like
    -- "Barbell") — wrap it into a one-item array.
    RETURN jsonb_build_array(parsed)::text;
END;
$func$;

UPDATE exercises SET equipment = normalize_exercise_json_array(equipment)
WHERE equipment IS NOT NULL AND normalize_exercise_json_array(equipment) IS DISTINCT FROM equipment;
UPDATE exercises SET primary_muscles = normalize_exercise_json_array(primary_muscles)
WHERE primary_muscles IS NOT NULL AND normalize_exercise_json_array(primary_muscles) IS DISTINCT FROM primary_muscles;
UPDATE exercises SET secondary_muscles = normalize_exercise_json_array(secondary_muscles)
WHERE secondary_muscles IS NOT NULL AND normalize_exercise_json_array(secondary_muscles) IS DISTINCT FROM secondary_muscles;
UPDATE exercises SET instructions = normalize_exercise_json_array(instructions)
WHERE instructions IS NOT NULL AND normalize_exercise_json_array(instructions) IS DISTINCT FROM instructions;
UPDATE exercises SET images = normalize_exercise_json_array(images)
WHERE images IS NOT NULL AND normalize_exercise_json_array(images) IS DISTINCT FROM images;

UPDATE exercise_entries SET equipment = normalize_exercise_json_array(equipment)
WHERE equipment IS NOT NULL AND normalize_exercise_json_array(equipment) IS DISTINCT FROM equipment;
UPDATE exercise_entries SET primary_muscles = normalize_exercise_json_array(primary_muscles)
WHERE primary_muscles IS NOT NULL AND normalize_exercise_json_array(primary_muscles) IS DISTINCT FROM primary_muscles;
UPDATE exercise_entries SET secondary_muscles = normalize_exercise_json_array(secondary_muscles)
WHERE secondary_muscles IS NOT NULL AND normalize_exercise_json_array(secondary_muscles) IS DISTINCT FROM secondary_muscles;
UPDATE exercise_entries SET instructions = normalize_exercise_json_array(instructions)
WHERE instructions IS NOT NULL AND normalize_exercise_json_array(instructions) IS DISTINCT FROM instructions;
UPDATE exercise_entries SET images = normalize_exercise_json_array(images)
WHERE images IS NOT NULL AND normalize_exercise_json_array(images) IS DISTINCT FROM images;

-- Migration-only helper; not part of the application's function catalog.
DROP FUNCTION normalize_exercise_json_array(text);
