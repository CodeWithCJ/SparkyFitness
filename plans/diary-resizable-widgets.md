# Diary Resizable Widgets — Implementation Plan

_Last updated: 2026-06-21_

Make the web Diary page a customizable widget dashboard: each section
(Daily Energy Goal, Nutrition Summary, Water Intake, each Meal card, Exercise)
becomes a draggable, resizable, maximizable, hideable widget. Layout is
responsive across screen sizes, persisted per-user in the database, and
resettable to defaults.

Scope: **web only** (`SparkyFitnessFrontend`). The React Native
`SparkyFitnessMobile/src/screens/DiaryScreen.tsx` is unaffected.

---

## Decisions (locked)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Persistence | **DB-only**, new dedicated table | Layout JSON is tiny; fetch is covered by the existing Diary loading gate, so no flash of default layout. Avoids the localStorage release-clearing maintenance trap (no existing localStorage-versioning infra in the app). React Query gives free in-session caching. |
| Activation | **Edit-mode toggle** ("Customize layout" button) | Drag/resize only active in edit mode, so normal scroll/tap and touch/mobile-web are never hijacked. |
| Meal widgets | **Keyed by meal-type ID** (`meal:<uuid>`) + reconcile on load | Meal types are user-configurable (hide / create "Late Night Snacks" etc.). Reconciliation appends new types, drops deleted/hidden ones, keeps placements stable. |
| Grid library | `react-grid-layout` (verify v2 API; v1 `WidthProvider` fallback) | Matches the Lovable mockup. |

### Why not localStorage / React Query persistence (for reference)

- React Query cache is **in-memory only** today
  (`SparkyFitnessFrontend/src/main.tsx:40` — no `persistQueryClient`).
  In-session navigation is cached; a hard refresh refetches from DB.
- The refetch flash is avoidable by gating the grid behind the existing
  `loading` flag in `Diary.tsx:314`, so localStorage is not required for v1.
- **Future optional enhancement (not in this plan):** if instant load on
  hard-refresh is later wanted, add `@tanstack/react-query-persist-client`
  with its `buster` option tied to the app version — this auto-invalidates on
  release and is the correct answer to "clear cache on new release."

---

## Reference: the Lovable mockup

`WIP/resizable widget/src/routes/diary.tsx` is a faithful prototype using
`react-grid-layout` v2 (`Responsive` + `useContainerWidth` + `dragConfig` /
`resizeConfig`). It implements drag (via `.widget-drag-handle`), corner
resize, maximize (mutates layout), hide + restore chips, reset-to-default, and
4 breakpoints. It persists to `localStorage` with a comment marking it as a
"stand-in for backend," and it **hardcodes** `breakfast/lunch/snacks/dinner` —
the one thing we must replace with dynamic, ID-keyed meal reconciliation.

We reuse its `WidgetFrame` + grid wiring and toolbar UX; we replace its mock
bodies with the real components and its localStorage with the DB hook.

---

## Current Diary structure (what we refactor)

- `SparkyFitnessFrontend/src/pages/Diary/Diary.tsx`
  - Renders a fixed vertical stack; gates on `if (loading) return ...` (L314).
- `SparkyFitnessFrontend/src/pages/Diary/DiaryTopControls.tsx`
  - Hardcoded `grid-cols-5` bundling **three** widgets together:
    `DailyProgress` (Energy), an **inline** Nutrition Summary card, and
    `WaterIntake`. The Nutrition Summary must be **extracted** into its own
    component so it can be an independent widget. The copy/edit-goals buttons
    in its header move with it.
- Meal cards: `.map()` over `availableMealTypes.filter(is_visible)` →
  one `MealCard` each.
- `ExerciseCard`: single instance at the bottom.

Widget set (stable keys): `energy`, `nutrition`, `water`,
`meal:<mealTypeId>` (N of them), `exercise`.

---

## Phase 1 — Backend (DB persistence)

### 1.1 Migration

New file `SparkyFitnessServer/db/migrations/<timestamp>_create_user_dashboard_layouts.sql`
(timestamp format like existing, e.g. `20260622000000_...`):

```sql
CREATE TABLE public.user_dashboard_layouts (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  page_key text NOT NULL,
  layout jsonb NOT NULL,
  hidden jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_dashboard_layouts_user_page_key UNIQUE (user_id, page_key)
);
```

- `layout` shape: `{ lg: Layout[], md: Layout[], sm: Layout[], xs: Layout[] }`
  where `Layout = { i, x, y, w, h, minW?, minH? }`.
