BEGIN;

ALTER TABLE user_water_containers
ALTER COLUMN volume TYPE NUMERIC(10, 3);

COMMIT;