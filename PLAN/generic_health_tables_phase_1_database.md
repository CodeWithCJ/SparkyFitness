# Generic Health & Workout Architecture — Phase 1 Plan: Database & Shared Schemas

> **Master Reference Document for AI Agents & Developers**  
> *Last updated: July 2026*  
> This self-contained document provides the complete database architecture specification for SparkyFitness health and workout data storage across **Garmin Connect API**, **Garmin/Wahoo/ANT+ FIT binary files**, **Apple HealthKit (`@kingstinct/react-native-healthkit`)**, and **Google Health Connect (`react-native-health-connect`)**.

---

## 1. Domain Coverage & Multi-Provider Schema Mapping

All table names follow standard SparkyFitness conventions: `snake_case` column names, `UUID` primary keys (`gen_random_uuid()`), user ownership foreign keys (`user_id REFERENCES "user"(id)`), timestamps (`TIMESTAMP WITH TIME ZONE`), and strict Row-Level Security (RLS).

| Health / Workout Domain | Payload Sources | Target SparkyFitness Table | Action |
|---|---|---|---|
| **Logged Workouts & Exercises** | Garmin Activities, FIT Files, Apple `HKWorkout`, Health Connect `ExerciseSessionRecord` | `exercise_entries` | **Enhance `exercise_entries`** with 20 telemetry columns |
| **Workout Resistance Sets** | Garmin Sets, Apple `WorkoutActivity`, Health Connect `ExerciseSegment` (strength) | `exercise_entry_sets` | **Existing Table** |
| **Workout Laps & Splits** | FIT Laps, Garmin Laps, Apple `lap` events, Health Connect `laps` | `exercise_entry_laps` | **New Table** |
| **Workout GPS Track & Telemetry** | FIT Trackpoints, Garmin GPS, Apple `HKWorkoutRoute`, Health Connect `ExerciseRoute` | `exercise_entry_route_points` | **New Table** |
| **Body Weight & Composition** | Garmin Scale, Apple `BodyMass`, `BodyFatPercentage`, Health Connect `WeightRecord` | `check_in_measurements` | **Enhance `check_in_measurements`** with 4 smart scale columns |
| **Sleep & Sleep Stages** | Garmin Sleep, Apple `SleepAnalysis`, Health Connect `SleepSessionRecord` | `sleep_entries` & `sleep_entry_stages` | **Existing Tables** |
| **Menstrual & Cycle** | Garmin Menstrual, Apple `Menstruation`, Health Connect `MenstruationPeriodRecord` | `cycle_daily_entries` | **Existing Table** |
| **Water Intake** | Garmin Hydration, Apple `DietaryWater`, Health Connect `HydrationRecord` | `water_intake_entries` | **Existing Table** |
| **Mood & Stress State** | Garmin Stress mapped to Mood, Apple `HKStateOfMind` | `mood_entries` | **Existing Table** |
| **Intraday Heart Rate** | Garmin Intraday HR, Apple `HeartRate`, Health Connect `HeartRateRecord` | `heart_rate_entries` | **New Table** |
| **Intraday HRV** | Garmin HRV rMSSD, Apple `HeartRateVariabilitySDNN`, Health Connect `HeartRateVariabilityRmssdRecord` | `hrv_entries` | **New Table** |
| **Intraday Respiration** | Garmin Respiration, Apple `RespiratoryRate`, Health Connect `RespiratoryRateRecord` | `respiration_entries` | **New Table** |
| **Intraday SpO2 (Pulse Ox)** | Garmin SpO2, Apple `OxygenSaturation`, Health Connect `OxygenSaturationRecord` | `spo2_entries` | **New Table** |
| **Vitals (BP, Blood Glucose, Temp)** | Apple `BloodPressure`, `BloodGlucose`, Health Connect `BloodPressureRecord` | `vitals_entries` | **New Table** |
| **Daily Activity, Recovery & Scores** | Garmin Daily Summary (steps, calories, floors, Body Battery, stress, recovery time, VO2 Max), Apple Daily Summary, Health Connect Readiness | `daily_health_metrics` | **New Table** |

---

## 2. Separation of Concerns Analysis: `check_in_measurements` vs `daily_health_metrics`

1. **Manual User Check-In vs. Automated Wearable Sync**:
   - `check_in_measurements` represents a **user-initiated daily check-in event** (morning scale weight, tape measurements for `neck`, `waist`, `hips`, check-in photos).
   - Wearable sync (Garmin, Apple Watch, Health Connect) is an **automated continuous background sync** generating metrics like Body Battery, ACWR workload ratio, stress score, and recovery hours.
