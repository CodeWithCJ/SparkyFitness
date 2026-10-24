# AGENTS.md

_Last updated: 2026-10-24_

`@workspace/shared` is a source-first TypeScript workspace library package for schemas, constants, and timezone/day helpers consumed by SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile.

## Scope

- This package defines contracts and shared logic, not an app.
- Validate changes from consuming packages (server, frontend, mobile), not in isolation.
- Every schema change here potentially touches three packages.

## Food Assistant State

`schemas/api/FoodAssistant.api.zod.ts` and `schemas/database/FoodAssistant.zod.ts` define lasting preferences, versioned tasks, unresolved ingredients and idempotent operation records. All state is owner-only; these additive contracts do not change existing chat clients.

## Structure

- Barcode search: `schemas/api/FoodLookup.api.zod.ts` and `BarcodeLookup.api.zod.ts` define normalized foods and source comparison results. `utils/barcodeNutrition.ts` supplies one comparison basis for web and mobile.

- `src/schemas/database/` - one Zod file per table (`Foods.zod.ts`, `Exercises.zod.ts`, ~115 files). Agent shortcut: to learn a table shape, read the matching file here instead of the SQL dump.
- `src/schemas/api/` - API request/response contracts (`*api.zod.ts`). `VoiceTranscription.api.zod.ts` defines multipart limits/MIME types, transcription responses, voice preference patches, and compatible public service options shared by web/mobile/server.
- `src/constants/` - shared constants and enums (exercises, nutrients, meal types, fasting protocols, medication schedules, cycle phases, etc.).
- `src/utils/` - timezone helpers (`todayInZone`, `instantToDay`, `instantForDay`, `dayToUtcRange`, `compareDays`, `addDays`, `isDayString`), cycle/menstruation helpers, unit/calculation utilities, the race plan generator (`racePlan.ts`, `buildRacePlan`), the run program schedule helpers (`runProgramSchedule.ts`, `runProgramCatchUp.ts`, `runProgramTimeline.ts`: `buildProgramTimeline` / `itemsByDay`, and `runProgramActions.ts`: the `PUT /api/v2/run-program` body builders; web and mobile both use them), and the training pace zones (`racePaceZones.ts`: `racePaceZones` turns a recent race result into easy, interval, tempo, marathon-pace and stride ranges with Riegel's formula; `equivalent5kPace` is the shared 5K conversion; `paceZones.ts` holds the effort-based `paceZones`, `thresholdPaceFromEffort` and `PACE_ZONE_IDS`), and the plan realigner (`runProgramRealign.ts` (`realignProgram` rebuilds the rest of a plan to end on the goal day: drops repeats and the shortest easy runs first, folds lighter weeks, never touches the taper or final workout, keeps two runs a week for three-plus run days, stretches with repeated base weeks when there is room, eases after a long gap, and reports an unrealistic goal with the options; `applyRealign` is the confirmed change, `toRealignResult` the API shape); its contract is in `RunProgram.api.zod.ts`: `realignRunProgramBodySchema`, `runProgramRealignResultSchema`).
- `src/utils/heartRateZones.ts` - the single source of truth for heart rate zones: `resolveMaxHr` (own value, else Nes from date of birth, else observed max, else 190), `resolveHeartRateZones` (three methods: `percent_max`, `heart_rate_reserve` (Karvonen, needs resting HR) and `custom` floors; falls back to percent of max when the chosen method lacks input and says so in `effectiveMethod`), `heartRateZoneRange(resolved, zone)` (bpm range of zone 1-5; the top zone ends at max HR - the function for training programs that need "zone N in bpm"), `computeTimeInZones` (buckets a heart rate series), `percentMaxFloors` / `heartRateReserveFloors`, `floorsFromAppleHeartRateZones` (five custom floors from Apple's preferred zones; null unless there are exactly five, and a missing zone-1 minimum becomes 30 bpm), `bucketsFromAppleWorkoutZones` (a finished workout's five zone durations, keeping time below the first boundary as zone 1; empty when Apple reported no time, null when the group is not five ascending zones). `trainingLoad.ts` weights sessions by these zones. The API contract is `src/schemas/api/HeartRateZones.api.zod.ts`.
- `src/nutrients/` - nutrient catalogs and the goal calculator used by web onboarding, the web Goals editor and mobile Goals (`nutrientCalculation.ts`: per-nutrient recommended values from age, sex, weight, calories and the saved algorithm choices; `nutrientAlgorithms.ts`: the algorithm enums and labels).
- `src/ai/`, `src/cycle/`, `src/medications/`, `src/mood/` - domain-specific helpers. `src/medications/adherence.ts` is the one implementation of medication adherence for web and mobile (`computeAdherence`, `computeChecklistProgress`, `entryMatchesDue`, and the month-calendar helpers `tallyEntriesByDay`, `dayLogStatus`, `tallySymptomsByDay`); `subtype.ts` holds the All | Meds | Supplements filter rules. Both are pure, take timezone and data as arguments, and are tested in `SparkyFitnessServer/tests/medicationAdherence.test.ts` and `medicationSubtype.test.ts`.
- `src/types/` - shared plain TypeScript types that are not Zod-derived.
- Routes: `src/schemas/api/Route.api.zod.ts` (points, turn cues, bodies), `src/utils/routeGeometry.ts` (distance, climb, simplify, bounds, and the `localProjector` / `distanceToSegment` nearest-point helpers the route editor uses), `src/utils/routeGpx.ts` (dependency-free GPX read/write), `src/utils/routeGenerate.ts` (generate and follow-roads request builders, error kinds, turn counts) and `src/constants/routingProviderTypes.ts` (the `valhalla` external provider type and its default public server URL).
- Routes: `src/schemas/api/Route.api.zod.ts` (points, turn cues, bodies), `src/utils/routeGeometry.ts` (distance, climb, simplify, bounds) and `src/utils/routeGpx.ts` (dependency-free GPX read/write).
- `src/compare/` - compare any two tracked things: `stats.ts` (statistics), `metrics.ts` (metric catalog: kind, missing-day rule, weekly form, and `rolling` for a value read over the 7 days ending on the day), `analyze.ts` (day and week-by-week analysis), `since.ts` (before vs. since a habit started: suggested start, stretches, regularity, pre-trend; its limits are exported as `SINCE_*` constants), `question.ts` (the question model web and mobile share: timing choices, spans and `compareWindow`, custom-range limits, since-start bounds, `SUGGESTED_QUESTIONS`, and the recents helpers `knownCompareQuestions` / `withRecentQuestion`), `chartData.ts` (chart data both apps draw: `pairedDots` and `displayDots`, `trendLine`, `overTimeData`, `sinceChartData`). The API contract is `src/schemas/api/Compare.api.zod.ts`.
- `src/symptoms/` - generic symptom tracking: constants and enums (scales, templates, sections, option kinds), template section resolution (`resolveSections`), built-in symptoms and pick-lists, head/body region ids for the location maps, and custom-field validation. The API contract is `src/schemas/api/Symptoms.api.zod.ts`.

## Naming Convention

- `X.api.zod.ts` = API request/response schema
- `X.zod.ts` = database table schema
- Export everything from `src/index.ts`; consuming packages import both types and values via `@workspace/shared`

## Cross-Package Contract Rules

- Changes to `src/schemas/api/` usually affect server routes and both frontend/mobile API clients.
- Changes to `src/schemas/database/` require matching server migrations and RLS policies when changing the stored schema. CI regenerates the schema backup after merge; never hand-edit or regenerate it locally. Mirroring existing columns missing from a Zod schema does not require another migration.
- Timezone/day-string helpers prevent bugs; prefer them over `toISOString().split('T')[0]`.
- Verified commands (run from `shared/`): `pnpm run typecheck`, `pnpm run format:check`, `pnpm run format`, `pnpm run i18n:audit`, `pnpm run validate` (typecheck + i18n audit + format check). The package has no lint or tests of its own; behavior is covered by the consumers' test suites.
- Shared exports ids and data; apps own translation. `pnpm run i18n:audit` (`scripts/audit-user-facing-strings.mjs`) fails when a file gains more prose in `label`/`title`/`description`/`message`/`hint`/`summary`/`body`/`text` properties than `scripts/user-facing-strings.baseline.json` allows (the cycle, GLP-1, and body-region English catalogs are grandfathered). After moving text out, run it with `--update-baseline` to lower the allowance; use `// i18n-ignore` for literals that must stay.
- Formatting uses the same `.prettierrc` as the other packages, and lint-staged formats staged `shared/` files on commit.
- CI (`.github/workflows/ci-tests.yml`) runs `Shared Validate` and re-runs the frontend, mobile, and server jobs on any `shared/**` change.
- Test any shared change from the consumer packages (`pnpm run validate` in SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile after modifying shared).

## Working Rules

- Keep this package export-focused and schema-focused; logic that scales should live in consuming packages.
- Never export stale or unfinished types; if a consumer is drafting code and needs a type not yet here, add it.
