-- Migration: Add client_id to food_entries, water_intake_entries, food_entry_meals and foods
--
-- The mobile app can queue a food entry or a drink while the server is out of
-- reach and replay it later. A replay after a timeout may hit a request that
-- already committed, so the app mints a uuid per write and sends it as
-- `client_id`. The server stores it on the row it creates and answers a repeat
-- with the existing row instead of creating a second one.
--
-- Partial unique indexes: rows written by the web, providers and older apps
-- have no client_id and stay unconstrained. The index names are what the
-- repository code recognises when two identical requests race.
ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS client_id uuid;

ALTER TABLE public.water_intake_entries
  ADD COLUMN IF NOT EXISTS client_id uuid;

COMMENT ON COLUMN public.food_entries.client_id IS 'Client-minted idempotency key from the mobile offline queue. NULL for entries not created through a replayable client.';
COMMENT ON COLUMN public.water_intake_entries.client_id IS 'Client-minted idempotency key from the mobile offline queue. NULL for entries not created through a replayable client.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_food_entries_user_client_id
  ON public.food_entries USING btree (user_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_water_intake_entries_user_client_id
  ON public.water_intake_entries USING btree (user_id, client_id)
  WHERE client_id IS NOT NULL;

-- A logged meal is its parent row plus the component entries made from it, so
-- the key sits on the parent: a repeat of a request whose parent was stored is
-- answered with that meal instead of making a second one.
ALTER TABLE public.food_entry_meals
  ADD COLUMN IF NOT EXISTS client_id uuid;

COMMENT ON COLUMN public.food_entry_meals.client_id IS 'Client-minted idempotency key from the mobile offline queue. NULL for meals not created through a replayable client.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_food_entry_meals_user_client_id
  ON public.food_entry_meals USING btree (user_id, client_id)
  WHERE client_id IS NOT NULL;

-- A food made on the phone with no connection is created when it uploads. The
-- key sits on the food so a repeat of a request that already committed is
-- answered with that food (and its default serving) instead of a duplicate.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS client_id uuid;

COMMENT ON COLUMN public.foods.client_id IS 'Client-minted idempotency key from the mobile offline queue. NULL for foods not created through a replayable client.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_user_client_id
  ON public.foods USING btree (user_id, client_id)
  WHERE client_id IS NOT NULL;
