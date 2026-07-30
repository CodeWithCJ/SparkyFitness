# Generic Health & Workout Architecture — Phase 3 Plan: Web Frontend Visualizations & Dashboards

This document contains the detailed technical specification for **Phase 3** of the generic health and workout data storage architecture.

---

## 1. Phase 3 Scope & Deliverables

1. **Workout Detail Views (`SparkyFitnessFrontend/src/`)**:
   - **Lap Splits Table**: Render lap split table (lap index, duration, distance, pace, avg HR, max HR, power) fetched from `/api/exercise-entries/:id/laps`.
   - **Interactive GPS Route Map**: Render interactive polyline route map using Leaflet/Mapbox/OpenStreetMap from `/api/exercise-entries/:id/route-points`.
   - **Workout Telemetry Graphs**: HR, speed, elevation, and power graphs over time during workouts.

2. **Daily Recovery & Readiness Dashboard**:
   - **Body Battery & Stress Cards**: Display Garmin Body Battery charge/drain and stress levels fetched from `check_in_measurements`.
   - **Cardio & Readiness**: Display Resting HR, VO2 Max, Recovery Time, and Training Readiness scores fetched from `/api/check-in-measurements`.
   - **Intraday Heart Rate & HRV Charts**: Render 24-hour continuous heart rate line chart and overnight HRV trend chart.

3. **Report Visualization Refactoring**:
   - Refactor existing reporting components to fetch structured relational endpoints directly instead of parsing raw `exercise_entry_activity_details.detail_data` JSON paths.

---

## 2. Component Specifications

- **`WorkoutLapsTable.tsx`**: Renders lap splits for a workout session with unit conversions (km/miles, min/km pace).
- **`WorkoutRouteMap.tsx`**: Render GPS trackpoints on an interactive map.
- **`DailyRecoveryCard.tsx`**: Visual card for Body Battery, Stress, Recovery Time, and Readiness scores sourced from `check_in_measurements`.
- **`IntradayHeartRateChart.tsx`**: Continuous 24-hour HR time-series chart.

---

## 3. Verification & Validation Steps

1. Run frontend validation: `pnpm run validate` inside `SparkyFitnessFrontend/`.
2. Verify UI responsiveness and chart rendering across desktop and mobile browsers.
