# AGENTS.md

_Last updated: 2026-10-09_

SparkyFitness Frontend is the React web app for the SparkyFitness monorepo. Use this file as the primary guide for work inside `SparkyFitnessFrontend/`.

If a task also touches the server, mobile app, or `shared/`, read that package guide before editing outside this directory. Use `../AGENTS.md` for monorepo-level context.

## Scope

- This file is for package-local work in `SparkyFitnessFrontend/`.
- `CLAUDE.md` just imports this file via `See @AGENTS.md`.
- Run scripts from this directory.

## Current Snapshot

- Stack: React 19, Vite 8, TypeScript 5, Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn/ui-style Radix primitives, TanStack Query 5, React Router 7 (`createBrowserRouter`), i18next, Better Auth client, Zod 4, Recharts.
- `@/*` maps to `src/`; `@workspace/shared` maps to `../shared/src/index.ts` (also in Jest via `moduleNameMapper`).
- Dev server runs on port `8080` and proxies `/api`, `/mcp`, and `/uploads` to the backend on `3010`; `/health-data` is proxied with an `/api` prefix rewrite. Override the backend host with `VITE_BACKEND_HOST`.
- PWA (`vite-plugin-pwa`) is enabled in production builds only.

## Verified Commands

```bash
pnpm dev
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run format
pnpm run validate
pnpm test
pnpm run test:ci
pnpm run build
```

- `pnpm run validate` runs typecheck, lint (`--max-warnings 0`), Prettier check, and Knip (`pnpm run knip` for unused files and exports) together.
- `pnpm test` runs Jest (`ts-jest`, `jsdom`); config is inline in `package.json`, setup in `src/tests/setupTests.ts`.
- `pnpm run build` runs `validate` first, then `vite build`.
- CI (`.github/workflows/ci-tests.yml`) runs `pnpm run validate` and `pnpm run test:ci` for this package when its files change; matching those locally means a green PR.

## Domain-Mirrored Layout (the most important convention)

Features are organized by domain, and the same domain folder name appears in `src/pages/`, `src/api/`, and `src/hooks/`. A feature change usually touches the matching folder in all three:

- Page domains: `Admin`, `Auth`, `Chat`, `CheckIn`, `Cycle`, `Diary`, `Errors`, `Exercises`, `Fasting`, `Foods`, `Goals`, `Integrations`, `Medications`, `Reports`, `Settings`, `Symptoms`.
- API domains add a few more: `AiConversions`, `Chatbot`, `Onboarding`, `Pregnancy`, `SleepScience`, `Symptoms`.
- Example: a Medications bug lives in `src/pages/Medications/` + `src/api/Medications/` + `src/hooks/` medication hooks. Start there, not with a repo-wide search.

## Source Map

- Shopping tasks in `src/components/ai/FoodAssistantState.tsx` show saved quantities and checked items; `src/hooks/AI/useFoodAssistantState.ts` dispatches versioned updates through `src/api/Chatbot/foodAssistantService.ts`. Meal-plan publication uses the ordinary plan and diary cache invalidation after a chat turn.

- Food assistant state: owner-only preferences, recoverable tasks and operation history use `FoodAssistant.api.zod.ts` / `FoodAssistant.zod.ts` in shared. Server: `routes/v2/foodAssistantRoutes.ts`, `services/foodAssistantService.ts`, `models/foodAssistantRepository.ts`, `ai/tools/foodAssistantTools.ts`. Recipes: `ai/tools/recipeTools.ts`, `services/foodAssistantRecipeService.ts` and `services/recipeImageService.ts` implement resumable source imports, exact provider portions, atomic publication/readback and conflict-safe undo. Web: `src/components/ai/FoodAssistantState.tsx`, `src/api/Chatbot/foodAssistantService.ts`.

