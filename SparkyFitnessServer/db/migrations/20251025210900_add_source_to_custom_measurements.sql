DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'custom_measurements' AND column_name = 'source') THEN
        ALTER TABLE public.custom_measurements
        ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'manual';
    END IF;
END
$$;