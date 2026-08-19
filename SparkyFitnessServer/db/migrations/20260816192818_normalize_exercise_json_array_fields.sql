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
-- Two recovery strategies for non-JSON legacy text, chosen per column:
--   equipment/primary_muscles/secondary_muscles are comma-separated lists
--   ("Barbell, Dumbbell") — split on comma, same as the application's own
--   getDistinctEquipment fallback.
--   instructions/images are prose/paths, not lists. Comma-splitting a
--   sentence like "Lie on the bench, then press." would fabricate two fake
--   steps, and stripping characters would silently delete apostrophes and
--   quotes from real instructional text. These two are instead wrapped
--   verbatim into a single-item array — destructive text mangling is worse
--   than a rarely-needed second array element, and this migration has no
--   down migration.
--
-- Idempotent: normalize_exercise_json_array() is a pure function of its
-- input, and each UPDATE only computes and writes rows that need it, so a
-- re-run updates zero rows.
--
-- Performance: exercise_entries is a per-workout log table that can carry
-- years of import history (Garmin, etc.), and this runs synchronously during
-- server startup before the app accepts requests. Two things keep the cost
-- down without sacrificing correctness:
--   A value that doesn't even start with '[' can never be a valid JSON
--   array, so `left(btrim(col), 1) <> '['` cheaply flags it as a candidate
--   with no parsing at all. But the converse isn't true — a value CAN start
--   with '[' and still not be valid JSON (an unquoted legacy list like
--   "[Barbell, Dumbbell]"; models/exercise.ts's own getDistinctEquipment
--   already carries a fallback for exactly this shape), so bracket-prefixed
--   values are only treated as already-correct once
--   exercise_json_array_is_valid() confirms they actually parse as a JSON
--   array — never on the string shape alone.
--   Each UPDATE computes the normalized value once per candidate row via a
--   subquery, instead of calling normalize_exercise_json_array() twice
--   (once in WHERE, once in SET) — worth avoiding since that function's
--   internal EXCEPTION block is a subtransaction per call.
--
-- Explicit transaction: the migration runner sends this whole file as one
-- unwrapped query, so an explicit BEGIN/COMMIT isn't load-bearing today, but
-- it makes the all-or-nothing guarantee obvious without relying on knowing
-- that detail — if any UPDATE below fails, every table stays consistent
-- with every other (and the helper function never lingers half-applied).
BEGIN;

CREATE OR REPLACE FUNCTION normalize_exercise_json_array(
    value text,
    split_on_comma boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
AS $func$
DECLARE
    parsed jsonb;
BEGIN
    IF value IS NULL THEN
        RETURN value;
    END IF;

    IF btrim(value) = '' THEN
        -- Non-NULL but empty/whitespace-only isn't valid JSON either; make it
        -- the same "no values" shape as everything else instead of leaving a
        -- row whose column still doesn't parse as JSON.
        RETURN '[]';
    END IF;

    BEGIN
        parsed := value::jsonb;
    EXCEPTION WHEN OTHERS THEN
        IF split_on_comma THEN
            -- Legacy comma-separated list text (equipment/muscles). Recover
            -- it the same way the application's own getDistinctEquipment
            -- fallback does: split on comma first, then trim wrapper
            -- brackets/quotes/backticks (and whitespace) from each segment's
            -- own boundaries only. Splitting first and using btrim's
            -- character-set trim (boundary-only) instead of translate()
            -- (which deletes a character everywhere it appears) is what
            -- keeps a genuine apostrophe inside an item, e.g. "Trainer's
            -- Choice, Barbell", from being silently stripped along with the
            -- legacy list-wrapping punctuation. ORDER BY ord keeps the
            -- original comma order, since aggregation order is otherwise
            -- unspecified.
            RETURN (
                SELECT COALESCE(jsonb_agg(item ORDER BY ord), '[]'::jsonb)::text
                FROM (
                    SELECT btrim(btrim(btrim(piece), '[]''"`')) AS item, ord
                    FROM unnest(string_to_array(value, ',')) WITH ORDINALITY AS u(piece, ord)
                ) AS pieces
                WHERE item <> ''
            );
        ELSE
            -- Free-text prose (instructions) or a file path (images) — never
            -- comma-split or strip characters out of it. Preserve it
            -- verbatim as a single-item array; to_jsonb() JSON-encodes it
            -- correctly regardless of embedded quotes/apostrophes/backslashes.
            RETURN jsonb_build_array(to_jsonb(btrim(value)))::text;
        END IF;
    END;

    IF jsonb_typeof(parsed) = 'array' THEN
        RETURN value; -- already the correct shape
    END IF;

    -- A bare JSON scalar/object (most commonly a single string like
    -- "Barbell") — wrap it into a one-item array. Applies to every column;
    -- split_on_comma only affects the not-valid-JSON-at-all fallback above.
    RETURN jsonb_build_array(parsed)::text;
END;
$func$;

-- Cheap, non-throwing validity check used only to decide which
-- bracket-prefixed rows the UPDATEs below can skip. Deliberately does none
-- of normalize_exercise_json_array's recovery work — it only answers "is
-- this already a valid JSON array?" so a bracket-prefixed-but-invalid value
-- (see the Performance note above) is never mistaken for already-correct.
CREATE OR REPLACE FUNCTION exercise_json_array_is_valid(value text)
RETURNS boolean
LANGUAGE plpgsql
AS $valid$
BEGIN
    RETURN jsonb_typeof(value::jsonb) = 'array';
EXCEPTION WHEN OTHERS THEN
    RETURN false;
END;
$valid$;

UPDATE exercises e SET equipment = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(equipment) AS value
    FROM exercises
    WHERE equipment IS NOT NULL
      AND (
        left(btrim(equipment), 1) <> '['
        OR NOT exercise_json_array_is_valid(equipment)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.equipment;

UPDATE exercises e SET primary_muscles = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(primary_muscles) AS value
    FROM exercises
    WHERE primary_muscles IS NOT NULL
      AND (
        left(btrim(primary_muscles), 1) <> '['
        OR NOT exercise_json_array_is_valid(primary_muscles)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.primary_muscles;

UPDATE exercises e SET secondary_muscles = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(secondary_muscles) AS value
    FROM exercises
    WHERE secondary_muscles IS NOT NULL
      AND (
        left(btrim(secondary_muscles), 1) <> '['
        OR NOT exercise_json_array_is_valid(secondary_muscles)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.secondary_muscles;

UPDATE exercises e SET instructions = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(instructions, false) AS value
    FROM exercises
    WHERE instructions IS NOT NULL
      AND (
        left(btrim(instructions), 1) <> '['
        OR NOT exercise_json_array_is_valid(instructions)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.instructions;

UPDATE exercises e SET images = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(images, false) AS value
    FROM exercises
    WHERE images IS NOT NULL
      AND (
        left(btrim(images), 1) <> '['
        OR NOT exercise_json_array_is_valid(images)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.images;

UPDATE exercise_entries e SET equipment = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(equipment) AS value
    FROM exercise_entries
    WHERE equipment IS NOT NULL
      AND (
        left(btrim(equipment), 1) <> '['
        OR NOT exercise_json_array_is_valid(equipment)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.equipment;

UPDATE exercise_entries e SET primary_muscles = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(primary_muscles) AS value
    FROM exercise_entries
    WHERE primary_muscles IS NOT NULL
      AND (
        left(btrim(primary_muscles), 1) <> '['
        OR NOT exercise_json_array_is_valid(primary_muscles)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.primary_muscles;

UPDATE exercise_entries e SET secondary_muscles = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(secondary_muscles) AS value
    FROM exercise_entries
    WHERE secondary_muscles IS NOT NULL
      AND (
        left(btrim(secondary_muscles), 1) <> '['
        OR NOT exercise_json_array_is_valid(secondary_muscles)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.secondary_muscles;

UPDATE exercise_entries e SET instructions = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(instructions, false) AS value
    FROM exercise_entries
    WHERE instructions IS NOT NULL
      AND (
        left(btrim(instructions), 1) <> '['
        OR NOT exercise_json_array_is_valid(instructions)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.instructions;

UPDATE exercise_entries e SET images = normalized.value
FROM (
    SELECT id, normalize_exercise_json_array(images, false) AS value
    FROM exercise_entries
    WHERE images IS NOT NULL
      AND (
        left(btrim(images), 1) <> '['
        OR NOT exercise_json_array_is_valid(images)
      )
) AS normalized
WHERE e.id = normalized.id AND normalized.value IS DISTINCT FROM e.images;

-- Migration-only helpers; not part of the application's function catalog.
DROP FUNCTION normalize_exercise_json_array(text, boolean);
DROP FUNCTION exercise_json_array_is_valid(text);

COMMIT;