- `src/main.tsx` - app bootstrap; creates the shared `QueryClient` with global `QueryCache`/`MutationCache` handlers that render toasts from query/mutation `meta` (`errorTitle`, `errorMessage`, `successMessage`).
- `src/App.tsx` - route registry via `createBrowserRouter`, plus `PrivateRoute` and `PermissionRoute` wrappers (permission-gated areas include `reports` and `admin`).
- `src/pages/<Domain>/` - route screens by domain.
- `src/api/api.ts` - `apiCall(endpoint, options)` helper: base URL `/api`, query `params`, JSON/FormData bodies, `responseType`, error toasts, `suppress404Toast`. Use it for all backend requests.
- `src/api/<Domain>/` - per-domain API clients built on `apiCall`.
- `src/hooks/<Domain>/` and `src/hooks/use*.ts(x)` - TanStack Query hooks and shared UI hooks (`use-toast`, `useDebounce`, `useAuth`, ...).
- `src/components/` - shared components; `ui/` holds the shadcn-style primitives (~37 files); domain component folders include `Foods/`, `FoodSearch/`, `FoodUnitSelector/`, `Onboarding/`, `ExerciseCharts/`, `ai/` (assistant-ui chat pieces).
- `src/contexts/` - `ActiveUserContext` (family-access acting-user switching), `PreferencesContext`, `ThemeContext`, `WaterContainerContext`, `ChatbotVisibilityContext`, `ChatToolCategoriesContext` (runtime chat tool-category selection, localStorage-backed).
- `src/layouts/` - `MainLayout.tsx` and `AddComp.tsx`.
- `src/lib/` - `auth-client.ts` (Better Auth React client), `utils.ts` (`cn`), scanner engines, sleep helpers.
- `src/services/` - pure calculation helpers (BMR, body composition, nutrient calculation), not HTTP clients.
- `src/utils/` - logging, user preferences, date helpers, misc.
- `src/tests/` - Jest suites mirroring `components`/`contexts`/`hooks`/`services`/`utils`, plus `test-utils.tsx`.
- `public/locales/<lng>/translation.json` - i18next resources, loaded over HTTP at runtime.

When searching, ignore `node_modules/`, `dist/`, and every locale except `public/locales/en/`.

## Translations (i18n)

- Only ever edit `public/locales/en/translation.json`. The other 35 locales are machine-synced through the `sync-translations.yml` workflow and a separate SparkyFitnessTranslations repo; hand-editing them creates conflicts with that pipeline.
- UI strings go through `useTranslation()` / `t('...')` keys, not hardcoded literals.
- `en/translation.json` is ~120 KB - grep for the key or section you need instead of reading the whole file.
- Developer docs: `../docs/src/developer/translations.md`.

## Conventions

- Use `apiCall` (or an existing per-domain client) for backend requests; don't hand-roll `fetch`.
- Prefer declaring toast text via React Query `meta` on the query/mutation instead of imperative `toast(...)` calls where the global handlers cover it.
- Use `src/utils/logging.ts` helpers instead of bare `console.*`; verbosity follows the user's logging-level preference.
- Keep `YYYY-MM-DD` values as calendar-day strings; use the shared timezone/day helpers from `@workspace/shared` instead of `toISOString().split('T')[0]`.
- To learn a database table's shape, read `../shared/src/schemas/database/<Table>.zod.ts` - do not read `../db_schema_backup.sql` or the migrations.
- Auth flows go through `src/lib/auth-client.ts` and `useAuth`; acting-user (family access) state lives in `ActiveUserContext` and affects most data hooks.
- New UI should reuse `src/components/ui/` primitives and existing shared components before adding new ones.
- **Cache Invalidation on Library Mutations:** When mutating foods, exercises, presets, or plans, use the domain invalidation hooks from `src/hooks/useInvalidateKeys.ts` (`useExerciseInvalidation`, `useFoodInvalidation`, `useMealInvalidation`, `useDiaryInvalidation`) to invalidate the entire family of dependent query keys including search, presets, templates, and diary daily progress.
- **Library Deletes & Snapshots:** Deleting foods or exercises uses `mode: 'delete'` which preserves logged diary history (via snapshots) and drops items from presets/plans; only explicit `delete_with_history` deletes diary entries. Empty presets are guarded against starting/logging.

## Testing and Validation

