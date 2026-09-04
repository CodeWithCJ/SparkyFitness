-- Open Food Facts uploads have two independent consent gates. The administrator
-- enables the feature for the server, while every food owner opts in for their
-- own catalog. Provider rows retain credentials only.
ALTER TABLE public.external_data_providers
  DROP COLUMN IF EXISTS allow_openfoodfacts_contributions,
  DROP COLUMN IF EXISTS auto_contribute_openfoodfacts;

ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS allow_openfoodfacts_contributions BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.global_settings.allow_openfoodfacts_contributions IS
  'Server-wide gate for automatic Open Food Facts contributions. A food owner must also opt in.';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS auto_contribute_openfoodfacts BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS openfoodfacts_backfill_pending BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS openfoodfacts_product_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_openfoodfacts_product_language_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_openfoodfacts_product_language_check
  CHECK (openfoodfacts_product_language ~ '^[a-z]{2}$');

COMMENT ON COLUMN public.user_preferences.auto_contribute_openfoodfacts IS
  'Food-owner consent for automatic Open Food Facts contributions. The server-wide gate must also be enabled.';
COMMENT ON COLUMN public.user_preferences.openfoodfacts_backfill_pending IS
  'Internal cursor flag for bounded catalog backfill after a false-to-true consent transition.';
COMMENT ON COLUMN public.user_preferences.openfoodfacts_product_language IS
  'Two-letter language code printed on the product packaging and used for Open Food Facts product names.';

CREATE SEQUENCE IF NOT EXISTS public.openfoodfacts_sync_revision_seq AS BIGINT;

-- One system-only singleton coordinates every Product Opener product-read
-- request across all SparkyFitness instances sharing this database. A leased
-- token stays owned until the GET settles; stale leases recover automatically.
-- Preserve installations that applied an earlier PR revision under the
-- automatic-only name. The row is coordination state, not user data.
DO $migration$
BEGIN
  IF to_regclass('public.openfoodfacts_automatic_sync_rate_limit') IS NOT NULL THEN
    IF to_regclass('public.openfoodfacts_product_read_rate_limit') IS NULL THEN
      ALTER TABLE public.openfoodfacts_automatic_sync_rate_limit
        RENAME TO openfoodfacts_product_read_rate_limit;
    ELSE
      DROP TABLE public.openfoodfacts_automatic_sync_rate_limit;
    END IF;
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.openfoodfacts_product_read_rate_limit (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  next_product_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  reservation_token UUID,
  reservation_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT openfoodfacts_product_read_rate_limit_singleton_check CHECK (id = 1),
  CONSTRAINT openfoodfacts_product_read_rate_limit_reservation_check CHECK (
    (reservation_token IS NULL) = (reservation_expires_at IS NULL)
  )
);

ALTER TABLE public.openfoodfacts_product_read_rate_limit
  ADD COLUMN IF NOT EXISTS id SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_product_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  ADD COLUMN IF NOT EXISTS reservation_token UUID,
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  DROP COLUMN IF EXISTS next_claim_at,
  DROP COLUMN IF EXISTS next_allowed_at,
  DROP COLUMN IF EXISTS next_available_at,
  DROP CONSTRAINT IF EXISTS openfoodfacts_automatic_sync_rate_limit_singleton_check,
  DROP CONSTRAINT IF EXISTS openfoodfacts_automatic_sync_rate_limit_reservation_check,
  DROP CONSTRAINT IF EXISTS openfoodfacts_product_read_rate_limit_singleton_check,
  DROP CONSTRAINT IF EXISTS openfoodfacts_product_read_rate_limit_reservation_check;

DO $migration$
DECLARE
  legacy_constraint RECORD;
  canonical_name TEXT;
BEGIN
  FOR legacy_constraint IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.openfoodfacts_product_read_rate_limit'::regclass
       AND conname LIKE 'openfoodfacts_automatic_sync_rate_limit%'
  LOOP
    canonical_name := REPLACE(
      legacy_constraint.conname,
      'openfoodfacts_automatic_sync_rate_limit',
      'openfoodfacts_product_read_rate_limit'
    );
    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'public.openfoodfacts_product_read_rate_limit'::regclass
         AND conname = canonical_name
    ) THEN
      EXECUTE FORMAT(
        'ALTER TABLE public.openfoodfacts_product_read_rate_limit RENAME CONSTRAINT %I TO %I',
        legacy_constraint.conname,
        canonical_name
      );
    END IF;
  END LOOP;
