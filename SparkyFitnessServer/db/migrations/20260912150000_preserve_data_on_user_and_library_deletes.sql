BEGIN;

-- Deleting a user failed outright, deleting a library item quietly destroyed
-- other people's diary history, and the audit trail was erased along with the
-- account it described. All three come from delete rules that no longer match
-- the schema they were written for.
--
-- Statement order matters: the entry -> library rules are relaxed first, so that
-- the cleanup further down can remove a stale food or exercise without taking
-- somebody's diary entries with it.

-- ---------------------------------------------------------------------------
-- 1. A diary entry outlives the library item it was logged from.
--
-- 20250717190700_add_cascading_deletes.sql made food_entries and exercise_entries
-- cascade from foods/exercises. That was right at the time: an entry was a bare
-- pointer, so losing the library row left a diary line that could not say what
-- was eaten or how many calories it was.
--
-- 20251019013200_merged_schema_and_data.sql then added the snapshot columns
-- (food_name, brand_name, serving_size, the nutrition set, exercise_name,
-- calories_per_hour, ...) and backfilled them. From that point an entry stood on
-- its own, but the delete rule was never revisited -- so removing a food still
-- deleted every entry referencing it, including entries belonging to other users
-- who logged it through family sharing.
--
-- Blank the pointer and keep the entry. The diary read path already LEFT JOINs
-- foods/food_variants and reads fe.* for name and nutrition.
-- ---------------------------------------------------------------------------

ALTER TABLE public.food_entries
  DROP CONSTRAINT IF EXISTS fk_food_entries_food_id,
  DROP CONSTRAINT IF EXISTS food_entries_food_id_fkey,
  ADD CONSTRAINT fk_food_entries_food_id
    FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE SET NULL;

-- exercise_id was NOT NULL because a pointer was mandatory in the pointer era.
-- It has to allow NULL before an entry can outlive its exercise.
ALTER TABLE public.exercise_entries
  ALTER COLUMN exercise_id DROP NOT NULL;

ALTER TABLE public.exercise_entries
  DROP CONSTRAINT IF EXISTS fk_exercise_entries_exercise_id,
  DROP CONSTRAINT IF EXISTS exercise_entries_exercise_id_fkey,
  ADD CONSTRAINT fk_exercise_entries_exercise_id
    FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. An entry outlives whoever typed it.
--
-- created_by_user_id / updated_by_user_id record who entered the row, which under
-- family sharing is often not the person who owns it. user_id is the owner and
-- already cascades. Cascading the audit columns as well deletes a surviving
-- user's entry because the delegate who logged or last edited it was removed --
-- and on the tables below they had no rule at all, which is what made the
-- original admin user deletion fail with a foreign key violation.
-- ---------------------------------------------------------------------------

ALTER TABLE public.food_entries
  DROP CONSTRAINT IF EXISTS food_entries_created_by_user_id_fkey,
  ADD CONSTRAINT food_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.food_entries
  DROP CONSTRAINT IF EXISTS food_entries_updated_by_user_id_fkey,
  ADD CONSTRAINT food_entries_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.exercise_entries
  DROP CONSTRAINT IF EXISTS exercise_entries_created_by_user_id_fkey,
  ADD CONSTRAINT exercise_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.exercise_entries
  DROP CONSTRAINT IF EXISTS exercise_entries_updated_by_user_id_fkey,
  ADD CONSTRAINT exercise_entries_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.mood_entries
  DROP CONSTRAINT IF EXISTS mood_entries_created_by_user_id_fkey,
  ADD CONSTRAINT mood_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.mood_entries
  DROP CONSTRAINT IF EXISTS mood_entries_updated_by_user_id_fkey,
  ADD CONSTRAINT mood_entries_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_entries
  DROP CONSTRAINT IF EXISTS sleep_entries_created_by_user_id_fkey,
  ADD CONSTRAINT sleep_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_entries
  DROP CONSTRAINT IF EXISTS sleep_entries_updated_by_user_id_fkey,
  ADD CONSTRAINT sleep_entries_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_entry_stages
  DROP CONSTRAINT IF EXISTS sleep_entry_stages_created_by_user_id_fkey,
  ADD CONSTRAINT sleep_entry_stages_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_entry_stages
  DROP CONSTRAINT IF EXISTS sleep_entry_stages_updated_by_user_id_fkey,
  ADD CONSTRAINT sleep_entry_stages_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.water_intake_entries
  DROP CONSTRAINT IF EXISTS water_intake_entries_created_by_user_id_fkey,
  ADD CONSTRAINT water_intake_entries_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. A user's own rows go with the user.
--
-- 20260125000000_better_auth_migration.sql re-pointed a hand-written list of
-- tables from auth.users to "user". The tables below were missed, so they ended
-- up with no foreign key to "user" at all: deleting an account silently left
-- their rows behind rather than raising an error. That includes secrets --
-- external_data_providers holds OAuth/refresh tokens, ai_service_settings holds
-- AI provider API keys.
--
-- Existing orphans have to be resolved before a constraint can validate.
-- ---------------------------------------------------------------------------

