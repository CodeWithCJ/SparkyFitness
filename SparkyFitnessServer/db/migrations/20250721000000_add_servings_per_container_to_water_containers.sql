BEGIN;

ALTER TABLE user_water_containers
ADD COLUMN servings_per_container INTEGER NOT NULL DEFAULT 1;

COMMIT;