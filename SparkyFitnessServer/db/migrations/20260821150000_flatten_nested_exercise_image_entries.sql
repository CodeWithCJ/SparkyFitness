-- exercises.images is a TEXT column holding a JSON array of image paths.
-- 20260816192818_normalize_exercise_json_array_fields.sql repaired rows whose
-- value was not a JSON array at all, and normalizeToStringArray now guards the
-- write path. Neither covers a row that IS a valid JSON array but whose
-- elements are themselves JSON-encoded:
--
--   ["[\"Ab_Roller/0.jpg\",\"Ab_Roller/1.jpg\"]"]
--
-- normalize_exercise_json_array() returns early for those ("already the
-- correct shape"), and the backfill's predicate skips them because they are
-- bracket-prefixed and parse cleanly. Readers then hand the whole inner blob
-- to the client, which requests
-- /uploads/exercises/["Ab_Roller/0.jpg","Ab_Roller/1.jpg"] and gets a 404 —
-- while the real files sit on disk unreferenced.
--
-- Written by an import path that JSON-encoded the array before wrapping it,
-- fixed since; this repairs the rows that path left behind.

-- Flattens one level of JSON-encoded nesting inside a JSON array of strings.
-- Idempotent: an already-flat array round-trips unchanged, so re-running is a
-- no-op and the UPDATE's IS DISTINCT FROM guard skips it.
CREATE OR REPLACE FUNCTION flatten_nested_json_string_array(value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $func$
DECLARE
    parsed  jsonb;
    element text;
    inner_v jsonb;
    result  jsonb := '[]'::jsonb;
    -- Only rows that actually held nested data are rewritten. Without this,
    -- re-serializing through jsonb reformats every already-correct row
    -- (["a","b"] -> ["a", "b"]), so the UPDATE would churn the whole table
    -- for a whitespace difference.
    changed  boolean := false;
BEGIN
    IF value IS NULL THEN
        RETURN value;
    END IF;

    BEGIN
        parsed := value::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN value; -- not JSON; the earlier migration owns that recovery
    END;

    IF jsonb_typeof(parsed) <> 'array' THEN
        RETURN value; -- likewise not this migration's concern
    END IF;

    FOR element IN SELECT jsonb_array_elements_text(parsed) LOOP
        -- Only attempt a re-parse on values that could plausibly be nested
        -- JSON. A real path such as `My_Exercise [v2]/0.jpg` must survive
        -- untouched, so anything that does not start with `[` or `"` is
        -- appended verbatim without going through the parser.
        IF left(btrim(element), 1) IN ('[', '"') THEN
            BEGIN
                inner_v := element::jsonb;
            EXCEPTION WHEN OTHERS THEN
                inner_v := NULL; -- looked like JSON, is not; keep it verbatim
            END;

            IF inner_v IS NOT NULL AND jsonb_typeof(inner_v) = 'array' THEN
                -- Nested array: splice its string elements in, in order.
                result := result || (
                    SELECT COALESCE(jsonb_agg(v ORDER BY ord), '[]'::jsonb)
                    FROM jsonb_array_elements_text(inner_v)
                         WITH ORDINALITY AS t(v, ord)
                    WHERE btrim(v) <> ''
                );
                changed := true;
                CONTINUE;
            END IF;

            IF inner_v IS NOT NULL AND jsonb_typeof(inner_v) = 'string' THEN
                -- Doubly-encoded scalar: "\"A/0.jpg\"" -> A/0.jpg
                IF btrim(inner_v #>> '{}') <> '' THEN
                    result := result || jsonb_build_array(inner_v #>> '{}');
                END IF;
                changed := true;
                CONTINUE;
            END IF;
        END IF;

        IF btrim(element) <> '' THEN
            result := result || jsonb_build_array(element);
        ELSE
            changed := true; -- dropping a blank entry is a real repair
        END IF;
    END LOOP;

    IF NOT changed THEN
        RETURN value; -- byte-for-byte unchanged; the UPDATE will skip this row
    END IF;

    RETURN result::text;
END;
$func$;

UPDATE exercises e
SET images = flattened.value
FROM (
    SELECT id, flatten_nested_json_string_array(images) AS value
    FROM exercises
    WHERE images IS NOT NULL
      AND left(btrim(images), 1) = '['
) AS flattened
WHERE e.id = flattened.id
  AND flattened.value IS DISTINCT FROM e.images;

DROP FUNCTION IF EXISTS flatten_nested_json_string_array(text);
