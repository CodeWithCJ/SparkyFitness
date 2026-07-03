-- Migration: 20260127040000_family_access_audit_fix.sql


-- Description: Adds missing audit columns to mood and sleep tables.

    -- 4. Add audit columns to mood and sleep tables if they don't exist
    -- Wrapped in DO block for conditional logic
    DO $$
    BEGIN
   
    -- mood_entries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mood_entries' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE public.mood_entries ADD COLUMN created_by_user_id UUID REFERENCES public."user"(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mood_entries' AND column_name = 'updated_by_user_id') THEN
        ALTER TABLE public.mood_entries ADD COLUMN updated_by_user_id UUID REFERENCES public."user"(id);
    END IF;

    -- sleep_entries
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_entries' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE public.sleep_entries ADD COLUMN created_by_user_id UUID REFERENCES public."user"(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_entries' AND column_name = 'updated_by_user_id') THEN
        ALTER TABLE public.sleep_entries ADD COLUMN updated_by_user_id UUID REFERENCES public."user"(id);
    END IF;

    -- sleep_entry_stages
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_entry_stages' AND column_name = 'created_by_user_id') THEN
        ALTER TABLE public.sleep_entry_stages ADD COLUMN created_by_user_id UUID REFERENCES public."user"(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sleep_entry_stages' AND column_name = 'updated_by_user_id') THEN
        ALTER TABLE public.sleep_entry_stages ADD COLUMN updated_by_user_id UUID REFERENCES public."user"(id);
    END IF;

    END $$;
