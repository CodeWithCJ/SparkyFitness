CREATE TABLE public.goal_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  preset_name VARCHAR(255) NOT NULL,
  calories NUMERIC NULL,
  protein NUMERIC NULL,
  carbs NUMERIC NULL,
  fat NUMERIC NULL,
  water_goal INTEGER NULL,
  saturated_fat NUMERIC NULL,
  polyunsaturated_fat NUMERIC NULL,
  monounsaturated_fat NUMERIC NULL,
  trans_fat NUMERIC NULL,
  cholesterol NUMERIC NULL,
  sodium NUMERIC NULL,
  potassium NUMERIC NULL,
  dietary_fiber NUMERIC NULL,
  sugars NUMERIC NULL,
  vitamin_a NUMERIC NULL,
  vitamin_c NUMERIC NULL,
  calcium NUMERIC NULL,
  iron NUMERIC NULL,
  target_exercise_calories_burned NUMERIC NULL,
  target_exercise_duration_minutes INTEGER NULL,
  protein_percentage NUMERIC NULL,
  carbs_percentage NUMERIC NULL,
  fat_percentage NUMERIC NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT goal_presets_pkey PRIMARY KEY (id),
  CONSTRAINT goal_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT goal_presets_unique_name_per_user UNIQUE (user_id, preset_name)
);


CREATE TABLE public.weekly_goal_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL, -- When this plan becomes active
  end_date DATE NULL, -- When this plan ceases to be active (NULL for indefinite)
  is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Only one active plan per user at a time
  monday_preset_id UUID NULL,
  tuesday_preset_id UUID NULL,
  wednesday_preset_id UUID NULL,
  thursday_preset_id UUID NULL,
  friday_preset_id UUID NULL,
  saturday_preset_id UUID NULL,
  sunday_preset_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT weekly_goal_plans_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_goal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT weekly_goal_plans_monday_fkey FOREIGN KEY (monday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_tuesday_fkey FOREIGN KEY (tuesday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_wednesday_fkey FOREIGN KEY (wednesday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_thursday_fkey FOREIGN KEY (thursday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_friday_fkey FOREIGN KEY (friday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_saturday_fkey FOREIGN KEY (saturday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL,
  CONSTRAINT weekly_goal_plans_sunday_fkey FOREIGN KEY (sunday_preset_id) REFERENCES goal_presets (id) ON DELETE SET NULL
);



ALTER TABLE public.user_goals
ADD COLUMN target_exercise_calories_burned NUMERIC NULL,
ADD COLUMN target_exercise_duration_minutes INTEGER NULL;


ALTER TABLE public.user_goals
ADD COLUMN protein_percentage NUMERIC NULL,
ADD COLUMN carbs_percentage NUMERIC NULL,
ADD COLUMN fat_percentage NUMERIC NULL;