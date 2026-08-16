-- Flip the sign convention of user_preferences.goal_mode_custom_percentage.
--
-- Previously the column was a deficit-only magnitude constrained to 0..40, so a
-- stored 20 meant "cut 20%". Weight-gain support made the column signed, and the
-- original convention (positive = eat less) reads backwards against the rest of
-- the app, where + consistently means more food.
--
-- New convention:  positive = surplus (eat more),  negative = deficit (eat less).
--
-- Every existing non-zero value was authored under the old convention and means a
-- DEFICIT, so it must be negated. Without this, a user storing 20 for "20% cut"
-- would silently be switched to a 20% surplus and start gaining weight.
--
-- Values are negated regardless of goal_mode: the column is only read when
-- goal_mode = 'manual', but stale values on other modes must also carry the new
-- convention in case the user switches to manual later.
--
-- Zero is left alone -- it is sign-neutral and negating it is a no-op.
--
-- This statement is NOT idempotent, and no predicate can make it so: once users
-- start saving surpluses, a positive value is indistinguishable from an
-- unmigrated legacy deficit. Single execution is guaranteed by the migration
-- runner's tracking table, which is the only thing that makes this safe.
--
-- `> 0` rather than `<> 0` purely to limit the blast radius if this is ever
-- replayed by hand: at the moment of running they select exactly the same rows,
-- since the old convention validated the column to [0, 40] and defaulted to 0.

UPDATE public.user_preferences
SET goal_mode_custom_percentage = -goal_mode_custom_percentage
WHERE goal_mode_custom_percentage > 0;
