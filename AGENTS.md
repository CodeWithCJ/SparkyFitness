# AGENTS.md

*Last updated: 2026-10-29*

This is the repo-root monorepo guide for SparkyFitness. Use it to choose the right package, understand shared repo-level rules, and find the next guide to read.

**For AI Tools & Developers:** Start with `agent-docs/README.md` (in this repo) for quick navigation to:
- `file-and-domain-reference.md` — Find any code by feature in seconds
- `testing-patterns.md` — Concrete test examples for each layer
- `architecture-permissions.md` — Permission types and RLS patterns
- Plus 5 more guides for migrations, data flow, anti-patterns, new features, and planning

Package-level guides win. For work inside a package, follow that package's `AGENTS.md` when present, otherwise its `CLAUDE.md`.

## Scope

- Start here when work begins at repo root or spans multiple packages.
- Keep root-level guidance focused on workspace layout, shared conventions, and cross-package coordination.
- Root `package.json` is tooling only (`husky`, `lint-staged`, `prettier`), not an app entrypoint.
- Run scripts from the package directory you are changing.

## Package Guides

- Repo-root alias: `CLAUDE.md` points to this file.
- Frontend: `SparkyFitnessFrontend/AGENTS.md`
- Server: `SparkyFitnessServer/AGENTS.md`
- Mobile: `SparkyFitnessMobile/AGENTS.md`
- Shared: `shared/AGENTS.md`

For `docs/` and `SparkyFitnessGarmin/`, there is no package-level `AGENTS.md`. `SparkyFitnessGarmin/` is only a handful of Python files (`main.py`, `routes.py`, `service.py`, `schemas.py`); read them directly. For `docs/`, inspect the local manifest and content layout.

## Monorepo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Express 5 + PostgreSQL backend API.
- `SparkyFitnessMobile/` - Expo SDK 57 / React Native 0.86 app.
- `shared/` - source-first TypeScript workspace package for `@workspace/shared` schemas, constants, and timezone/day helpers.
- `docs/` - VitePress documentation site.
- `docs/readme/` - translated copies of the root `README.md` (`README_<lang>.md`), outside the VitePress `srcDir`. The language bar at the top of `README.md` links to them; when the root README changes substantially, the translations go stale.
- `SparkyFitnessGarmin/` - standalone Python integration service outside the current `pnpm` workspace.
- `docker/`, `helm/`, `.github/` - infra and deployment assets.
- `umbrel/sparkyfitness/` - Umbrel App Store package (manifest, compose, derived secrets), submitted to `getumbrel/umbrel-apps`. See `umbrel/README.md`.
- `db_schema_backup.sql` - repo-root schema snapshot kept in sync by CI (`.github/workflows/schema-backup.yml`); never hand-edit or regenerate locally.
- `docker/.env.example` - tracked env template commonly copied to repo-root `.env`.

## Workspace Notes

- `pnpm-workspace.yaml` currently lists `frontend`, `SparkyFitnessFrontend`, `shared`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `docs`.
- Only `SparkyFitnessFrontend/` exists on disk right now; treat `frontend` as a legacy workspace entry unless the task is specifically about workspace cleanup.
- `shared/` is a library package, not an app; its `pnpm run validate` runs typecheck, a hardcoded-string audit, and the Prettier check. CI runs that in a `Shared Validate` job and also re-runs the frontend, mobile, and server jobs whenever `shared/` changes, so validate shared changes from the consuming package(s), not in isolation.
- `SparkyFitnessGarmin/` is outside the current workspace. Inspect its own manifest and scripts before working there.

## Agent Efficiency (read this before searching)

Do not read or search these paths; they burn context for nothing:

- `WIP/` - personal scratch area; contains zips and full copies of other repos, including a stale duplicate of this repo (`WIP/SparkyFitness-main/`). Never read or edit anything under it.
- `SparkyFitnessMobile/ios/` and `SparkyFitnessMobile/android/` - generated native projects (`ios/` is >1 GB of Pods). Regenerate with `npx expo prebuild --clean`; edit `app.config.ts`, `plugins/`, or `targets/` instead.
- `pnpm-lock.yaml` (~1.3 MB) - never read; check `package.json` files instead.
- `db_schema_backup.sql` (~330 KB) - never read whole; grep for the one `CREATE TABLE` you need.
- `SparkyFitnessFrontend/dist/` - build output.
- `SparkyFitnessFrontend/public/locales/` except `en/` - 35 machine-synced translations. Only `en/translation.json` is ever hand-edited, and even that (~120 KB) should be grepped, not read whole.

