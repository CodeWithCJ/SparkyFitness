-- Check-in progress photos (front / back / side) -- issue #229.
--
-- This migration does two things, in order:
--   1. Ensures check_in_measurements has a PRIMARY KEY on id. The table was
--      created in InitialDB without one (unlike e.g. exercise_entries), and the
--      check_in_photos.check_in_measurement_id foreign key below references
--      check_in_measurements(id), which requires a unique/primary key on that
--      column.
--   2. Creates the check_in_photos table. user_id references public."user"
--      (Better Auth) -- application users live there, the same target
--      check_in_measurements uses -- not the legacy auth.users table.
--
-- Guarded with DO/IF NOT EXISTS throughout so the script is safe to re-run.

BEGIN;

-- 1. Prerequisite: primary key on check_in_measurements.id (only if missing).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.check_in_measurements'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE public.check_in_measurements ADD PRIMARY KEY (id);
    END IF;
END;
$$;

-- 2. Progress photos table.
CREATE TABLE IF NOT EXISTS public.check_in_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    check_in_measurement_id uuid REFERENCES public.check_in_measurements(id) ON DELETE SET NULL,
    entry_date date NOT NULL,
    photo_type varchar(5) NOT NULL,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_in_photos_type_check CHECK (photo_type IN ('front', 'back', 'side')),
    CONSTRAINT check_in_photos_user_date_type_unique UNIQUE (user_id, entry_date, photo_type)
);

CREATE INDEX IF NOT EXISTS idx_check_in_photos_user_date
    ON public.check_in_photos (user_id, entry_date);

COMMIT;