END;
$migration$;

UPDATE public.openfoodfacts_product_read_rate_limit
   SET id = COALESCE(id, 1),
       next_product_read_at = COALESCE(
         next_product_read_at,
         '1970-01-01T00:00:00Z'::timestamptz
       ),
       updated_at = COALESCE(updated_at, NOW()),
       reservation_token = NULL,
       reservation_expires_at = NULL
 WHERE id IS NULL
    OR next_product_read_at IS NULL
    OR updated_at IS NULL
    OR (reservation_token IS NULL) <> (reservation_expires_at IS NULL);

ALTER TABLE public.openfoodfacts_product_read_rate_limit
  ALTER COLUMN id SET DEFAULT 1,
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN next_product_read_at SET DEFAULT '1970-01-01T00:00:00Z',
  ALTER COLUMN next_product_read_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.openfoodfacts_product_read_rate_limit'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE public.openfoodfacts_product_read_rate_limit
      ADD CONSTRAINT openfoodfacts_product_read_rate_limit_pkey PRIMARY KEY (id);
  END IF;
END;
$migration$;

ALTER TABLE public.openfoodfacts_product_read_rate_limit
  ADD CONSTRAINT openfoodfacts_product_read_rate_limit_singleton_check
    CHECK (id = 1),
  ADD CONSTRAINT openfoodfacts_product_read_rate_limit_reservation_check
    CHECK (
      (reservation_token IS NULL) = (reservation_expires_at IS NULL)
    );