- Test files live in `src/tests/`, mirroring the source area they cover; use `test-utils.tsx` for rendering with providers.
- Run the tests nearest the touched surface first, then `pnpm run validate` for cross-cutting changes.
- Lint is strict (`--max-warnings 0`); unused imports fail the build.

## Quick Routing

- Routing/navigation/permission issue: `src/App.tsx` (router, `PrivateRoute`, `PermissionRoute`) and `src/layouts/MainLayout.tsx`.
- API/error-toast issue: `src/api/api.ts`, then the domain client in `src/api/<Domain>/`, then the query/mutation `meta` in the calling hook.
- Auth/session issue: `src/lib/auth-client.ts`, `src/hooks/useAuth.tsx`, `src/pages/Auth/`, and the server's `auth.ts` if it crosses packages.
- Family-access/acting-user issue: `src/contexts/ActiveUserContext.tsx` and the hooks consuming it.
- Chat (Sparky) issue: `src/pages/Chat/`, `src/components/ai/`, `src/api/Chatbot/`.
- Theme/preferences issue: `src/contexts/ThemeContext.tsx`, `src/contexts/PreferencesContext.tsx`, `src/api/Settings/preferences.ts`, `src/utils/userPreferences.ts`.
- Missing/wrong UI text: the i18n key in `public/locales/en/translation.json` and the `t('...')` call site.
- Exercise alternatives / workout feedback / adaptive suggestions (#1560): `AddExerciseDialog`'s `replaceFor` prop adds the **Suggested** tab (`pages/Exercises/ExerciseAlternativesPanel.tsx`); the workout player's Replace (lazy-loaded dialog) and load pass (`WorkoutPlaybackPage.tsx`, helpers in `utils/workoutPlayback.ts`) apply the shared `decideAdaptiveAdjustment` rules and keep both the usual and adapted sets on the draft for "Use my usual"; feedback is `pages/Diary/WorkoutFeedbackPanel.tsx` (finish dialog + expanded diary workout) via `hooks/Exercises/useWorkoutCoaching.ts`.
- Symptom or episode tracking (#1882): `src/pages/Symptoms/` (`SymptomsHub` is the tracker, shown on Check-in through `SymptomsPanel` and on Medications with `variant="medications"`; `SymptomLogForm` is template-driven, `SymptomsReport` is Reports > Symptoms), `src/api/Symptoms/symptomService.ts`, `src/hooks/useSymptoms.ts`. Which sections a symptom asks about comes from `resolveSections` in `@workspace/shared`; family delegates with only the symptoms permission use the standalone `/symptoms` page.
- Bodyweight exercises (#56): the `bodyweight_reps` layout in `constants/exercises.ts` (`signedWeight`) drives the +/− weight header and placeholder in the set editor; reports and trend charts count body weight through the shared `effectiveLoadKg` / `setVolumeKg` (`pages/Reports/ReportsTables.tsx`, `utils/exerciseTrendUtils.ts`, which reads `body_weight_kg` from the progress endpoint).
- `weight_distance` / `weight_duration` (#127) have their own `SET_TABLE_LAYOUT` entries: carries swap the reps cell for a distance cell (stored km, edited in metres/yards via `carryDistanceFromKm` / `carryDistanceToKm` in `@workspace/shared`), loaded holds drop reps and use the duration column.
- Training consistency (#59): `pages/Reports/TrainingConsistencyCard.tsx` in the Exercise report's left column, fed by `useTrainingConsistency` (`hooks/Reports/useReports.ts`) from `GET /reports/training-consistency`. A fixed 26-week window computed on the server by the shared `buildTrainingConsistency`, so it ignores the report's date filter; the existing `WorkoutHeatmap` stays the calendar.
- Chart issue: Recharts usage in the domain page plus `src/components/ExerciseCharts/` or `ZoomableChart.tsx`.

## Priority Rule

- For work inside `SparkyFitnessFrontend/`, this file wins over repo-root guidance on package-specific details.
- If a task spans packages, combine this guide with the other affected package guides.
- If you add a new domain folder, route family, or cross-cutting convention, update the Domain list, Source Map, and Quick Routing sections of this file in the same change.
