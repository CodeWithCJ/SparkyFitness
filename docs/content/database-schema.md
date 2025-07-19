# SparkyFitness Database Schema Documentation

## Overview
The database uses PostgreSQL with Row Level Security (RLS) policies to ensure data privacy and proper access control. All tables are designed with audit fields (created_at, updated_at) and use UUIDs for primary keys.

## Core Tables

### 1. profiles
**Purpose**: Store user profile information
```sql
-- profiles table
create table public.profiles (
  id uuid not null default gen_random_uuid (),
  email text,
  full_name text,
  phone text,
  bio text,
  date_of_birth date,
  avatar_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own profile
**Relationships**: Links to all user-specific tables

### 2. user_goals
**Purpose**: Track user nutrition and fitness goals over time
```sql
-- user_goals table
create table public.user_goals (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  goal_date date null, -- Null for default goal
  calories numeric null,
  protein numeric null,
  carbs numeric null,
  fat numeric null,
  water_goal integer null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  saturated_fat numeric null, -- Added for comprehensive nutrition goals
  polyunsaturated_fat numeric null,
  monounsaturated_fat numeric null,
  trans_fat numeric null,
  cholesterol numeric null,
  sodium numeric null,
  potassium numeric null,
  dietary_fiber numeric null,
  sugars numeric null,
  vitamin_a numeric null,
  vitamin_c numeric null,
  calcium numeric null,
  iron numeric null,
  constraint user_goals_pkey primary key (id),
  constraint user_goals_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint user_goals_unique_user_date unique (user_id, goal_date) -- Ensure only one goal per user per date
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own goals
**Special Features**: 
- NULL goal_date represents default goals
- Function `manage_goal_timeline()` handles goal updates
- Function `get_goals_for_date()` retrieves goals for specific dates

### 3. user_preferences
**Purpose**: Store user interface and application preferences
```sql
-- user_preferences table
create table public.user_preferences (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  date_format character varying(50) not null default 'yyyy-MM-dd',
  default_weight_unit character varying(50) not null default 'kg',
  default_measurement_unit character varying(50) not null default 'cm',
  auto_clear_history text null default 'never', -- 'never', 'session', '7days', '30days'
  system_prompt text null, -- User-specific override for AI system prompt
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_preferences_pkey primary key (id),
  constraint user_preferences_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE,
  constraint user_preferences_auto_clear_history_check check (
    (
      auto_clear_history = any (array['never'::text, 'session'::text, '7days'::text, '30days'::text])
    )
  )
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own preferences
**Auto-Creation**: Trigger creates preferences on user registration

## Food & Nutrition Tables

### 4. foods
**Purpose**: Master food database with nutrition information
```sql
-- foods table
create table public.foods (
  id uuid not null default gen_random_uuid (),
  name character varying(255) not null,
  calories numeric null,
  protein numeric null,
  carbs numeric null,
  fat numeric null,
  serving_size numeric null, -- Default serving size in grams or standard unit
  serving_unit character varying(50) null, -- e.g., 'g', 'ml', 'piece'
  is_custom boolean null default false, -- True if created by a user
  user_id uuid null, -- Creator user_id if is_custom is true
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  barcode character varying(255) null, -- For scanning
  openfoodfacts_id character varying(255) null, -- Link to external databases
  shared_with_public boolean null default false,
  default_variant_id uuid null, -- Reference to the default food_variant for this food
  saturated_fat numeric null, -- Added for comprehensive nutrition
  polyunsaturated_fat numeric null,
  monounsaturated_unsaturated numeric null,
  trans_fat numeric null,
  cholesterol numeric null,
  sodium numeric null,
  potassium numeric null,
  dietary_fiber numeric null,
  sugars numeric null,
  vitamin_a numeric null,
  vitamin_c numeric null,
  calcium numeric null,
  iron numeric null,
  constraint foods_pkey primary key (id),
  constraint foods_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint foods_default_variant_id_fkey foreign KEY (default_variant_id) references food_variants (id)
) TABLESPACE pg_default;
```
**RLS**: Users can access public foods and their own custom foods
**Special Features**:
- Public foods (user_id is NULL) accessible to all
- Custom foods linked to specific users
- Comprehensive nutrition profile

### 5. food_variants
**Purpose**: Alternative serving sizes and preparations for foods
```sql
-- food_variants table
create table public.food_variants (
  id uuid not null default gen_random_uuid (),
  food_id uuid not null,
  serving_size numeric not null,
  serving_unit character varying(50) not null,
  calories numeric null,
  protein numeric null,
  carbs numeric null,
  fat numeric null,
  saturated_fat numeric null,
  polyunsaturated_fat numeric null,
  monounsaturated_unsaturated numeric null,
  trans_fat numeric null,
  cholesterol numeric null,
  sodium numeric null,
  potassium numeric null,
  dietary_fiber numeric null,
  sugars numeric null,
  vitamin_a numeric null,
  vitamin_c numeric null,
  calcium numeric null,
  iron numeric null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint food_variants_pkey primary key (id),
  constraint food_variants_food_id_fkey foreign KEY (food_id) references foods (id)
) TABLESPACE pg_default;
```
**RLS**: Inherits access from parent food
**Use Case**: Different serving sizes (1 cup, 1 slice, etc.)

### 6. food_entries
**Purpose**: Daily food consumption log
```sql
-- food_entries table
create table public.food_entries (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  food_id uuid not null,
  meal_type character varying(50) not null, -- e.g., 'breakfast', 'lunch', 'dinner', 'snack'
  quantity numeric not null,
  unit character varying(50) null, -- e.g., 'g', 'oz', 'piece'
  entry_date date not null,
  created_at timestamp with time zone not null default now(),
  variant_id uuid null, -- Link to food_variants if applicable
  constraint food_entries_pkey primary key (id),
  constraint food_entries_food_id_fkey foreign KEY (food_id) references foods (id),
  constraint food_entries_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint food_entries_variant_id_fkey foreign KEY (variant_id) references food_variants (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own food entries
**Special Features**:
- Links to either base food or specific variant
- Flexible quantity and unit system

## Meal Management Tables

### 7. meals
**Purpose**: Store user-defined meal templates
```sql
-- meals table
CREATE TABLE public.meals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meals_pkey PRIMARY KEY (id),
  CONSTRAINT meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);
```
**RLS**: Handled at application layer. Users can view their own meals and public meals. Users can insert, update, and delete their own meals.
**Special Features**:
- Allows users to create reusable meal templates.
- `is_public` flag for sharing meals.

### 8. meal_foods
**Purpose**: Link foods to meal templates
```sql
-- meal_foods table
CREATE TABLE public.meal_foods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meal_id uuid NOT NULL,
  food_id uuid NOT NULL,
  variant_id uuid,
  quantity NUMERIC NOT NULL,
  unit VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meal_foods_pkey PRIMARY KEY (id),
  CONSTRAINT meal_foods_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE,
  CONSTRAINT meal_foods_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods (id) ON DELETE CASCADE,
  CONSTRAINT meal_foods_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants (id) ON DELETE SET NULL
);
```
**RLS**: Handled at application layer. Inherits access from parent meal.
**Relationships**: Links to `meals`, `foods`, and `food_variants`.

### 9. meal_plans
**Purpose**: Schedule meals or individual foods for specific dates
```sql
-- meal_plans table
CREATE TABLE public.meal_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meal_id uuid,
  food_id uuid,
  variant_id uuid,
  quantity NUMERIC,
  unit VARCHAR(50),
  plan_date DATE NOT NULL,
  meal_type VARCHAR(50) NOT NULL,
  is_template BOOLEAN DEFAULT FALSE,
  template_name VARCHAR(255),
  day_of_week INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT meal_plans_pkey PRIMARY KEY (id),
  CONSTRAINT chk_meal_or_food CHECK (
    (meal_id IS NOT NULL AND food_id IS NULL AND variant_id IS NULL AND quantity IS NULL AND unit IS NULL) OR
    (meal_id IS NULL AND food_id IS NOT NULL AND variant_id IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL)
  ),
  CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods (id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants (id) ON DELETE SET NULL
);
```
**RLS**: Handled at application layer. Users can view, insert, update, and delete their own meal plans.
**Special Features**:
- Can link to a `meal` template or directly to a `food` item.
- `is_template` and `template_name` for creating reusable meal plan segments.
- `day_of_week` for recurring schedules.

### 10. meal_plan_templates
**Purpose**: Store user-defined meal plan templates that span multiple days or weeks.
```sql
-- meal_plan_templates table
CREATE TABLE public.meal_plan_templates (
id uuid NOT NULL DEFAULT gen_random_uuid(),
user_id uuid NOT NULL,
plan_name VARCHAR(255) NOT NULL,
description TEXT,
start_date DATE NOT NULL,
end_date DATE,
is_active BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
CONSTRAINT meal_plan_templates_pkey PRIMARY KEY (id),
CONSTRAINT meal_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);
```
**RLS**: Handled at the application layer.
**Special Features**:
- `is_active` flag to indicate the currently active meal plan.
- `start_date` and `end_date` for defining the duration of the plan.

### 11. meal_plan_template_assignments
**Purpose**: Link meals to specific days and meal types within a meal plan template.
```sql
-- meal_plan_template_assignments table
CREATE TABLE public.meal_plan_template_assignments (
id uuid NOT NULL DEFAULT gen_random_uuid(),
template_id uuid NOT NULL,
day_of_week INTEGER NOT NULL,
meal_type VARCHAR(50) NOT NULL,
meal_id uuid NOT NULL,
CONSTRAINT meal_plan_template_assignments_pkey PRIMARY KEY (id),
CONSTRAINT meal_plan_template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.meal_plan_templates (id) ON DELETE CASCADE,
CONSTRAINT meal_plan_template_assignments_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals (id) ON DELETE CASCADE
);
```
**RLS**: Handled at the application layer.
**Relationships**: Links `meal_plan_templates` to `meals`.

### 12. food_entries
**Purpose**: Daily food consumption log
```sql
-- food_entries table
create table public.food_entries (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  food_id uuid not null,
  meal_type character varying(50) not null, -- e.g., 'breakfast', 'lunch', 'dinner', 'snack'
  quantity numeric not null,
  unit character varying(50) null, -- e.g., 'g', 'oz', 'piece'
  entry_date date not null,
  created_at timestamp with time zone not null default now(),
  variant_id uuid null, -- Link to food_variants if applicable
  meal_plan_template_id uuid null, -- Link to the meal plan template
  constraint food_entries_pkey primary key (id),
  constraint food_entries_food_id_fkey foreign KEY (food_id) references foods (id),
  constraint food_entries_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint food_entries_variant_id_fkey foreign KEY (variant_id) references food_variants (id),
  constraint food_entries_meal_plan_template_id_fkey foreign KEY (meal_plan_template_id) references meal_plan_templates (id) on delete set null
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own food entries
**Special Features**:
- Links to either base food or specific variant
- Flexible quantity and unit system
- Can be linked to a meal plan template

## Measurement & Tracking Tables

### 10. check_in_measurements
**Purpose**: Standard body measurements tracking
```sql
-- check_in_measurements table
create table public.check_in_measurements (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  entry_date date not null default CURRENT_DATE,
  weight numeric null,
  neck numeric null,
  waist numeric null,
  hips numeric null,
  steps integer null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint check_in_measurements_pkey primary key (id),
  constraint check_in_measurements_user_date_unique unique (user_id, entry_date)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own measurements
**Use Case**: Standard body metrics tracking

### 11. custom_categories
**Purpose**: User-defined measurement categories
```sql
-- custom_categories table
create table public.custom_categories (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  name character varying(50) not null,
  measurement_type character varying(50) not null, -- e.g., 'numeric', 'text'
  frequency text not null, -- e.g., 'Daily', 'Weekly', 'Monthly', 'All'
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint custom_categories_pkey primary key (id),
  constraint custom_categories_user_id_fkey foreign KEY (user_id) references auth.users (id),
  constraint custom_categories_frequency_check check (
    (
      frequency = any (array['All'::text, 'Daily'::text, 'Hourly'::text, 'Weekly'::text, 'Monthly'::text]) -- Added Weekly, Monthly based on common use cases
    )
  )
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own categories
**Use Case**: Custom metrics like "mood", "energy level", etc.

### 12. custom_measurements
**Purpose**: Values for custom measurement categories
```sql
-- custom_measurements table
create table public.custom_measurements (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  category_id uuid not null,
  value numeric not null,
  entry_date date not null,
  entry_hour integer null, -- For hourly frequency
  entry_timestamp timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  constraint custom_measurements_pkey primary key (id),
  constraint custom_measurements_unique_entry unique (user_id, category_id, entry_date, entry_hour), -- Ensure uniqueness based on frequency
  constraint custom_measurements_category_id_fkey foreign KEY (category_id) references custom_categories (id) on delete CASCADE,
  constraint custom_measurements_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own measurements
**Special Features**:
- Supports both daily and hourly tracking
- Links to user-defined categories

### 13. water_intake
**Purpose**: Daily water consumption tracking
```sql
-- water_intake table
create table public.water_intake (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  entry_date date not null,
  glasses_consumed integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint water_intake_pkey primary key (id),
  constraint water_intake_user_date_unique unique (user_id, entry_date),
  constraint water_intake_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own water intake
**Use Case**: Simple daily hydration tracking

## Exercise Tables

### 14. exercises
**Purpose**: Master exercise database
```sql
-- exercises table
create table public.exercises (
  id uuid not null default gen_random_uuid (),
  name character varying(255) not null,
  category character varying(50) null, -- e.g., 'cardio', 'strength'
  calories_per_hour integer null, -- Estimated calories burned per hour
  description text null,
  is_custom boolean null default false,
  user_id uuid null, -- Creator user_id if is_custom is true
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  shared_with_public boolean null default false,
  constraint exercises_pkey primary key (id),
  constraint exercises_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can access public exercises and their own custom exercises
**Special Features**:
- Public exercises (user_id is NULL) accessible to all
- Custom exercises linked to specific users

### 15. exercise_entries
**Purpose**: Daily exercise log
```sql
-- exercise_entries table
create table public.exercise_entries (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  exercise_id uuid not null,
  duration_minutes integer not null,
  calories_burned integer not null,
  entry_date date null,
  notes text null,
  created_at timestamp with time zone null default now(),
  constraint exercise_entries_pkey primary key (id),
  constraint exercise_entries_exercise_id_fkey foreign KEY (exercise_id) references exercises (id),
  constraint exercise_entries_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own exercise entries

## Family & Access Control Tables

### 16. family_access
**Purpose**: Manage family member access to user data
```sql
-- family_access table
create table public.family_access (
  id uuid not null default gen_random_uuid (),
  owner_user_id uuid not null, -- data owner
  family_user_id uuid not null, -- accessing user
  family_email text not null,
  access_permissions jsonb not null default '{}'::jsonb,
  access_start_date timestamp with time zone not null default now(),
  access_end_date timestamp with time zone null,
  is_active boolean not null default true,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint family_access_pkey primary key (id),
  constraint family_access_owner_user_id_fkey foreign KEY (owner_user_id) references auth.users (id),
  constraint family_access_family_user_id_fkey foreign KEY (family_user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**Permission Structure**:
```json
{
  "calorie": boolean,     // Food diary access
  "checkin": boolean,     // Body measurements access
  "reports": boolean,     // Analytics access
  "food_list": boolean    // Food database access
}
```
**RLS**: Users can manage access grants where they are the owner
**Special Features**:
- Time-limited access support
- Granular permission control
- Status tracking (pending/active/expired)

## AI & Chat Tables

### 17. ai_service_settings
**Purpose**: Store AI service configuration per user
```sql
-- ai_service_settings table
create table public.ai_service_settings (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  service_name character varying(255) not null, -- e.g., 'OpenAI', 'Google Gemini'
  service_type character varying(50) not null, -- e.g., 'openai', 'google'
  api_key text not null,
  is_active boolean not null default true,
  model_name character varying(255) null, -- Specific model used
  system_prompt text null, -- Custom system prompt for the AI
  custom_url text null, -- For custom or compatible services
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint ai_service_settings_pkey primary key (id),
  constraint ai_service_settings_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own AI settings
**Security**: API keys should be encrypted at application level

### 18. sparky_chat_history
**Purpose**: Store AI chat conversation history
```sql
-- sparky_chat_history table
create table public.sparky_chat_history (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  session_id uuid not null default gen_random_uuid (), -- To group messages by session
  message_type character varying(50) not null, -- 'user' or 'assistant'
  content text not null, -- The message content
  created_at timestamp with time zone not null default now(),
  metadata jsonb null, -- To store additional data like food options, image URLs, etc.
  -- Deprecated fields, kept for history but not actively used in new workflow:
  message text null,
  response text null,
  image_url text null,
  constraint sparky_chat_history_pkey primary key (id),
  constraint sparky_chat_history_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;
```
**RLS**: Users can only access their own chat history
**Special Features**:
- Session grouping for conversation context
- Metadata for structured AI responses
- Image support for food photo analysis

## Database Functions

### Access Control Functions
- `can_access_user_data(target_user_id, permission_type)`: Check if current user can access another user's data
- `check_family_access(family_user_id, owner_user_id, permission)`: Verify family access permissions
- `get_accessible_users(user_id)`: Get list of users accessible to current user
- `find_user_by_email(email)`: Find user by email (security definer)

### Goal Management Functions
- `get_goals_for_date(user_id, date)`: Get effective goals for specific date
- `manage_goal_timeline(user_id, start_date, calories, protein, carbs, fat, water_goal)`: Update goals with timeline management

### User Management Functions
- `handle_new_user()`: Trigger function for new user setup
- `create_user_preferences()`: Trigger function to create default preferences

## RLS Security Model

### Access Patterns
1. **Own Data Access**: Users can always access their own data
2. **Family Access**: Controlled by family_access table permissions
3. **Public Data**: Foods and Exercises with user_id=NULL are publicly accessible
4. **No Cross-User Access**: No direct access to other users' data without explicit permission

### Permission Inheritance
- `reports` permission grants read access to `calorie` and `checkin` data
- `food_list` permission grants read access to food-related data
- Write permissions are explicitly granted, no inheritance for writes

### Security Principles
- All tables have RLS enabled (where applicable and feasible within the migration system)
- Default deny access model
- Explicit permission grants only
- Time-based access control support
- Audit trail preservation

**Note on RLS for New Meal Tables**:
Due to the dependency on the `auth.uid()` function, which is not natively available during database migrations in this environment, Row Level Security for the `meals`, `meal_foods`, and `meal_plans` tables is currently handled at the **application layer**. This ensures proper data isolation and access control through backend logic rather than direct database policies. Future enhancements may include implementing a custom `auth.uid()` function or integrating with an authentication service that provides this functionality to enable full database-level RLS for these tables.
