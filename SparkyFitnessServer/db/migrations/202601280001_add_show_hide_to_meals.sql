BEGIN;

-- 1. Add 'is_visible' to the main table (Safe/Idempotent check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'meal_types' 
          AND column_name = 'is_visible'
    ) THEN
        RAISE NOTICE 'Adding is_visible column to meal_types...';
        -- Removed quotes around BOOLEAN
        ALTER TABLE "public"."meal_types" ADD COLUMN "is_visible" boolean DEFAULT TRUE;
        
        UPDATE "public"."meal_types" SET "is_visible" = TRUE;
        
        ALTER TABLE "public"."meal_types" ALTER COLUMN "is_visible" SET NOT NULL;
    ELSE
        RAISE NOTICE 'Column is_visible already exists in meal_types table. Skipping.';
    END IF;
END $$;

-- 2. Create the table for User-Specific Visibility Preferences
CREATE TABLE IF NOT EXISTS "public"."user_meal_visibilities" (
    -- Removed quotes around data types (uuid, boolean, timestamp)
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "meal_type_id" uuid NOT NULL REFERENCES "public"."meal_types"("id") ON DELETE CASCADE,
    "is_visible" boolean DEFAULT TRUE,
    "created_at" timestamp with time zone DEFAULT now(),
    
    PRIMARY KEY ("user_id", "meal_type_id")
);

COMMIT;