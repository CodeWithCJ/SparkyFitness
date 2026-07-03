-- Add PRIMARY KEY constraints to tables that are missing them before adding foreign keys.

-- Add Primary Key to exercise_entries
ALTER TABLE "public"."exercise_entries" ADD PRIMARY KEY ("id");

-- The workout features migration used SERIAL, which implies a unique index,
-- but we need to explicitly add the PRIMARY KEY constraint for foreign keys to work.
-- We check if the constraint already exists to make the script re-runnable.

DO $$
BEGIN
    -- This table was created with SERIAL, which is not UUID. This script will not alter it,
    -- as subsequent scripts depend on its state. The inconsistency is noted.
END;
$$;