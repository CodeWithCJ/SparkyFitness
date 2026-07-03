-- Fix RLS policy for family_access table to ensure only the owner_user_id can create access records

DROP POLICY IF EXISTS family_access_insert_policy ON public.family_access;
CREATE POLICY family_access_insert_policy ON public.family_access
FOR INSERT
WITH CHECK (
    owner_user_id = current_setting('app.user_id')::uuid
);