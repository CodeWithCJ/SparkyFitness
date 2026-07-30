# Generic Health & Workout Architecture — Phase 2 Plan: Server Models, Garmin Sync & API Routes

This document contains the detailed technical specification for **Phase 2** of the generic health and workout data storage architecture.

---

## 1. Phase 2 Scope & Deliverables

1. **Server Models & Repositories (`SparkyFitnessServer/models/`)**:
   - `exerciseEntryLapsRepository.ts`
   - `exerciseEntryRoutePointsRepository.ts`
   - `heartRateEntriesRepository.ts`
   - `hrvEntriesRepository.ts`
   - `respirationEntriesRepository.ts`
   - `spo2EntriesRepository.ts`
   - `vitalsEntriesRepository.ts`
   - Update `checkInMeasurementsRepository.ts` and `exerciseEntry.ts` repositories to handle the expanded daily health, readiness, and telemetry columns.

2. **Garmin Sync Service Integration**:
   - `SparkyFitnessGarmin/routes.py`: Update Python responses to output structured objects for activity laps, trackpoints, intraday HR/HRV, and daily metrics.
   - `SparkyFitnessServer/services/garminSyncService.ts`: Parse Garmin sync responses and write into `check_in_measurements`, `exercise_entries`, `exercise_entry_laps`, `exercise_entry_route_points`, `heart_rate_entries`, `hrv_entries`, `respiration_entries`, `spo2_entries`, and `vitals_entries`.

3. **Server API Routes (`SparkyFitnessServer/routes/`)**:
   - `GET /api/check-in-measurements`: Query daily recovery, readiness, body composition, and movement metrics by date range.
   - `GET /api/health/heart-rate`: Query intraday HR time-series.
   - `GET /api/health/hrv`: Query HRV trends & daily status.
   - `GET /api/health/vitals`: Query blood pressure, blood glucose, and temperature logs.
   - `GET /api/exercise-entries/:id/laps`: Query lap splits for a workout.
   - `GET /api/exercise-entries/:id/route-points`: Query GPS route breadcrumbs for a workout.

4. **Strict Typing Constraint**:
   - **Zero `any` TypeScript types**. Explicit Zod definitions and inferred types imported from `@workspace/shared`.

---

## 2. Server Repository Specifications

- **`checkInMeasurementsRepository.ts`**:
  - `upsertCheckInMeasurements(data: CheckInMeasurementsMutator): Promise<CheckInMeasurements>`
  - `getCheckInMeasurements(userId: string, startDate: string, endDate: string): Promise<CheckInMeasurements[]>`

- **`heartRateEntriesRepository.ts`**:
  - `batchInsertHeartRateEntries(entries: HeartRateEntriesInitializer[]): Promise<void>`
  - `getHeartRateEntries(userId: string, startDate: string, endDate: string): Promise<HeartRateEntries[]>`

- **`hrvEntriesRepository.ts`**:
  - `batchInsertHrvEntries(entries: HrvEntriesInitializer[]): Promise<void>`
  - `getHrvEntries(userId: string, startDate: string, endDate: string): Promise<HrvEntries[]>`

- **`exerciseEntryLapsRepository.ts`**:
  - `batchInsertLaps(laps: ExerciseEntryLapsInitializer[]): Promise<void>`
  - `getLapsByExerciseEntryId(exerciseEntryId: string): Promise<ExerciseEntryLaps[]>`

- **`exerciseEntryRoutePointsRepository.ts`**:
  - `batchInsertRoutePoints(points: ExerciseEntryRoutePointsInitializer[]): Promise<void>`
  - `getRoutePointsByExerciseEntryId(exerciseEntryId: string): Promise<ExerciseEntryRoutePoints[]>`

---

## 3. Verification & Validation Steps

1. Run server tests: `pnpm test` in `SparkyFitnessServer/`.
2. Trigger Garmin Sync and verify rows are inserted into `check_in_measurements`, `heart_rate_entries`, `hrv_entries`, `exercise_entry_laps`, and `exercise_entry_route_points`.
