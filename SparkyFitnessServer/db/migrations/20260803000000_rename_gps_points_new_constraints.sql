-- exercise_entry_gps_points was created on some early environments as
-- exercise_entry_gps_points_new and then renamed into place; renaming a table
-- keeps its constraint names, leaving exercise_entry_gps_points_new_* names
-- (primary key, both foreign keys, and the per-column NOT NULL constraints on
-- Postgres 18+). Fresh installs, whose table comes straight from
-- 20260730000000_create_generic_health_and_workout_tables.sql, get canonical
-- exercise_entry_gps_points_* names. This renames the leftovers so every
-- environment matches db_schema_backup.sql; where the names are already
-- canonical (or the server is older than Postgres 18 and has no catalogued
-- NOT NULL constraints) it is a no-op.
DO $$
DECLARE
    gps_table regclass := to_regclass('public.exercise_entry_gps_points');
    old_name text;
BEGIN
    IF gps_table IS NULL THEN
        RETURN;
    END IF;
    FOR old_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = gps_table
          AND conname LIKE 'exercise\_entry\_gps\_points\_new\_%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.exercise_entry_gps_points RENAME CONSTRAINT %I TO %I',
            old_name,
            replace(old_name, '_new_', '_')
        );
    END LOOP;
END $$;
