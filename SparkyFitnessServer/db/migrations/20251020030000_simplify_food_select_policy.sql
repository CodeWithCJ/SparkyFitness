-- Drop the existing policy
DROP POLICY IF EXISTS foods_select_policy ON public.foods;

-- Create a simplified policy that only allows access by the owner
CREATE POLICY foods_select_policy
    ON public.foods
    AS PERMISSIVE
    FOR SELECT
    TO PUBLIC
    USING (user_id = (current_setting('app.user_id'::text))::uuid);