- `hidden` shape: `string[]` of widget keys.
- `page_key` is `'diary'` for now (table is reusable for future dashboards).

### 1.2 RLS

- Add `user_dashboard_layouts` to `SparkyFitnessServer/db/rls_policies.sql`
  via the existing helper: `SELECT create_owner_policy('user_dashboard_layouts');`
  (mirrors `user_nutrient_display_preferences`).
- Enable row security in the migration as other tables do.

### 1.3 Schema snapshot

- Update repo-root `db_schema_backup.sql` to include the new table + policy
  (per the cross-package rule in `AGENTS.md`).

### 1.4 Repository / Service / Routes

- `SparkyFitnessServer/models/dashboardLayoutRepository.ts`
  - `getLayout(userId, pageKey)` → row or null.
  - `upsertLayout(userId, pageKey, { layout, hidden })` →
    `INSERT ... ON CONFLICT (user_id, page_key) DO UPDATE SET layout=..., hidden=..., updated_at=now()`.
    (Clean 2-column upsert — deliberately **not** the brittle 33-param
    `preferenceRepository` upsert.)
- `SparkyFitnessServer/services/dashboardLayoutService.ts`
  - Thin pass-through + validation (validate `page_key`, JSON shape sane).
- `SparkyFitnessServer/routes/dashboardLayoutRoutes.ts`
  - `GET /:pageKey` → `{ layout, hidden }` or `204`/empty if none.
  - `PUT /:pageKey` body `{ layout, hidden }` → upsert, return saved.
  - Use `authenticate` middleware and `req.userId` like `preferenceRoutes.ts`.
- Register in `SparkyFitnessServer/SparkyFitnessServer.ts`:
  `app.use('/api/dashboard-layouts', dashboardLayoutRoutes);`
  (near the other `app.use('/api/...')` registrations ~L437).

### 1.5 Tests

- `SparkyFitnessServer/tests/dashboardLayoutRepository.test.ts`
  (mirror `preferenceRepository.test.ts`): upsert inserts then updates;
  get returns null when absent.

---

## Phase 2 — Frontend data layer

### 2.1 API + query keys

- `SparkyFitnessFrontend/src/api/Settings/dashboardLayouts.ts`
  (or `src/api/dashboardLayouts.ts`): `getDashboardLayout(pageKey)`,
  `saveDashboardLayout(pageKey, { layout, hidden })` using the shared `api`
  client (`src/api/api.ts`).
- `SparkyFitnessFrontend/src/api/keys/dashboardLayouts.ts`:
  query-key factory consistent with `keys/diary.ts`.

### 2.2 Hook

- `SparkyFitnessFrontend/src/hooks/Diary/useDashboardLayout.ts`
  - `useQuery` for `GET /:pageKey`.
  - `useMutation` for `PUT /:pageKey`, **debounced ~800ms** after the last
    layout change, with optimistic update of the query cache so the grid
    stays responsive while dragging.
  - Exposes `{ layout, hidden, isLoading, save, reset }`.

### 2.3 Reconciliation (the key piece the mockup lacks)

Pure helper, e.g.
`SparkyFitnessFrontend/src/utils/dashboardLayout.ts`:

- `buildWidgetKeys(visibleMealTypes)` →
  `['energy','nutrition','water', ...mealTypes.map(m => 'meal:'+m.id), 'exercise']`.
- `reconcileLayout(savedLayout, currentKeys)`:
  - For each breakpoint: keep entries whose `i` is in `currentKeys`;
    **append** any `currentKey` missing from saved layout with a default tile
    (sensible `w/h/minW/minH`, placed at the bottom — let RGL compact).
  - Drop entries whose `i` is no longer a current key (deleted/hidden type).
- `generateDefaultLayouts(currentKeys)`:
  - Dynamic version of the mockup's `DEFAULT_LAYOUTS` for `lg/md/sm/xs`,
    parameterized by the actual meal-type count (mockup hardcodes 4).
- This makes meal-type customization compose: create "Late Night Snacks" →
  appears with a default tile; hide "Snacks" → its widget drops out (placement
  retained dormant for unhide); **Reset** regenerates from current types.

---

## Phase 3 — UI refactor

### 3.1 Extract Nutrition Summary widget

- New `SparkyFitnessFrontend/src/pages/Diary/NutritionSummaryCard.tsx`
  containing the inline summary grid + `MiniNutritionTrends` + the
  copy/copy-from-yesterday/edit-goals header buttons currently inside
  `DiaryTopControls.tsx`.
- `DiaryTopControls` is then either removed or reduced to a non-grid fallback;
  Diary will compose the three widgets independently via the grid.

