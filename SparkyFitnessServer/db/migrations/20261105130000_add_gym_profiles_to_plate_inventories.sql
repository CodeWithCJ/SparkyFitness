-- Gym profiles: a person can keep several named sets of equipment (home,
-- work gym, travel). Each gym is a plate_inventories row with its own plates,
-- bars, dumbbells and machine weight stacks; exactly one is active, and the
-- existing /api/v2/plate-inventory endpoints read and write that one, so older
-- apps keep working on the active gym. Existing rows become the active gym.
ALTER TABLE public.plate_inventories
  ADD COLUMN IF NOT EXISTS name VARCHAR(60),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dumbbells JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS machine_stacks JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.plate_inventories
  DROP CONSTRAINT IF EXISTS plate_inventories_dumbbells_check;
ALTER TABLE public.plate_inventories
  ADD CONSTRAINT plate_inventories_dumbbells_check
  CHECK (jsonb_typeof(dumbbells) = 'array');

ALTER TABLE public.plate_inventories
  DROP CONSTRAINT IF EXISTS plate_inventories_machine_stacks_check;
ALTER TABLE public.plate_inventories
  ADD CONSTRAINT plate_inventories_machine_stacks_check
  CHECK (jsonb_typeof(machine_stacks) = 'array');

-- One row per user becomes one active row per user.
ALTER TABLE public.plate_inventories
  DROP CONSTRAINT IF EXISTS plate_inventories_user_unique;
CREATE UNIQUE INDEX IF NOT EXISTS plate_inventories_one_active_per_user
  ON public.plate_inventories (user_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS plate_inventories_user_idx
  ON public.plate_inventories (user_id);

COMMENT ON COLUMN public.plate_inventories.name IS
  'Gym name typed by the person; null shows a translated default.';
COMMENT ON COLUMN public.plate_inventories.is_active IS
  'The gym the plate calculator and weight rounding use. One per user.';
COMMENT ON COLUMN public.plate_inventories.dumbbells IS
  'Dumbbell sizes this gym has, in weight_unit, ascending.';
COMMENT ON COLUMN public.plate_inventories.machine_stacks IS
  'Per-exercise machine weight stacks: [{exercise_id, weights[]}] in weight_unit.';
