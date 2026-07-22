ALTER TABLE medications
ADD COLUMN IF NOT EXISTS is_supplement BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_medications_is_supplement
ON medications(user_id, is_supplement) WHERE is_supplement;

ALTER TABLE medications
ADD COLUMN IF NOT EXISTS nutrients JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN medications.nutrients IS
'Fixed-key and custom nutrient amounts per one dose; custom nutrients are stored under custom_nutrients.';

-- medications.nutrients must always be a JSON object (never an array/scalar) so the
-- report query can safely read fixed keys and custom_nutrients out of it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medications_nutrients_is_object'
          AND conrelid = 'public.medications'::regclass
    ) THEN
        ALTER TABLE public.medications
        ADD CONSTRAINT medications_nutrients_is_object
        CHECK (jsonb_typeof(nutrients) = 'object');
    END IF;
END $$;

-- Per-dose nutrient payload snapshotted onto the entry at log time, mirroring the
-- existing med_name_snapshot / dose_amount_snapshot columns.
ALTER TABLE medication_entries
ADD COLUMN IF NOT EXISTS nutrients_snapshot JSONB;

COMMENT ON COLUMN medication_entries.nutrients_snapshot IS
'Per-dose nutrient payload snapshotted at log time so daily nutrient history is immutable and independent of later edits to the medication. NULL for non-supplement entries (e.g. GLP-1 injections).';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medication_entries_nutrients_snapshot_is_object'
          AND conrelid = 'public.medication_entries'::regclass
    ) THEN
        ALTER TABLE public.medication_entries
        ADD CONSTRAINT medication_entries_nutrients_snapshot_is_object
        CHECK (nutrients_snapshot IS NULL OR jsonb_typeof(nutrients_snapshot) = 'object');
    END IF;
END $$;

-- Safe numeric parse: returns NULL for NULL/empty/non-numeric input instead of
-- raising, so one malformed JSONB nutrient value can't error the whole report query.
-- Uses a regex guard instead of exception handling so it stays pure SQL and
-- planner-inlinable.
CREATE OR REPLACE FUNCTION public.sf_try_numeric(txt text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
SELECT CASE
    WHEN txt ~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$' THEN txt::numeric
    ELSE NULL
END;
$$;
