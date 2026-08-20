-- Fix: Allow shared users with can_manage_diary permission to INSERT foods
-- Issue: https://github.com/CodeWithCJ/SparkyFitness/issues/2182
--
-- The create_library_policy function in rls_policies.sql has been updated to:
-- 1. Drop existing policies before creating (idempotent — safe for server boot)
-- 2. Split the FOR ALL modify_policy into separate INSERT/UPDATE/DELETE policies
-- 3. Allow can_manage_diary holders to INSERT (but not UPDATE/DELETE)
--
-- This migration handles the transition: the server boot (applyRlsPolicies)
-- will recreate the correct policies via the updated function. This file
-- exists to document the fix and to drop any stale policy names from older
-- schema states.

-- Clean up any leftover policies from previous manual fixes
DROP POLICY IF EXISTS modify_policy ON public.foods;
DROP POLICY IF EXISTS foods_insert_policy ON public.foods;
DROP POLICY IF EXISTS foods_update_policy ON public.foods;
DROP POLICY IF EXISTS foods_delete_policy ON public.foods;

-- The correct policies are created by create_library_policy('foods', ...)
-- which is applied on every server boot via rls_policies.sql.
-- No further SQL needed here — the boot process handles it.
