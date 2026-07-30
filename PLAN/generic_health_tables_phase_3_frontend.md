# Generic Health & Workout Architecture — Phase 3 Plan: Web Frontend Visualizations & Dashboards

This document contains the detailed technical specification for **Phase 3** of the generic health and workout data storage architecture.

---

## 1. Phase 3 Scope & Deliverables

1. **Workout Detail Views (`SparkyFitnessFrontend/src/`)**:
   - **Lap Splits Table**: Render lap split table (lap index, duration, distance, pace, avg HR, max HR, power) fetched from `/api/exercise-entries/:id/laps` (`exercise_entry_laps`).
   - **Interactive GPS Route Map**: Render interactive polyline route map using OpenStreetMap from `/api/exercise-entries/:id/route-points` (`exercise_entry_gps_points`).
   - **Workout Telemetry Graphs**: HR, speed, elevation, and cadence graphs over time during workouts generated directly from `exercise_entry_gps_points`.

2. **Daily Recovery & Readiness Dashboard**:
   - **Body Battery & Stress Cards**: Display Garmin Body Battery charge/drain and stress levels fetched from `/api/daily-health-metrics` (`daily_health_metrics`).
   - **Cardio & Readiness**: Display Resting HR, VO2 Max, Recovery Time, and Training Readiness scores fetched from `/api/daily-health-metrics`.
   - **Intraday Heart Rate & HRV Charts**: Render 24-hour continuous heart rate line chart (`heart_rate_entries`) and overnight HRV trend chart (`hrv_entries`).

3. **Report Visualization Refactoring (Relational Migration)**:
   - Reporting components (`ActivityReportVisualizer.tsx`, `readActivityStats`) fetch structured relational endpoints (`/api/exercise-entries/:id`, `/api/exercise-entries/:id/laps`, `/api/exercise-entries/:id/route-points`, `/api/daily-health-metrics`) directly.
   - Legacy raw JSON (`exercise_entry_activity_details.detail_data`) is no longer mandatory; removing JSON rows does not impact UI rendering, stat cards, lap split tables, or GPS maps.

---

## 2. Component Specifications

- **`ActivityReportVisualizer.tsx`**: Renders activity header, stats cards, lap splits, GPS track map, and telemetry charts. Primary source is `useExerciseEntryById`, `useWorkoutGpsPoints`, and `useWorkoutLaps`.
- **`activityReportUtil.ts`**: Contains `readActivityStatsFromRelational` and `readActivityStats` to parse summary metrics from relational `ExerciseEntries` rows and fall back gracefully.
- **`ActivityReportLapTable.tsx`**: Renders lap splits for a workout session with unit conversions (km/miles, min/km pace).
- **`ActivityReportMap.tsx`**: Render GPS trackpoints on an interactive map.
- **`BodyBatteryCard.tsx`**: Visual card for Body Battery charge, drain, highest, and lowest scores sourced from `daily_health_metrics`.
- **`StressChart.tsx`**: Continuous stress tracking chart sourced from `daily_health_metrics`.

---

## 3. Verification & Validation Steps

1. Run frontend validation: `pnpm run validate` inside `SparkyFitnessFrontend/`.
2. Verify UI responsiveness and chart rendering across desktop and mobile browsers.