INSERT INTO public.openfoodfacts_product_read_rate_limit (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.openfoodfacts_product_read_rate_limit IS
  'System-only singleton leasing and spacing all Open Food Facts Product Opener product reads across server instances.';

ALTER TABLE public.openfoodfacts_product_read_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.openfoodfacts_sync_queue (
  food_id UUID PRIMARY KEY REFERENCES public.foods(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT nextval('public.openfoodfacts_sync_revision_seq') CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  last_succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.openfoodfacts_sync_queue
  ADD COLUMN IF NOT EXISTS last_succeeded_at TIMESTAMPTZ,
  DROP CONSTRAINT IF EXISTS openfoodfacts_sync_queue_status_check;

ALTER TABLE public.openfoodfacts_sync_queue
  ALTER COLUMN revision SET DEFAULT nextval('public.openfoodfacts_sync_revision_seq');

-- Revision values are lease tokens, not display counters. A global sequence
-- prevents a deleted/recreated row from accepting completion from an older
-- worker that happened to claim the same per-food revision number.
SELECT setval(
  'public.openfoodfacts_sync_revision_seq',
  GREATEST(
    COALESCE((SELECT MAX(revision) FROM public.openfoodfacts_sync_queue), 0),
    (SELECT last_value FROM public.openfoodfacts_sync_revision_seq)
  ),
  TRUE
);

ALTER TABLE public.openfoodfacts_sync_queue
  ADD CONSTRAINT openfoodfacts_sync_queue_status_check
  CHECK (status IN ('pending', 'processing', 'failed', 'succeeded'));

DROP INDEX IF EXISTS public.openfoodfacts_sync_queue_due_idx;
CREATE INDEX openfoodfacts_sync_queue_due_idx
ON public.openfoodfacts_sync_queue (next_attempt_at, lease_expires_at)
WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS openfoodfacts_sync_queue_user_status_idx
ON public.openfoodfacts_sync_queue (user_id, status, updated_at DESC);

COMMENT ON TABLE public.openfoodfacts_sync_queue IS
  'Durable, revision-safe state and history for automatic Open Food Facts product contributions.';

ALTER TABLE public.openfoodfacts_sync_queue ENABLE ROW LEVEL SECURITY;

-- Return OFF's canonical representation only for conservative public GTINs.
-- OFF left-pads 9- through 12-digit codes to GTIN-13 and removes the
-- zero indicator from GTIN-14 representations of a GTIN-13. Internal
-- variable-measure codes beginning with 2 after canonicalization are excluded.
CREATE OR REPLACE FUNCTION public.normalize_openfoodfacts_gtin(raw_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $function$
DECLARE
  normalized TEXT := BTRIM(raw_code);
  weighted_sum INTEGER;
  expected_check_digit INTEGER;
BEGIN
  IF normalized !~ '^[0-9]+$'
     OR normalized ~ '^0+$'
     OR CHAR_LENGTH(normalized) NOT IN (8, 9, 10, 11, 12, 13, 14) THEN
    RETURN NULL;
  END IF;

  IF CHAR_LENGTH(normalized) BETWEEN 9 AND 12 THEN
    normalized := LPAD(normalized, 13, '0');
  ELSIF CHAR_LENGTH(normalized) = 14 AND LEFT(normalized, 1) = '0' THEN
    normalized := SUBSTRING(normalized FROM 2);
  END IF;

  IF LEFT(normalized, 1) = '2' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
           SUM(
             SUBSTRING(normalized FROM position FOR 1)::INTEGER *
             CASE
               WHEN (CHAR_LENGTH(normalized) - position) % 2 = 1 THEN 3
               ELSE 1
             END
           ),
           0
         )
    INTO weighted_sum
    FROM GENERATE_SERIES(1, CHAR_LENGTH(normalized) - 1) AS position;

  expected_check_digit := (10 - (weighted_sum % 10)) % 10;
  IF expected_check_digit <> RIGHT(normalized, 1)::INTEGER THEN
    RETURN NULL;
  END IF;

  RETURN normalized;
END;
$function$;

-- This set-returning function is shared by statement-level triggers and the
-- bounded backfill. Keeping eligibility set based avoids a provider/settings
-- lookup for every row in a bulk food import.
CREATE OR REPLACE FUNCTION public.eligible_openfoodfacts_foods(
  target_food_ids UUID[] DEFAULT NULL,
  target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (food_id UUID, user_id UUID)
LANGUAGE sql
STABLE
AS $function$
  SELECT food.id, food.user_id
    FROM public.foods food
    JOIN public.user_preferences preferences
      ON preferences.user_id = food.user_id
     AND preferences.auto_contribute_openfoodfacts = TRUE
    JOIN public.global_settings settings
      ON settings.id = 1
     AND settings.allow_openfoodfacts_contributions = TRUE
   WHERE food.user_id IS NOT NULL
     AND (target_food_ids IS NULL OR food.id = ANY(target_food_ids))
     AND (target_user_id IS NULL OR food.user_id = target_user_id)
     AND food.is_custom IS TRUE
     AND (food.provider_type IS NULL OR LOWER(BTRIM(food.provider_type)) = 'custom')
     AND NULLIF(BTRIM(food.name), '') IS NOT NULL
     AND public.normalize_openfoodfacts_gtin(food.barcode) IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.food_variants variant
        WHERE variant.food_id = food.id
          AND variant.is_default IS TRUE
          AND variant.serving_size > 0
          AND LOWER(BTRIM(variant.serving_unit)) IN (
            'g', 'kg', 'mg', 'oz', 'lb', 'lbs',
            'ml', 'l', 'liter', 'liters', 'cup', 'cups', 'tbsp', 'tsp'
          )
     );
$function$;

CREATE OR REPLACE FUNCTION public.refresh_openfoodfacts_sync_queue(
  changed_food_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(CARDINALITY(changed_food_ids), 0) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.openfoodfacts_sync_queue queue
   WHERE queue.food_id = ANY(changed_food_ids)
     AND NOT EXISTS (
       SELECT 1
         FROM public.eligible_openfoodfacts_foods(changed_food_ids, NULL) eligible
        WHERE eligible.food_id = queue.food_id
     );

  INSERT INTO public.openfoodfacts_sync_queue (food_id, user_id)
  SELECT eligible.food_id, eligible.user_id
    FROM public.eligible_openfoodfacts_foods(changed_food_ids, NULL) eligible
  ON CONFLICT (food_id) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      revision = nextval('public.openfoodfacts_sync_revision_seq'),
      status = 'pending',
      attempt_count = 0,
      next_attempt_at = NOW(),
      lease_expires_at = NULL,
      last_error = NULL,
      updated_at = NOW();
END;
$function$;

-- Remove every trigger shape from the earlier PR revisions before installing
-- the set-based transition-table triggers below.
DROP TRIGGER IF EXISTS queue_openfoodfacts_food_insert ON public.foods;
DROP TRIGGER IF EXISTS queue_openfoodfacts_food_update ON public.foods;
DROP TRIGGER IF EXISTS queue_openfoodfacts_variant_insert ON public.food_variants;
DROP TRIGGER IF EXISTS queue_openfoodfacts_variant_update ON public.food_variants;
DROP TRIGGER IF EXISTS queue_openfoodfacts_variant_delete ON public.food_variants;
DROP TRIGGER IF EXISTS set_openfoodfacts_backfill_on_preference_insert ON public.user_preferences;
DROP TRIGGER IF EXISTS set_openfoodfacts_backfill_on_preference_update ON public.user_preferences;
DROP TRIGGER IF EXISTS cleanup_openfoodfacts_queue_on_opt_out ON public.user_preferences;
DROP TRIGGER IF EXISTS cleanup_openfoodfacts_queue_on_preference_delete ON public.user_preferences;
DROP TRIGGER IF EXISTS set_openfoodfacts_backfill_on_global_enable ON public.global_settings;

DROP FUNCTION IF EXISTS public.enqueue_openfoodfacts_food_sync(UUID, UUID);
DROP FUNCTION IF EXISTS public.queue_openfoodfacts_food_change();
DROP FUNCTION IF EXISTS public.queue_openfoodfacts_variant_change();

CREATE OR REPLACE FUNCTION public.queue_openfoodfacts_food_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  changed_food_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(changed.id)
    INTO changed_food_ids
    FROM (
      SELECT new_food.id
        FROM new_foods new_food
        JOIN old_foods old_food ON old_food.id = new_food.id
       WHERE old_food.user_id IS DISTINCT FROM new_food.user_id
          OR old_food.name IS DISTINCT FROM new_food.name
          OR old_food.brand IS DISTINCT FROM new_food.brand
          OR old_food.barcode IS DISTINCT FROM new_food.barcode
          OR old_food.is_custom IS DISTINCT FROM new_food.is_custom
          OR old_food.provider_type IS DISTINCT FROM new_food.provider_type
    ) changed;

  PERFORM public.refresh_openfoodfacts_sync_queue(changed_food_ids);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_openfoodfacts_variant_inserts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  changed_food_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT variant.food_id)
    INTO changed_food_ids
    FROM new_variants variant
   WHERE variant.is_default IS TRUE;

  PERFORM public.refresh_openfoodfacts_sync_queue(changed_food_ids);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_openfoodfacts_variant_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  changed_food_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT changed.food_id)
    INTO changed_food_ids
    FROM (
      SELECT old_variant.food_id
        FROM old_variants old_variant
        JOIN new_variants new_variant ON new_variant.id = old_variant.id
       WHERE (old_variant.is_default IS TRUE OR new_variant.is_default IS TRUE)
         AND (
           old_variant.food_id IS DISTINCT FROM new_variant.food_id OR
           old_variant.serving_size IS DISTINCT FROM new_variant.serving_size OR
           old_variant.serving_unit IS DISTINCT FROM new_variant.serving_unit OR
           old_variant.calories IS DISTINCT FROM new_variant.calories OR
           old_variant.protein IS DISTINCT FROM new_variant.protein OR
           old_variant.carbs IS DISTINCT FROM new_variant.carbs OR
           old_variant.fat IS DISTINCT FROM new_variant.fat OR
           old_variant.saturated_fat IS DISTINCT FROM new_variant.saturated_fat OR
           old_variant.trans_fat IS DISTINCT FROM new_variant.trans_fat OR
           old_variant.cholesterol IS DISTINCT FROM new_variant.cholesterol OR
           old_variant.sodium IS DISTINCT FROM new_variant.sodium OR
           old_variant.potassium IS DISTINCT FROM new_variant.potassium OR
           old_variant.dietary_fiber IS DISTINCT FROM new_variant.dietary_fiber OR
           old_variant.sugars IS DISTINCT FROM new_variant.sugars OR
           old_variant.vitamin_a IS DISTINCT FROM new_variant.vitamin_a OR
           old_variant.vitamin_c IS DISTINCT FROM new_variant.vitamin_c OR
           old_variant.calcium IS DISTINCT FROM new_variant.calcium OR
           old_variant.iron IS DISTINCT FROM new_variant.iron OR
           old_variant.is_default IS DISTINCT FROM new_variant.is_default
         )
      UNION
      SELECT new_variant.food_id
        FROM old_variants old_variant
        JOIN new_variants new_variant ON new_variant.id = old_variant.id
       WHERE (old_variant.is_default IS TRUE OR new_variant.is_default IS TRUE)
         AND old_variant.food_id IS DISTINCT FROM new_variant.food_id
    ) changed;

  PERFORM public.refresh_openfoodfacts_sync_queue(changed_food_ids);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.queue_openfoodfacts_variant_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  changed_food_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(DISTINCT variant.food_id)
    INTO changed_food_ids
    FROM old_variants variant
   WHERE variant.is_default IS TRUE;

  PERFORM public.refresh_openfoodfacts_sync_queue(changed_food_ids);
  RETURN NULL;
END;
$function$;

CREATE TRIGGER queue_openfoodfacts_food_update
AFTER UPDATE ON public.foods
REFERENCING OLD TABLE AS old_foods NEW TABLE AS new_foods
FOR EACH STATEMENT
EXECUTE FUNCTION public.queue_openfoodfacts_food_updates();

CREATE TRIGGER queue_openfoodfacts_variant_insert
AFTER INSERT ON public.food_variants
REFERENCING NEW TABLE AS new_variants
FOR EACH STATEMENT
EXECUTE FUNCTION public.queue_openfoodfacts_variant_inserts();

CREATE TRIGGER queue_openfoodfacts_variant_update
AFTER UPDATE ON public.food_variants
REFERENCING OLD TABLE AS old_variants NEW TABLE AS new_variants
FOR EACH STATEMENT
EXECUTE FUNCTION public.queue_openfoodfacts_variant_updates();

CREATE TRIGGER queue_openfoodfacts_variant_delete
AFTER DELETE ON public.food_variants
REFERENCING OLD TABLE AS old_variants
FOR EACH STATEMENT
EXECUTE FUNCTION public.queue_openfoodfacts_variant_deletes();

-- Database-level transition guards make consent changes safe even when a new
-- caller bypasses the normal settings service in the future.
CREATE OR REPLACE FUNCTION public.set_openfoodfacts_backfill_on_preference_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.openfoodfacts_backfill_pending := NEW.auto_contribute_openfoodfacts;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_openfoodfacts_backfill_on_preference_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.auto_contribute_openfoodfacts IS DISTINCT FROM NEW.auto_contribute_openfoodfacts THEN
    NEW.openfoodfacts_backfill_pending := NEW.auto_contribute_openfoodfacts;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_openfoodfacts_backfill_on_global_enable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.user_preferences
     SET openfoodfacts_backfill_pending = TRUE,
         updated_at = NOW()
   WHERE auto_contribute_openfoodfacts IS TRUE;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_openfoodfacts_queue_on_opt_out()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.openfoodfacts_sync_queue WHERE user_id = NEW.user_id;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_openfoodfacts_queue_on_preference_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM public.openfoodfacts_sync_queue WHERE user_id = OLD.user_id;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER set_openfoodfacts_backfill_on_preference_insert
BEFORE INSERT ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_openfoodfacts_backfill_on_preference_insert();

CREATE TRIGGER set_openfoodfacts_backfill_on_preference_update
BEFORE UPDATE OF auto_contribute_openfoodfacts ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_openfoodfacts_backfill_on_preference_update();

CREATE TRIGGER set_openfoodfacts_backfill_on_global_enable
AFTER UPDATE OF allow_openfoodfacts_contributions ON public.global_settings
FOR EACH ROW
WHEN (
  OLD.allow_openfoodfacts_contributions IS FALSE AND
  NEW.allow_openfoodfacts_contributions IS TRUE
)
EXECUTE FUNCTION public.set_openfoodfacts_backfill_on_global_enable();

CREATE TRIGGER cleanup_openfoodfacts_queue_on_opt_out
AFTER UPDATE OF auto_contribute_openfoodfacts ON public.user_preferences
FOR EACH ROW
WHEN (
  OLD.auto_contribute_openfoodfacts IS TRUE AND
  NEW.auto_contribute_openfoodfacts IS FALSE
)
EXECUTE FUNCTION public.cleanup_openfoodfacts_queue_on_opt_out();

CREATE TRIGGER cleanup_openfoodfacts_queue_on_preference_delete
AFTER DELETE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_openfoodfacts_queue_on_preference_delete();