2. **Multi-Provider & Multi-Device Support**:
   - A user may wear a **Garmin Forerunner** during workouts and an **Apple Watch** or **Oura Ring** all day.
   - `check_in_measurements` is constrained to **1 row per day**. Overwriting a user's manual check-in with automated sync data—or overwriting Garmin Body Battery with Apple Watch data—causes data loss.
   - `daily_health_metrics` explicitly supports multiple provider sources per day via `UNIQUE (user_id, entry_date, source_provider)`.

---

## 3. Complete DDL Database Schema Specification

```sql
-- Migration File: SparkyFitnessServer/db/migrations/20260730000000_create_generic_health_and_workout_tables.sql

-- 1. Enhancing exercise_entries with workout, running dynamics & FIT telemetry
ALTER TABLE exercise_entries
ADD COLUMN IF NOT EXISTS max_heart_rate INTEGER,
ADD COLUMN IF NOT EXISTS heart_rate_recovery_1min INTEGER,
ADD COLUMN IF NOT EXISTS avg_speed_mps NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS max_speed_mps NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS avg_cadence INTEGER,
ADD COLUMN IF NOT EXISTS max_cadence INTEGER,
ADD COLUMN IF NOT EXISTS avg_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS max_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS normalized_power_watts NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS tss_score NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS intensity_factor NUMERIC(4, 3),
ADD COLUMN IF NOT EXISTS ground_contact_time_ms NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS vertical_oscillation_mm NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS stride_length_cm NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS avg_temperature_celsius NUMERIC(4, 1),
ADD COLUMN IF NOT EXISTS max_temperature_celsius NUMERIC(4, 1),
ADD COLUMN IF NOT EXISTS elevation_gain_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS elevation_loss_meters NUMERIC(7, 2),
ADD COLUMN IF NOT EXISTS floors_climbed INTEGER,
ADD COLUMN IF NOT EXISTS stroke_count INTEGER,
ADD COLUMN IF NOT EXISTS training_load NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS aerobic_training_effect NUMERIC(3, 1),
ADD COLUMN IF NOT EXISTS anaerobic_training_effect NUMERIC(3, 1),
ADD COLUMN IF NOT EXISTS vo2_max_estimate NUMERIC(4, 1);

-- 2. Enhancing check_in_measurements with Smart Scale Composition
ALTER TABLE check_in_measurements
ADD COLUMN IF NOT EXISTS muscle_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bone_mass_kg NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS body_water_percentage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS bmi NUMERIC(4, 1);

-- 3. exercise_entry_laps (Workout splits)
CREATE TABLE exercise_entry_laps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    lap_index INTEGER NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER NOT NULL,
    distance_meters NUMERIC(10, 2),
    calories NUMERIC(8, 2),
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    avg_speed_mps NUMERIC(6, 2),
    max_speed_mps NUMERIC(6, 2),
    avg_cadence INTEGER,
    avg_power_watts NUMERIC(6, 2),
    elevation_gain_meters NUMERIC(7, 2),
    elevation_loss_meters NUMERIC(7, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_exercise_entry_laps_entry_id ON exercise_entry_laps(exercise_entry_id, lap_index);

-- 4. exercise_entry_gps_points (Workout GPS trackpoints & telemetry)
CREATE TABLE exercise_entry_gps_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    altitude_meters NUMERIC(7, 2),
    speed_mps NUMERIC(6, 2),
    heart_rate_bpm INTEGER,
    cadence INTEGER,
    power_watts NUMERIC(6, 2),
    ground_contact_time_ms NUMERIC(5, 1),
    vertical_oscillation_mm NUMERIC(5, 1),
    stride_length_cm NUMERIC(5, 1),
    temperature_celsius NUMERIC(4, 1),
    distance_meters NUMERIC(10, 2),
    horizontal_accuracy_meters NUMERIC(6, 2),
    vertical_accuracy_meters NUMERIC(6, 2),
    course_degrees NUMERIC(5, 2)
);

CREATE INDEX idx_exercise_entry_route_time ON exercise_entry_route_points(exercise_entry_id, timestamp ASC);

-- 5. heart_rate_entries (Intraday continuous heart rate)
CREATE TABLE heart_rate_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    heart_rate_bpm INTEGER NOT NULL,
    context TEXT DEFAULT 'unspecified',
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_heart_rate_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX idx_heart_rate_user_timestamp ON heart_rate_entries(user_id, timestamp DESC);

-- 6. hrv_entries (Intraday & overnight HRV)
CREATE TABLE hrv_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    hrv_rmssd_ms NUMERIC(6, 2),
    hrv_sdnn_ms NUMERIC(6, 2),
    status TEXT,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_hrv_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX idx_hrv_user_timestamp ON hrv_entries(user_id, timestamp DESC);

-- 7. respiration_entries (Intraday breathing rate)
CREATE TABLE respiration_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    breaths_per_minute NUMERIC(5, 2) NOT NULL,
    context TEXT DEFAULT 'unspecified',
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_respiration_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX idx_respiration_user_time ON respiration_entries(user_id, timestamp DESC);

-- 8. spo2_entries (Pulse ox SpO2 %)
CREATE TABLE spo2_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    spo2_percentage NUMERIC(5, 2) NOT NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_spo2_entry UNIQUE (user_id, source_provider, timestamp)
);

CREATE INDEX idx_spo2_user_time ON spo2_entries(user_id, timestamp DESC);

-- 9. vitals_entries (Blood pressure, blood glucose, temperature)
CREATE TABLE vitals_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    systolic_mmhg NUMERIC(5, 1),
    diastolic_mmhg NUMERIC(5, 1),
    blood_glucose_mgdl NUMERIC(5, 1),
    body_temperature_celsius NUMERIC(4, 2),
    meal_context TEXT,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    external_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vitals_user_time ON vitals_entries(user_id, timestamp DESC);

-- 10. daily_health_metrics (Automated wearable daily summaries & scores)
CREATE TABLE daily_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    source_provider TEXT NOT NULL,
    device_name TEXT,
    total_steps INTEGER,
    step_goal INTEGER,
    total_distance_meters NUMERIC(10, 2),
    floors_ascended INTEGER,
    floors_descended INTEGER,
    active_calories NUMERIC(8, 2),
    bmr_calories NUMERIC(8, 2),
    total_calories NUMERIC(8, 2),
    highly_active_seconds INTEGER,
    active_seconds INTEGER,
    sedentary_seconds INTEGER,
    moderate_intensity_minutes INTEGER,
    vigorous_intensity_minutes INTEGER,
    exercise_minutes INTEGER,
    stand_hours INTEGER,
    resting_heart_rate INTEGER,
    heart_rate_recovery_1min INTEGER,
    vo2_max NUMERIC(4, 1),
    fitness_age NUMERIC(4, 1),
    lactate_threshold_bpm INTEGER,
    lactate_threshold_speed_mps NUMERIC(6, 2),
    walking_asymmetry_percentage NUMERIC(5, 2),
    hill_score INTEGER,
    race_prediction_5k_seconds INTEGER,
    race_prediction_10k_seconds INTEGER,
    race_prediction_half_marathon_seconds INTEGER,
    race_prediction_marathon_seconds INTEGER,
    recovery_time_hours INTEGER,
    training_readiness_score INTEGER,
    endurance_score INTEGER,
    weekly_training_load NUMERIC(7, 2),
    acute_training_load NUMERIC(7, 2),
    chronic_training_load NUMERIC(7, 2),
    acwr_ratio NUMERIC(4, 2),
    avg_stress_level INTEGER,
    max_stress_level INTEGER,
    body_battery_charged INTEGER,
    body_battery_drained INTEGER,
    body_battery_highest INTEGER,
    body_battery_lowest INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_daily_health_metrics UNIQUE (user_id, entry_date, source_provider)
);

CREATE INDEX idx_daily_health_metrics_user_date ON daily_health_metrics(user_id, entry_date DESC);
```

