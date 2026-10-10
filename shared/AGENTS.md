# AGENTS.md

_Last updated: 2026-10-09_

`@workspace/shared` is a source-first TypeScript workspace library package for schemas, constants, and timezone/day helpers consumed by SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile.

## Scope

- This package defines contracts and shared logic, not an app.
- Validate changes from consuming packages (server, frontend, mobile), not in isolation.
- Every schema change here potentially touches three packages.

## Food Assistant State

`FoodAssistantPlanDraft.api.zod.ts` and `FoodAssistantPlanning.api.zod.ts` add explicit plan assignments, versioned atomic scheduling/undo and persisted shopping checklists. Shopping checks use the shared state dispatcher in both apps. The plan dependency helper migration changes no table permissions; assignment quantities use unrestricted numeric to preserve fractional portions.

`schemas/api/FoodAssistant.api.zod.ts` and `schemas/database/FoodAssistant.zod.ts` define lasting preferences, versioned tasks, unresolved ingredients and idempotent operation records. `schemas/api/FoodAssistantRecipes.api.zod.ts` adds exact provider ingredient import, versioned publication and undo contracts. Task origins stay immutable while ingredient quantities and source yields may remain unresolved. All state is owner-only; these additive contracts do not change existing chat clients.

## Structure

- `src/schemas/database/` - one Zod file per table (`Foods.zod.ts`, `Exercises.zod.ts`, ~60 files). Agent shortcut: to learn a table shape, read the matching file here instead of the SQL dump.
- `src/schemas/api/` - API request/response contracts (`*api.zod.ts`).
- `src/constants/` - shared constants and enums (exercises, nutrients, meal types, fasting protocols, medication schedules, cycle phases, etc.).
- `src/utils/` - timezone helpers (`todayInZone`, `instantToDay`, `dayToUtcRange`, `compareDays`, `addDays`, `isDayString`), cycle/menstruation helpers, and unit/calculation utilities.
- `src/ai/`, `src/cycle/`, `src/medications/`, `src/mood/` - domain-specific helpers.
- `src/symptoms/` - generic symptom tracking: constants and enums (scales, templates, sections, option kinds), template section resolution (`resolveSections`), built-in symptoms and pick-lists, head/body region ids for the location maps, and custom-field validation. The API contract is `src/schemas/api/Symptoms.api.zod.ts`.

## Naming Convention

- `X.api.zod.ts` = API request/response schema
- `X.zod.ts` = database table schema
- Export everything from `src/index.ts`; consuming packages import both types and values via `@workspace/shared`

## Cross-Package Contract Rules

- Changes to `src/schemas/api/` usually affect server routes and both frontend/mobile API clients.
- Changes to `src/schemas/database/` require a matching migration in the server (`SparkyFitnessServer/db/migrations/`), RLS policies, and the schema backup.
- Timezone/day-string helpers prevent bugs; prefer them over `toISOString().split('T')[0]`.
- Food assistant diary commands use `FoodAssistantDiary.api.zod.ts`; state action dispatch shared by web/mobile lives in `utils/foodAssistantState.ts`.
- Test any shared change from the consumer packages (`pnpm run validate` in SparkyFitnessServer, SparkyFitnessFrontend, and SparkyFitnessMobile after modifying shared).

## Working Rules

- Keep this package export-focused and schema-focused; logic that scales should live in consuming packages.
- Never export stale or unfinished types; if a consumer is drafting code and needs a type not yet here, add it.
