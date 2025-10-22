ALTER TABLE "public"."user_preferences"
ADD COLUMN "bmr_algorithm" TEXT NOT NULL DEFAULT 'Mifflin-St Jeor',
ADD COLUMN "body_fat_algorithm" TEXT NOT NULL DEFAULT 'U.S. Navy',
ADD COLUMN "include_bmr_in_net_calories" BOOLEAN NOT NULL DEFAULT false;


ALTER TABLE "public"."check_in_measurements"
ADD COLUMN "height" numeric,
ADD COLUMN "body_fat_percentage" numeric;