DELETE FROM public.ai_service_settings x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.ai_service_settings
  DROP CONSTRAINT IF EXISTS ai_service_settings_user_id_fkey,
  ADD CONSTRAINT ai_service_settings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.check_in_measurements x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.check_in_measurements
  DROP CONSTRAINT IF EXISTS check_in_measurements_user_id_fkey,
  ADD CONSTRAINT check_in_measurements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.custom_categories x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.custom_categories
  DROP CONSTRAINT IF EXISTS custom_categories_user_id_fkey,
  ADD CONSTRAINT custom_categories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.custom_measurements x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.custom_measurements
  DROP CONSTRAINT IF EXISTS custom_measurements_user_id_fkey,
  ADD CONSTRAINT custom_measurements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.exercise_entries x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.exercise_entries
  DROP CONSTRAINT IF EXISTS exercise_entries_user_id_fkey,
  ADD CONSTRAINT exercise_entries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.external_data_providers x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.external_data_providers
  DROP CONSTRAINT IF EXISTS external_data_providers_user_id_fkey,
  ADD CONSTRAINT external_data_providers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.sparky_chat_history x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.sparky_chat_history
  DROP CONSTRAINT IF EXISTS sparky_chat_history_user_id_fkey,
  ADD CONSTRAINT sparky_chat_history_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.user_goals x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.user_goals
  DROP CONSTRAINT IF EXISTS user_goals_user_id_fkey,
  ADD CONSTRAINT user_goals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.user_preferences x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey,
  ADD CONSTRAINT user_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.water_intake x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.water_intake
  DROP CONSTRAINT IF EXISTS water_intake_user_id_fkey,
  ADD CONSTRAINT water_intake_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- foods and exercises follow the same rule: the deleted user's library items go
-- with them. This is only safe because section 1 already stopped that from
-- reaching anybody's diary.

DELETE FROM public.foods x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_user_id_fkey,
  ADD CONSTRAINT foods_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

DELETE FROM public.exercises x WHERE x.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."user" u WHERE u.id = x.user_id);
ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_user_id_fkey,
  ADD CONSTRAINT exercises_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Clean up ownerless library rows.
--
-- A private library item with user_id IS NULL is reachable by nobody: RLS grants
-- library access on owner match, shared_with_public, or an active family_access
-- grant (has_library_access_with_public in rls_policies.sql), and a NULL owner
-- satisfies none of them. Purge only the rows nothing points at, so a public or
-- still-referenced item is never touched.
-- ---------------------------------------------------------------------------

DELETE FROM public.foods f
WHERE f.user_id IS NULL
  AND f.shared_with_public IS NOT TRUE
  AND NOT EXISTS (SELECT 1 FROM public.food_entries fe WHERE fe.food_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.meal_foods mf WHERE mf.food_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.meal_plans mp WHERE mp.food_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.meal_plan_template_assignments mpta WHERE mpta.food_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.food_favorites ff WHERE ff.food_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_water_containers uwc WHERE uwc.linked_food_id = f.id);

DELETE FROM public.exercises e
WHERE e.user_id IS NULL
  AND e.shared_with_public IS NOT TRUE
  AND NOT EXISTS (SELECT 1 FROM public.exercise_entries ee WHERE ee.exercise_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.workout_preset_exercises wpe WHERE wpe.exercise_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.workout_plan_template_assignments wpta WHERE wpta.exercise_id = e.id);

-- ---------------------------------------------------------------------------
-- 5. The audit trail outlives the accounts it describes.
--
-- 20251006220500_create_admin_activity_logs_table.sql had target_user_id right
-- (ON DELETE SET NULL). 20260125000000_better_auth_migration.sql re-pointed both
-- columns from auth.users to "user" and changed the rule to ON DELETE CASCADE on
-- the way, so deleting a user erased every log entry about them and deleting an
-- administrator erased the record of everything they had ever done -- which is
-- the one question an audit log exists to answer.
--
-- Dissociate rather than delete. The acting and target ids are also copied into
-- `details` by the caller, so an entry stays readable once the accounts are gone.
-- ---------------------------------------------------------------------------

-- admin_user_id is NOT NULL today, which is what forced CASCADE on it. Allow
-- NULL so the event can outlive the administrator who performed it.
ALTER TABLE public.admin_activity_logs
  ALTER COLUMN admin_user_id DROP NOT NULL;

ALTER TABLE public.admin_activity_logs
  DROP CONSTRAINT IF EXISTS admin_activity_logs_admin_user_id_fkey,
  ADD CONSTRAINT admin_activity_logs_admin_user_id_fkey
    FOREIGN KEY (admin_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

ALTER TABLE public.admin_activity_logs
  DROP CONSTRAINT IF EXISTS admin_activity_logs_target_user_id_fkey,
  ADD CONSTRAINT admin_activity_logs_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;

COMMIT;
