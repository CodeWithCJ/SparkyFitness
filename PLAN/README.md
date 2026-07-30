# Unified Generic Health & Workout Architecture Plan (Index)

> **Master Reference Index for AI Agents & Developers**  
> *Last updated: July 2026*  
> This directory contains the complete technical architecture plans for unifying health, workout, and wearable telemetry streams across **Garmin Connect**, **Garmin/Wahoo/ANT+ FIT binary files**, **Apple HealthKit**, and **Google Health Connect** into SparkyFitness.

---

## Plan Directory Structure

- 📄 **[generic_health_tables_phase_1_database.md](generic_health_tables_phase_1_database.md)**
  - **Phase 1: Database Migration, RLS Security & Shared Schemas**
  - Contains complete domain mapping table, separation of concerns analysis, exact SQL migration queries (`20260730000000_create_generic_health_and_workout_tables.sql`), Row-Level Security policy updates (`rls_policies.sql`), database backup sync steps (`./db_backup.sh`), and the 10 shared Zod schema specifications in `shared/src/schemas/database/` with strict zero `any` TypeScript rules.

- 📄 **[generic_health_tables_phase_2_server.md](generic_health_tables_phase_2_server.md)**
  - **Phase 2: Server Models, Garmin Sync & API Routes**
  - Specifies the 8 server repositories (`SparkyFitnessServer/models/`), Garmin microservice sync adapters (`routes.py` & `garminSyncService.ts`), and REST API endpoints for daily health metrics, intraday heart rate, HRV trends, vitals, lap splits, and GPS route breadcrumbs.

- 📄 **[generic_health_tables_phase_3_frontend.md](generic_health_tables_phase_3_frontend.md)**
  - **Phase 3: Web Frontend Visualization & Dashboards**
  - Details the web UI components (`SparkyFitnessFrontend/src/`) for interactive workout lap tables, GPS route polyline maps, Body Battery & Stress cards, and 24-hour continuous HR & HRV charts.

- 📄 **[generic_health_tables_phase_4_mobile.md](generic_health_tables_phase_4_mobile.md)**
  - **Phase 4: Mobile App Apple HealthKit & Google Health Connect Integrations**
  - Specifies the sync adapters in `SparkyFitnessMobile/src/services/` for `@kingstinct/react-native-healthkit` and `react-native-health-connect`, handling background anchor caching and device origin metadata (`device_name`, `external_id`).

---

## Core System Architecture Principles

1. **Table Reuse**:
   - `exercise_entries` is enhanced as the master workout log for all sports (running, cycling, swimming, strength, hiking, diving, etc.).
   - `exercise_entry_laps` (Lap split intervals with `entry_date`)
   - `exercise_entry_gps_points` (GPS trackpoints & telemetry with `entry_date`)
   - `check_in_measurements` is enhanced as the master body scale log.
2. **Separation of Concerns**:
   - `check_in_measurements` handles manual user check-in measurements (`weight`, `body_fat_percentage`, `neck`, `waist`, `hips`, `muscle_mass_kg`).
   - `daily_health_metrics` handles automated background wearable streams (`steps`, `active_calories`, `resting_heart_rate`, `vo2_max`, `training_readiness_score`, `recovery_time_hours`, `avg_stress_level`, `body_battery_charged`, `body_battery_drained`, `acwr_ratio`).
3. **Multi-Provider Safety**:
   - `daily_health_metrics` uses `UNIQUE (user_id, entry_date, source_provider)` so a user can sync both Garmin and Apple Health data without collisions.
4. **Strict Typing Constraint**:
   - **Zero `any` TypeScript types**. All code must use explicit Zod inferred types or TypeScript interfaces exported from `@workspace/shared`.