### 3.2 Add the grid library

- Add `react-grid-layout` + `@types/react-grid-layout` to
  `SparkyFitnessFrontend/package.json` (pnpm).
- **Verify the v2 API** (`Responsive`, `useContainerWidth`, `dragConfig`,
  `resizeConfig`) resolves after install. If unstable, fall back to v1
  `WidthProvider(Responsive)` with `isDraggable`/`isResizable`/
  `draggableHandle`/`onLayoutChange` — same concepts, adjust prop names.
- Import RGL CSS (`react-grid-layout/css/styles.css`,
  `react-resizable/css/styles.css`).

### 3.3 Components

- `SparkyFitnessFrontend/src/pages/Diary/DiaryWidgetGrid.tsx`
  - Adapted from the mockup's `DiaryPage`: takes the widget registry, layout,
    hidden, edit-mode flag, and the persistence callbacks.
  - Builds widget bodies from real components:
    - `energy` → `DailyProgress`
    - `nutrition` → `NutritionSummaryCard`
    - `water` → `WaterIntake`
    - `meal:<id>` → `MealCard` (with the existing per-meal props/handlers)
    - `exercise` → `ExerciseCard`
  - All existing props/handlers from `Diary.tsx` are threaded through.
- `SparkyFitnessFrontend/src/pages/Diary/WidgetFrame.tsx`
  - From the mockup: header with grip handle, title, icon, and hover toolbar
    (maximize/restore, hide). Only show the drag handle + resize when in
    edit mode.

### 3.4 Wire into Diary.tsx

- Keep the existing data hooks and `loading` gate; render `DiaryWidgetGrid`
  in place of `DiaryTopControls` + the meal `.map()` + `ExerciseCard`.
- Include the layout query in the loading gate to avoid any default-layout
  flash.

---

## Phase 4 — Interactions & polish

- **Edit-mode toggle**: a "Customize layout" button (header, near
  `DayNavigator`). Drag/resize disabled unless in edit mode.
- **Hover toolbar** per widget: maximize/restore + hide (`X`).
- **Restore-hidden** chips (from mockup) shown in edit mode for re-adding
  hidden widgets.
- **Reset button**: regenerate defaults from current meal types, clear DB row
  (or upsert defaults), exit maximized state.
- **Maximize**: reuse mockup approach (temporarily expand one widget); ensure
  it doesn't clobber the saved layout (mockup guards `onLayoutChange` while
  maximized).
- **Responsive**: breakpoints `lg/md/sm/xs`; verify on common widths.
- Validate: `pnpm run validate` and `pnpm test` in `SparkyFitnessFrontend`;
  `pnpm run validate` + `pnpm test` in `SparkyFitnessServer`.

---

## Files touched (summary)

**Server**
- `db/migrations/<ts>_create_user_dashboard_layouts.sql` (new)
- `db/rls_policies.sql` (edit)
- `models/dashboardLayoutRepository.ts` (new)
- `services/dashboardLayoutService.ts` (new)
- `routes/dashboardLayoutRoutes.ts` (new)
- `SparkyFitnessServer.ts` (register route)
- `tests/dashboardLayoutRepository.test.ts` (new)
- repo-root `db_schema_backup.sql` (edit)

**Frontend**
- `api/Settings/dashboardLayouts.ts` (new)
- `api/keys/dashboardLayouts.ts` (new)
- `hooks/Diary/useDashboardLayout.ts` (new)
- `utils/dashboardLayout.ts` (new — reconciliation + default generator)
- `pages/Diary/NutritionSummaryCard.tsx` (new — extracted)
- `pages/Diary/DiaryWidgetGrid.tsx` (new)
- `pages/Diary/WidgetFrame.tsx` (new)
- `pages/Diary/Diary.tsx` (edit — compose grid)
- `pages/Diary/DiaryTopControls.tsx` (edit/remove)
- `package.json` (add `react-grid-layout`, `@types/react-grid-layout`)

---

## Risks / open items

1. **react-grid-layout v2 API stability** — verify on install; v1 fallback
   documented above.
2. **Maximize vs persistence** — guard `onLayoutChange` during maximize so the
   temporary expansion isn't saved (mockup already does this).
3. **Touch / mobile-web** — edit-mode toggle mitigates scroll hijacking; test
   drag handles on touch.
4. **Meal-type churn mid-session** — reconciliation runs on load and on
   meal-type changes; confirm new types appear without a manual reload.
5. **Empty/legacy users** — `GET` returns none → generate defaults from
   current meal types; first `PUT` creates the row.
```
