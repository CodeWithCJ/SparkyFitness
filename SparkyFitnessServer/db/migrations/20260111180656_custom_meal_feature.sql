BEGIN;

-- =========================================================
-- 1. Create the new reference table 
-- =========================================================
CREATE TABLE IF NOT EXISTS "public"."meal_types" (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    sort_order int DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT "meal_types_name_user_unique" UNIQUE NULLS NOT DISTINCT ("name", "user_id")
);

-- =========================================================
-- 2. Seed default data 
-- =========================================================
INSERT INTO "public"."meal_types" ("name", "sort_order")
VALUES 
    ('breakfast', 10),
    ('lunch', 20),
    ('snacks', 30),
    ('dinner', 40)
ON CONFLICT ("name", "user_id") DO NOTHING;

-- =========================================================
-- 3. Migrate: food_entries
-- =========================================================
DO $$
BEGIN
    -- Check if the migration has already been applied by looking for the new column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'food_entries' AND column_name = 'meal_type_id') THEN
        
        RAISE NOTICE 'Migrating table: food_entries...';

        -- A. Add new column
        ALTER TABLE "public"."food_entries" ADD COLUMN "meal_type_id" "uuid";

        -- B. Map string values to new UUIDs
        UPDATE "public"."food_entries" fe
        SET "meal_type_id" = mt.id
        FROM "public"."meal_types" mt
        WHERE LOWER(fe.meal_type) = LOWER(mt.name);

        -- C. Drop old Constraints and Column
        ALTER TABLE "public"."food_entries" DROP CONSTRAINT IF EXISTS "food_entries_meal_type_check";
        ALTER TABLE "public"."food_entries" DROP COLUMN "meal_type";

        -- D. Enforce Not Null and FK
        ALTER TABLE "public"."food_entries" 
            ALTER COLUMN "meal_type_id" SET NOT NULL,
            ADD CONSTRAINT "food_entries_meal_type_id_fkey" 
            FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE RESTRICT;
            
    ELSE
        RAISE NOTICE 'Table food_entries already migrated. Skipping.';
    END IF;
END $$;

-- =========================================================
-- 4. Migrate: meal_plans
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meal_plans' AND column_name = 'meal_type_id') THEN
        
        RAISE NOTICE 'Migrating table: meal_plans...';

        ALTER TABLE "public"."meal_plans" ADD COLUMN "meal_type_id" "uuid";

        UPDATE "public"."meal_plans" mp
        SET "meal_type_id" = mt.id
        FROM "public"."meal_types" mt
        WHERE LOWER(mp.meal_type) = LOWER(mt.name);

        ALTER TABLE "public"."meal_plans" DROP COLUMN "meal_type";

        ALTER TABLE "public"."meal_plans" 
            ALTER COLUMN "meal_type_id" SET NOT NULL,
            ADD CONSTRAINT "meal_plans_meal_type_id_fkey" 
            FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE RESTRICT;
            
    ELSE
        RAISE NOTICE 'Table meal_plans already migrated. Skipping.';
    END IF;
END $$;

-- =========================================================
-- 5. Migrate: meal_plan_template_assignments
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meal_plan_template_assignments' AND column_name = 'meal_type_id') THEN
        
        RAISE NOTICE 'Migrating table: meal_plan_template_assignments...';

        ALTER TABLE "public"."meal_plan_template_assignments" ADD COLUMN "meal_type_id" "uuid";

        UPDATE "public"."meal_plan_template_assignments" mpta
        SET "meal_type_id" = mt.id
        FROM "public"."meal_types" mt
        WHERE LOWER(mpta.meal_type) = LOWER(mt.name);

        ALTER TABLE "public"."meal_plan_template_assignments" DROP COLUMN "meal_type";

        ALTER TABLE "public"."meal_plan_template_assignments" 
            ALTER COLUMN "meal_type_id" SET NOT NULL,
            ADD CONSTRAINT "mpta_meal_type_id_fkey" 
            FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE RESTRICT;
            
    ELSE
        RAISE NOTICE 'Table meal_plan_template_assignments already migrated. Skipping.';
    END IF;
END $$;

-- =========================================================
-- 6. Migrate: food_entry_meals
-- =========================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'food_entry_meals' AND column_name = 'meal_type_id') THEN
        
        RAISE NOTICE 'Migrating table: food_entry_meals...';

        ALTER TABLE "public"."food_entry_meals" ADD COLUMN "meal_type_id" "uuid";

        UPDATE "public"."food_entry_meals" fem
        SET "meal_type_id" = mt.id
        FROM "public"."meal_types" mt
        WHERE LOWER(fem.meal_type) = LOWER(mt.name);

        ALTER TABLE "public"."food_entry_meals" DROP COLUMN "meal_type";

        ALTER TABLE "public"."food_entry_meals" 
            ALTER COLUMN "meal_type_id" SET NOT NULL,
            ADD CONSTRAINT "food_entry_meals_meal_type_id_fkey" 
            FOREIGN KEY ("meal_type_id") REFERENCES "public"."meal_types"("id") ON DELETE RESTRICT;

    ELSE
        RAISE NOTICE 'Table food_entry_meals already migrated. Skipping.';
    END IF;
END $$;

COMMIT;