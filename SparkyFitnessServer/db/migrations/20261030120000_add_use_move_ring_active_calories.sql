ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS use_move_ring_active_calories BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_preferences.use_move_ring_active_calories IS
  'iPhone sync reads daily active calories from the Apple Move ring instead of the Apple Health Active Energy total.';
