ALTER TABLE "public"."user_preferences"
ADD COLUMN "fat_breakdown_algorithm" TEXT NOT NULL DEFAULT 'AHA_GUIDELINES',
ADD COLUMN "mineral_calculation_algorithm" TEXT NOT NULL DEFAULT 'RDA_STANDARD',
ADD COLUMN "vitamin_calculation_algorithm" TEXT NOT NULL DEFAULT 'RDA_STANDARD',
ADD COLUMN "sugar_calculation_algorithm" TEXT NOT NULL DEFAULT 'WHO_GUIDELINES';
