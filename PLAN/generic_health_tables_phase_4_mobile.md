# Generic Health & Workout Architecture — Phase 4 Plan: Mobile App HealthKit & Health Connect Integrations

This document contains the detailed technical specification for **Phase 4** of the generic health and workout data storage architecture.

---

## 1. Phase 4 Scope & Deliverables

1. **Apple HealthKit Sync Adapter (`SparkyFitnessMobile/src/services/healthKitSyncService.ts`)**:
   - Package: `@kingstinct/react-native-healthkit`
   - Actions:
     - Query `HKWorkout` samples and write into `exercise_entries` (with expanded telemetry fields).
     - Query `HKWorkoutEvent` (laps) and write into `exercise_entry_laps`.
     - Query `HKWorkoutRoute` locations and write into `exercise_entry_route_points`.
     - Query continuous `HKQuantityTypeIdentifierHeartRate`, `HeartRateVariabilitySDNN`, `RespiratoryRate`, `OxygenSaturation`, and `BloodPressure` samples and write into `heart_rate_entries`, `hrv_entries`, `respiration_entries`, `spo2_entries`, and `vitals_entries`.
     - Query daily activity rings (move time, exercise time, stand hours, resting HR, VO2 Max) and write into `check_in_measurements`.

2. **Google Health Connect Sync Adapter (`SparkyFitnessMobile/src/services/healthConnectSyncService.ts`)**:
   - Package: `react-native-health-connect`
   - Actions:
     - Query `ExerciseSessionRecord` (with laps and exerciseRoute) and write into `exercise_entries`, `exercise_entry_laps`, and `exercise_entry_route_points`.
     - Query `HeartRateRecord`, `HeartRateVariabilityRmssdRecord`, `RespiratoryRateRecord`, `OxygenSaturationRecord`, `BloodPressureRecord`, `BloodGlucoseRecord`, and `BodyTemperatureRecord` and write into `heart_rate_entries`, `hrv_entries`, `respiration_entries`, `spo2_entries`, and `vitals_entries`.
     - Query `StepsRecord`, `DistanceRecord`, `FloorsClimbedRecord`, `Vo2MaxRecord`, and `RestingHeartRateRecord` and write into `check_in_measurements`.

3. **Background Sync & Anchor Storage**:
   - Store HealthKit anchors (`newAnchor`) and Health Connect page tokens for incremental sync without duplicate inserts.
   - Use `device_name` metadata (`Apple Watch Series 9`, `Pixel Watch 2`) and `external_id` for deduplication.

---

## 2. Verification & Validation Steps

1. Run mobile validation: `pnpm run validate` inside `SparkyFitnessMobile/`.
2. Run mobile tests: `pnpm run test:run -- --watchman=false --runInBand`.
3. Verify end-to-end sync on iOS Simulator / Physical iPhone and Android Emulator.
