# Offline (#1983)

Everything the app keeps for use without a connection lives in `src/offline/`. User guide: `docs/src/features/exercises/offline-workouts.md`. Design notes and decisions: `WIP/offline/` (git-ignored, maintainer's copy).

## Storage

- One SQLite file, `sparky-offline.db` (`expo-sqlite`), opened by `getOfflineDb()` (`db.ts`). Tables in `schema.ts`, versioned with `PRAGMA user_version`: add a step to `MIGRATIONS`, never edit a shipped one. Tables: `cache` (server JSON per collection and key), `outbox` (uploads), `offline_image` (saved pictures), `offline_keep` (exercises the person chose to keep pictures of).
- No table mirrors the server. A new server column needs no change here; a new module adds a `collection` name (`collections.ts`) and an outbox `kind`.
- Every row carries `server_config_id`. An account switch clears `cache` and pictures (`hooks/useAuth.ts`); waiting uploads stay, carry `user_id`, and are sent only while that same account is signed in (`syncEngine.ts`).
- Tests run the real SQL on Node's built-in SQLite through `__tests__/helpers/offlineTestDb.ts`; `jest.setup.js` makes `expo-sqlite` fail to open everywhere else. Use `__setOfflineDbForTests(db)`.

## Reading without a connection

- `withOfflineFallback({ fetch, store, read })` wraps an API client function: on success it stores the answer, on a connection failure (`serverMayBeDown`, `utils/serverErrors.ts`) it answers from `cache`, and a 4xx is never replaced. While the connection check already says the server is away it answers from the phone at once. It reports a fallback through `offline/connection.ts`, which the query client listens to so the connection is re-checked.
- Wrapped today: workout presets (list, page, search, by id), exercise search, suggested exercises, exercise by id, exercise stats, preferences, plate inventory, profile, active workout plans per day, workout feedback (empty only for a session waiting to upload). `fetchDailySummary` stores the day's own workouts for the offline Diary (`offline/diaryDay.ts`).
- `offlinePack.ts` (`refreshOfflinePack`) downloads what a workout needs, at most every 6 hours, from `useOfflineUploads` while connected; it calls the server directly, never the wrapped fetchers. `isOfflinePackReady` gates an offline start (the weight unit comes from the saved preferences).
- The Library tab offline (`components/OfflineLibrary.tsx`, used by `LibraryScreen` when the connection status is `unreachable`) lists only Workout presets and Exercises; the rest of the Library needs the server.
- `ServerGate offlineCapable` shows a screen's content under `OfflineBanner` while the server is set up but unreachable. The unreachable message offers "Start a saved workout offline".

## Writing without a connection

- The live workout stays in `activeWorkoutStore`. `pendingCreate` marks a session the server does not have yet; the first save (`useActiveWorkoutAutosave`) creates it with its phone-minted id and an update follows at once (the create's answer can be an older stored copy, so it is never adopted). `offlineBaseRevision` guards the first save after an offline stretch; a 409 whose server copy equals what this phone last sent (`sessionsEqual.ts`) is the phone's own lost-answer save, not a conflict.
- The Add workout form (`WorkoutAddScreen`) saves a past workout or an edit with no server through `queueWorkoutCreate` / `queueWorkoutUpdate` (`workoutHandOver.ts`; a second edit merges into the waiting update row); `queueAfterConnectionFailure` queues after a lost connection but never after a timeout, since the server may have processed the request.
- Finishing or discarding with no server hands the workout to the outbox (`workoutHandOver.ts`): a create, an update with the last revision seen, or a delete. The live store is cleared only after the outbox row is written.
- `outbox.ts` keeps one unconfirmed row per entity and kind. `syncEngine.ts` (`drainOutbox`) sends due rows oldest first, one run at a time, with a backoff; a row with `depends_on` waits for that row. Triggers: reconnect (`hooks/queryClient.ts`), app open and foreground (`hooks/useOfflineUploads.ts`), the background task, Upload now.
- Handlers by kind, registered in `handlers/index.ts`: `workout_session.create|update|delete` (`handlers/workoutSession.ts`), `workout_feedback.put` and `workout_preset.update` (`handlers/followUps.ts`; a saved-workout update is skipped with a message if the preset's `updated_at` changed meanwhile).
- A `reconnect` drain ignores the retry delay of waiting rows (the delay grows with attempts made while offline). Android reports a network failure as a plain `Error` ("fetch failed: ...UnknownHostException"), so `serverMayBeDown` also matches the message text. While the server is unreachable `useOfflineUploads` re-checks the connection every 30 s. One workout resumed and finished again has a create and an update row; `uploadsToShow` lists it once.
- Conflicts stop as `conflict`; the person chooses on the Offline screen (`conflicts.ts`: keep phone, keep server, keep both).
- Confirmed rows stay 7 days as a safety copy; unconfirmed rows are never deleted automatically. One reminder notification after 7 days waiting (`waitingReminder.ts`).
- Watch heart rate for a session that is not on the server yet waits (`sessionAwaitingServer.ts`, used by `useWatchWorkoutBridge`).

## Pictures

- `offlineImages.ts`: pictures of exercises the person kept (long-press in `ExercisesLibraryScreen`), this week's plan, then saved workouts, into the cache directory, Wi-Fi only unless `offlinePicturesOnMobileData`, capped at 300 MB. `resolveExerciseImageSource` prefers the saved copy through the synchronous `localImageIndex.ts`.

## Screens

- `OfflineSettingsScreen` (Settings → Offline): waiting uploads with Upload now and conflict choices, Refresh now, storage, the mobile-data switch, Clear offline data, kept exercises.
- Diary: the Exercise section from the phone while unreachable (the last `DIARY_DAYS_KEPT` = 7 days, saved by `refreshRecentDiaryDays` in each pack refresh through `GET /api/v2/exercise-entries/by-date`, since the server has no workout range route and `/history` lists future planned sessions first; a Diary load saves its day too, and a confirmed upload reloads the day, `notifyUploadsConfirmed`), and a "Waiting to upload" pill on waiting workouts (`useOfflineDiaryDay`).
- `ServerSettingsScreen` asks before switching away from or removing a server with uploads waiting (`leaveServerGuard.ts`).