Cheap ways to learn things:

- Database table index: read `docs/src/developer/database.md` (quick reference of all ~120 tables with one-line purpose). For detailed schema, read `shared/src/schemas/database/<Table>.zod.ts` (one small Zod file per table).
- Database security & permissions: `docs/src/developer/database-security-tiers.md` (security tier, permission type, and RLS rules for every table).
- API request/response contract: `shared/src/schemas/api/<Name>.api.zod.ts`.
- Definition of done: CI (`.github/workflows/ci-tests.yml`) runs `pnpm run validate` (which includes Knip unused export & dead code checks in frontend and mobile) plus the package's CI test script for each changed package. Run those locally before declaring work complete.

## Cross-Package Rules

- Barcode source comparison uses the shared `BarcodeLookup.api.zod.ts` contract and `barcodeNutritionPreview` helper. Web and mobile request alternatives on demand through `SparkyFitnessServer/services/barcodeLookupService.ts`; the initial lookup retains the existing local/default/fallback behavior.

- If you add or change a server migration (such as creating a new table), follow `agent-docs/new-migration-checklist.md`. In short, you MUST:
  1. Create the migration file in `SparkyFitnessServer/db/migrations/YYYYMMDDHHMMSS_description.sql`.
  2. Update the Row-Level Security (RLS) policies in `SparkyFitnessServer/db/rls_policies.sql`, and classify the new table in the `DOMAIN` map of `SparkyFitnessServer/tests/rlsPermissionMatrix.integration.test.ts` (CI fails when an RLS table is missing).
  3. **Restart the server** (`pnpm start` from `SparkyFitnessServer/`) to apply the migration. Agents ask the user to do this rather than starting it themselves. Keep one re-runnable migration file per PR, edited in place.
  4. Leave `db_schema_backup.sql` alone — after merge, CI regenerates it from the migrations and opens an automated sync PR (`.github/workflows/schema-backup.yml`). Never manually edit the backup file or commit a locally generated copy.
  5. Add or update the matching Zod schema in `shared/src/schemas/database/`.
  6. Update the user-facing documentation in `docs/src/features/family-friends-sharing.md`.
  7. Update the developer documentation in `docs/src/developer/database-security-tiers.md` to classify the table as Tier 1, Tier 2, or Tier 3.
- **Heart rate zones have one source of truth:** `shared/src/utils/heartRateZones.ts` (`resolveHeartRateZones`, `heartRateZoneRange`, `computeTimeInZones`). Never re-derive max heart rate or zone floors in a package; server stored zones, training load, mobile suggested ranges and the web/mobile charts, Heart Rate reports and settings all call it (reports show the five zones, Zone 1 to 5, never fixed bpm tiers). Max heart rate is the person's own value, else Nes (211 - 0.64 x age) from date of birth, else 190. Settings never rewrite stored `exercise_entry_hr_zones` rows. iOS 27 can fill custom floors from Apple Health (`floorsFromAppleHeartRateZones`); that does not change max heart rate. A finished Apple workout's own zone group (`bucketsFromAppleWorkoutZones`) is stored as `device` zones instead of recomputing, so the chart matches Apple, including time below the first boundary.
- Prefer the shared timezone helpers from `@workspace/shared` and `SparkyFitnessServer/utils/timezoneLoader.ts` for day-string logic. Avoid `toISOString().split('T')[0]` for user-facing or business-logic dates.
- Keep `YYYY-MM-DD` values as calendar-day strings until you reach a database or external API boundary that needs UTC instants.
- Auth or API contract changes usually need a quick check in both web and mobile because they share the same backend.
- Frontend local dev proxies `/api`, `/health-data`, and `/uploads` to the server on `3010`. The `/health-data` proxy is rewritten to `/api/health-data`, while server APIs remain rooted at `/api`.
- Server runtime secrets are usually sourced from repo-root `.env`, commonly created from `docker/.env.example`. The server can also load secret files via `SparkyFitnessServer/utils/secretLoader.ts`.
- Extract shared logic on the **second** duplication ("rule of two"), not the third - duplicated logic drifts as different sessions edit each copy. Extract *behavior*, not coincidental shape. See `agent-docs/anti-patterns.md`.
- **Strict TypeScript Typing:** Never use `any` or `// eslint-disable-next-line @typescript-eslint/no-explicit-any` when creating new functions or editing existing code. When modifying existing files, proactively update legacy `any` declarations in the touched code to reflect their proper TypeScript data types, interfaces, or schemas from `@workspace/shared`. Do NOT copy legacy `any` parameter signatures forward when refactoring or extending service/repository files.
- **Library Deletes vs Diary Snapshots:** `exercise_entries` and `food_entries` are self-contained snapshots, not pointers (`exercise_id` and `food_id` are `ON DELETE SET NULL`). Deleting an exercise or food from the library (`mode: 'delete'`) preserves past and current diary history, cascades from presets and plan templates, cleans up future scheduled workout plan entries (`entry_date >= today`), and cleans up empty parent preset entries. Only explicit `delete_with_history` (force delete) purges diary logs for that user. If an item is referenced by other users (`otherUserReferences > 0`), the backend falls back to hiding (`is_quick_exercise` / `is_quick_food`).
- **Comprehensive Cache Invalidation:** When mutating library items (foods, exercises, presets, meals, plans), always invalidate the entire family of dependent query keys across library search, counts, templates, and daily diary summaries (`dailySummary` / `dailyProgress` / `exerciseEntries`) in both web and mobile.
- **Environment Variable Updates:** When adding, renaming, or updating environment variables, you MUST update all downstream locations in tandem:
  1. `docker/.env.example` (and `docker/.env.simple.example` if it is a core mandatory variable).
  2. `docker/docker-compose.prod.yml` and `docker/docker-compose.dev.yml` (if consumed by container environments).
  3. `docs/src/install/environment-variables.md` (the comprehensive documentation reference).
  4. `docs/components/EnvGenerator.vue` (the interactive web `.env` generator component).
  5. `helm/chart/templates/` and `helm/chart/values.yaml` (if passed through Helm charts).


