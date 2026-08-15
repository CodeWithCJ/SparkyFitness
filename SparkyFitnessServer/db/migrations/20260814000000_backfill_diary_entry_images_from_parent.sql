-- Freezes diary entry photos, so editing a food or meal no longer changes what
-- past entries display.
--
-- Until now food_entries.images / food_entry_meals.images held only a per-entry
-- OVERRIDE, and were empty for an ordinary log. The diary therefore fell back
-- to the parent's images and rendered them live — so replacing a food's photo
-- silently changed every past entry of that food. Nutrition never behaved that
-- way: it is snapshotted onto the entry at log time and only changes when the
-- user explicitly syncs. This aligns photos with that model.
--
-- From here on the application writes the parent's images onto the entry when
-- it is logged (see models/foodEntry.ts) and updates them on an explicit sync
-- (see services/foodCoreService.ts). This migration backfills rows that
-- pre-date that behaviour.
--
-- LIMITATION, deliberately accepted: the photo an entry was logged with is not
-- recoverable — it was never stored. Backfilling necessarily stamps the
-- parent's CURRENT image onto old entries. This freezes history from today
-- forward; it does not restore it.
--
-- Only rows holding an empty array are touched, so a real user-set override is
-- always preserved.

UPDATE food_entries fe
SET images = f.images
FROM foods f
WHERE fe.food_id = f.id
  AND fe.images = '[]'::jsonb
  AND jsonb_array_length(f.images) > 0;

-- Logged meals inherit from the meal template. meal_template_id is nullable
-- (ad-hoc logged meals have no template); those rows keep an empty array and
-- render exactly as they do today.
UPDATE food_entry_meals fem
SET images = m.images
FROM meals m
WHERE fem.meal_template_id = m.id
  AND fem.images = '[]'::jsonb
  AND jsonb_array_length(m.images) > 0;