---

## 4. Shared Zod Schemas & Strict Typing Rules

- **Location**: `shared/src/schemas/database/`
- **Files to Create/Update**:
  - `ExerciseEntries.zod.ts` (updated)
  - `CheckInMeasurements.zod.ts` (updated)
  - `ExerciseEntryLaps.zod.ts` (new)
  - `ExerciseEntryRoutePoints.zod.ts` (new)
  - `HeartRateEntries.zod.ts` (new)
  - `HrvEntries.zod.ts` (new)
  - `RespirationEntries.zod.ts` (new)
  - `Spo2Entries.zod.ts` (new)
  - `VitalsEntries.zod.ts` (new)
  - `DailyHealthMetrics.zod.ts` (new)
- **Constraint**: **Zero `any` TypeScript types**. All schemas must define explicit Zod types and infer types for initializer and mutator payloads.

---

## 5. Definition of Done for Phase 1

1. Create migration file `20260730000000_create_generic_health_and_workout_tables.sql` in `SparkyFitnessServer/db/migrations/`.
2. Update RLS policies in `SparkyFitnessServer/db/rls_policies.sql`.
3. Restart server (`pnpm start` from `SparkyFitnessServer/`) to apply the migration.
4. Run `./db_backup.sh` from repo root to update `db_schema_backup.sql`.
5. Run `pnpm run validate` in `shared/` to verify zero TypeScript lint errors.