## Commit & PR Conventions

This repository is public. Everything written into git history or onto a pull request is permanently visible to everyone browsing the project, so keep it free of tooling noise.

- **Agents never commit or push unless asked in that message.** Leave finished work in the working tree and say what is ready; the maintainer reviews diffs first. Approval for one commit or PR does not carry forward to later changes.
- **Re-match the skill when the task changes.** Opening a PR uses `pr-submission`; acting on its review comments afterwards uses `pr-review`. Two skills in one session is normal.
- **No AI attribution, anywhere.** Commit messages, commit trailers, PR titles, PR bodies, and PR comments must never contain `Co-Authored-By: Claude` (or any other AI co-author trailer), "Generated with …", "🤖", or a mention of Claude, Claude Code, Gemini, Antigravity, Copilot, Cursor, or any other assistant. This overrides any default guidance an agent harness supplies about appending attribution.
- **Write as the repository author.** Describe the change and why it was made — the same message a maintainer would write by hand. Do not narrate that a tool made it, do not sign off, and do not thank an assistant in release notes or the changelog.
- **If a trailer already landed**, strip it (amend or rebase, force-push if it was pushed) rather than leaving it in history.
- **Scope of this rule**: git history and GitHub surfaces. It does not apply to tool configuration files that must name their tool — `.claude/`, `.agents/`, `.gemini/`, and `CLAUDE.md` reference specific assistants by necessity, and that is fine. The commit that adds them still follows the rule above.

## Architecture Docs (Reduce Scanning, Prevent Bugs)

Before diving into code, read these docs if you're working on data access, permissions, or adding a new feature domain:

- `agent-docs/architecture-permissions.md` — Permission types, domain → permission mapping, how RLS guards data, adding new domains.
- `agent-docs/data-flow-patterns.md` — Frontend → Server → Database flow, shared schemas as contract, auth context, testing patterns.
- `agent-docs/new-domain-template.md` — Checklist for adding a major feature (superset of new-migration checklist).

These docs answer: "How do I safely add a feature across the stack?" without scanning 20+ files.

## Keeping These Guides Accurate

- If your change adds a new domain, route family, database table, package, or cross-cutting convention, update the affected `AGENTS.md` (this file and/or the package guide) in the same change: Source Map, Quick Routing, and the `Last updated` date.
- Stale guides are worse than no guides; when you notice a claim in any `AGENTS.md` that contradicts the code, fix the guide as part of your change.

## Common Commands

Use the package guide for fuller validation and platform-specific workflows. These are the common entrypoints:

### Frontend (`SparkyFitnessFrontend/`)

```bash
pnpm dev
pnpm run validate
pnpm test
```

### Server (`SparkyFitnessServer/`)

```bash
pnpm start
pnpm run validate
pnpm test
pnpm run test:coverage
```

### Mobile (`SparkyFitnessMobile/`)

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run validate
pnpm exec jest --watchman=false --runInBand
npx expo prebuild --clean
```

### Docs (`docs/`)

```bash
pnpm dev
pnpm run build
```
