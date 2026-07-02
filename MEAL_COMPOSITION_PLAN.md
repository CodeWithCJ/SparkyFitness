# Meal-to-Meal Composition (Linked Sub-Meals) — Design & Implementation Plan

> Status: Draft for review
> Scope: Web frontend, Mobile (Android/iOS), Server/API, AI chatbot + in-process MCP, Nutrition tracking
> Note: `SparkyFitnessMCP/` is deprecated and is intentionally **out of scope**.

## Problem statement

SparkyFitness cannot represent reusable meal components (rice, chili, sauces, bases, prepared sides) as part of another meal without a hack. Users must either duplicate ingredients into each parent meal or fake sub-meals as standalone foods, which breaks the relationship, causes data duplication, and makes updates error-prone.

**Goal:** Allow a meal's ingredient list to include both foods **and** other meals, so reusable sub-meals can be modeled directly. A linked meal must be a first-class ingredient reference that:
- scales by the parent quantity,
- participates in nutrition calculations,
- renders clearly in the UI with a distinct badge/icon and a link to the linked meal's details,
- is validated so cycles cannot be created,
- is exposed through the API so external tools can read meal composition reliably.

The ingredient list stays **flat** in the editor; linked meals are visually identifiable.

---

## 1. How the system works today (constraints we must respect)

**Data model** (`db_schema_backup.sql`):
- `meals` — template header: `serving_size`, `serving_unit`, `total_servings`.
- `meal_foods` — the **flat ingredient list**. Today it *only* references `food_id` (+ `variant_id`, `quantity`, `unit`) plus a full nutrition snapshot. `food_id` is `NOT NULL`, FK `ON DELETE CASCADE` to `foods`.
- `food_entry_meals` + `food_entries` — the **diary layer**. When a meal is logged, a container row (`food_entry_meals.meal_template_id`) is created and the meal is **flattened into leaf `food_entries`** (each with a real `food_id` and a `food_entry_meal_id` back-link).
- Precedent for a food/meal discriminator already exists in `meal_plans` (`chk_meal_or_food`) and `meal_plan_template_assignments` (`item_type` + `chk_item_type_and_id`).

**Key architectural insight:** the diary/reporting layer *never* stores meals — it stores flattened leaf `food_entries`. `getMealTotals` / `calculateDayTotals` / reports all sum leaf entries. So **if we flatten linked sub-meals to leaf foods at log time, diary, day totals, and reporting keep working unchanged.** The linked-meal concept only needs to live at the *template* layer (meal editor, meal API, and the expansion functions).

### Verified behavior (confirmed against code)

- **Meal plan templates keep the meal reference — they do NOT pre-expand.** `meal_plan_template_assignments` stores `item_type` + `meal_id` (or `food_id`); the daily `meal_plans` rows also store `meal_id`. A meal is expanded into individual foods **only at "log to diary"** time (`logMealPlanEntryToDiary`). Meal identity is preserved everywhere until it lands in the diary.
- **Diary logging keeps the grouping AND stores atomic rows.** Logging a meal creates **one `food_entry_meals` container** (retains `meal_template_id`) **plus flattened leaf `food_entries`**, each carrying `food_entry_meal_id` back to the container. This is why reporting / day-totals work unchanged — they read the leaf `food_entries`.
- **Updating a food does NOT rewrite `meal_foods`.** `updateFood` has no `meal_foods` references. `meal_foods` stores a **nutrition snapshot captured when the meal is saved** (MealBuilder sends `calories/protein/…` in the payload). The read query uses `COALESCE(mf.<col>, fv.<col>)`, so a null snapshot column falls back to the food's *current* variant value, while a set snapshot stays frozen. This snapshot is the reason `meal_foods` isn't "just flat `food_id` references" — it keeps a meal's nutrition stable even if the underlying food is edited later. (Design kept as-is.)

### Deep nesting (meal → meal2 → meal3 …) — multiplier composition

Flattening composes portion multipliers down the tree. For any child-meal component define:

```
childFactor = component.quantity / (child.serving_size × child.total_servings)
```

When logging the top meal at consumed quantity `Q`, start with `rootMultiplier = Q / (ss × ts)`, then multiply by each descended component's `childFactor`. A leaf food written to the diary gets:

```
leafFood.quantity × rootMultiplier × childFactor(meal3→meal2) × childFactor(meal2→meal1) × …
```

Recursion is bounded by the max-depth limit (decision #4) and the cycle check (a `meal3 → meal2 → meal3` link is rejected before it can loop).

**Server expansion points that walk `meal.foods`** (these are what break with nesting):
- `SparkyFitnessServer/services/foodEntryService.ts` → `createFoodEntryMeal` — logs a meal to the diary, scales foods by a portion multiplier.
- `SparkyFitnessServer/services/mealService.ts` → `logMealPlanEntryToDiary` — expands meal-plan meals to diary.
- `SparkyFitnessServer/models/mealRepository.ts` → `attachFoodsToMeals` + ~6 near-identical `meal_foods` SELECT blocks.

**Nutrition math** (`SparkyFitnessFrontend/src/utils/nutritionCalculations.ts`, `MealBuilder.calculateMealNutrition`) — the frontend computes meal totals from `meal.foods`, each food scaled `quantity/serving_size`.

**RLS** (`SparkyFitnessServer/db/rls_policies.sql`, meal_foods policies) — `meal_foods.modify_policy` currently **requires `EXISTS (foods WHERE id = meal_foods.food_id)`**, which will actively reject rows where `food_id IS NULL`. It must be rewritten.

**Surfaces:**
- Meals are on the **legacy** route surface (`SparkyFitnessServer/routes/mealRoutes.ts`, no Zod, no v2).
- Frontend `SparkyFitnessFrontend/src/api/Foods/meals.ts`.
- Mobile has ~6 meal screens + `mealNutrition.ts`.
- AI tools `log_meal` / `list_meals` / `save_as_meal_template` in `SparkyFitnessServer/ai/tools/foodTools.ts`, re-published to MCP via `ai/mcp/mcpAdapter.ts`.
- Shared DB zod schemas are hand-maintained (ts-to-zod, no regen script).

---

## 2. Recommended design

**Extend `meal_foods` into a polymorphic "meal component" row** — do *not* create a new table. This keeps the ingredient list flat (a core requirement), reuses every existing query/UI path, and mirrors the established `meal_plans` / `meal_plan_template_assignments` discriminator pattern.

Changes to `meal_foods`:
- Make `food_id` **nullable**; add `child_meal_id uuid NULL` FK → `meals(id)`.
- Add `item_type varchar` default `'food'` (explicit discriminator, matching `meal_plan_template_assignments`).
- `CHECK`: exactly one of `food_id` / `child_meal_id` is set (`variant_id` only meaningful for food rows).
- For a `child_meal_id` row, `quantity`/`unit` mean "how many servings of the sub-meal" (multiplier against the child's `serving_size × total_servings`).

Why not a new `meal_meals` table: it would force every read path, the editor, and nutrition code to merge two lists — directly contradicting "keep the ingredient list flat." Extending `meal_foods` means `attachFoodsToMeals` returns one ordered list already.

**Nutrition handling:** resolve child-meal nutrition **recursively at read time** (compute the child's totals from its own components), and **flatten to leaf foods at log time**. Store an optional aggregated nutrition **snapshot** on the `child_meal_id` row for parity with how food rows already snapshot (and so diary "needs-review" and API totals stay stable). The snapshot is a denormalized convenience; the recursive resolver is source of truth.

**Cycle prevention:** a meal cannot (transitively) contain itself. Enforced in the service via a recursive reachability check before insert/update, backed by a hard **max-depth limit** (recommend depth ≤ 5) to bound recursion cost.

---

## 3. Database & migration (`SparkyFitnessServer/db/migrations/`)

1. New migration `add_child_meal_to_meal_foods.sql`:
   - `ALTER TABLE meal_foods ALTER COLUMN food_id DROP NOT NULL;`
   - `ADD COLUMN child_meal_id uuid REFERENCES meals(id) ON DELETE CASCADE;` (see decision #1)
   - `ADD COLUMN item_type varchar(50) NOT NULL DEFAULT 'food';`
   - `CHECK (( item_type='food' AND food_id IS NOT NULL AND child_meal_id IS NULL) OR (item_type='meal' AND child_meal_id IS NOT NULL AND food_id IS NULL))`.
   - Index on `child_meal_id` (for cycle checks + `ON DELETE` performance).
   - Backfill: existing rows already satisfy `item_type='food'` default.
2. **RLS** (`db/rls_policies.sql`) — rewrite `meal_foods` `select_policy` and `modify_policy`:
   - `modify_policy`: parent meal owned by caller **AND** (`food_id` exists in accessible foods **OR** `child_meal_id` references a meal the caller has library access to). Prevents linking a meal you can't see.
   - `select_policy`: confirm the parent-access gate is sufficient for embedded child resolution.
3. Sync `db_schema_backup.sql` (schema + FKs + constraints + trigger).
4. Cross-package doc updates required by `AGENTS.md`:
   - `docs/content/2.features/9.family-friends-sharing.md`
   - `docs/content/8.developer/11.database-security-tiers.md` (classify the changed `meal_foods` access behavior — sub-meal linking crosses library-visibility boundaries).

**Referential edge case:** child meal deleted → `ON DELETE CASCADE` removes the linking row (parent meal silently loses an ingredient). Alternative: `RESTRICT` + surface a "meal is used as a component" warning in `getMealDeletionImpact` (`mealRepository.ts`). **Recommend `RESTRICT`-style guard** through `getMealDeletionImpact` so users aren't silently mutated — extend it to also count `meal_foods.child_meal_id` usages.

---

## 4. Server: repository layer (`mealRepository.ts`)

- **Consolidate** the ~6 duplicated `meal_foods` SELECT blocks into one helper first (low-risk refactor) so the new columns are added once. The new select adds `mf.child_meal_id`, `mf.item_type`, and `cm.name AS child_meal_name`, `cm.serving_size`/`serving_unit`/`total_servings` via `LEFT JOIN meals cm ON mf.child_meal_id = cm.id`.
- `createMeal` / `updateMeal` INSERT: extend the `format(...%L)` value tuples to include `child_meal_id` / `item_type`; validate exactly-one-of at the service layer.
- **New recursive resolver** `getMealWithResolvedComponents(mealId, userId, depth=0)`: for each `item_type='meal'` component, recurse to compute the child's resolved totals & (optionally) nested foods for rendering; enforce max depth. Used by read paths and nutrition.
- **New** `getMealComponentUsage(mealId)` for deletion-impact and cycle checks (who links to this meal).
- Cycle check query: recursive CTE from candidate `child_meal_id` following `meal_foods.child_meal_id` edges; reject if it reaches the parent.

## 5. Server: service layer (`mealService.ts`)

- `createMeal` / `updateMeal`: normalize each ingredient to `{item_type, food_id|child_meal_id, quantity, unit}`; **validate**: exactly-one-of, `child_meal_id ≠ self`, no cycle (call reachability check), depth limit, and that the child meal is accessible. Throw `ValidationError` on violation.
- **`is_public` propagation**: today making a meal public makes its component *foods* public. Extend to require/prompt that linked child meals are also public (or block publishing a meal that links a private sub-meal). Decision point — recommend **block with a clear error** rather than silently cascade-publishing sub-meals (decision #2).
- **Diary expansion — the critical change** (`logMealPlanEntryToDiary`): replace the single-level `for (foodItem of meal.foods)` with a **recursive flattener** that walks `child_meal_id` components, multiplying `quantity` down the tree, emitting only leaf `food_entries`. Same helper reused by both meal-plan logging and `createFoodEntryMeal`.

## 6. Server: diary logging (`foodEntryService.createFoodEntryMeal`)

- Introduce a shared `flattenMealToLeafFoods(mealId, parentMultiplier, userId, depth)` that returns `[{food_id, variant_id, quantity, unit, snapshot}]`. For a child-meal component, multiplier = `component.quantity / (child.serving_size × child.total_servings)` composed with the parent multiplier (matching the existing portion-multiplier math in `createFoodEntryMeal`).
- The container `food_entry_meals` row and diary rendering stay unchanged — still one container + flat leaf `food_entries`. **Reporting, day totals, needs-review, copy-day all keep working with zero changes** because they only ever see leaf foods.
- Note the **snapshot vs. live** trade-off: flattening reads the child meal's *current* foods at log time (consistent with today's behavior where meal edits trigger "needs review").

## 7. Server: routes & validation (`mealRoutes.ts`)

- Meals are legacy (no Zod). Add validation for the new ingredient shape. Per `AGENTS.md` ("new endpoints need Zod"), introduce a Zod schema for the meal create/update body including a discriminated-union ingredient item. Full v2 migration is out of scope; add the schema inline.
- Update Swagger JSDoc for `POST/PUT /meals` and `GET /meals/:id` to document `item_type`, `child_meal_id`, `child_meal_name`, and resolved totals — this is the **external-tool API contract** the feature explicitly asks for.

## 8. API response contract (external tools)

`GET /meals/:id` and list endpoints return each ingredient with a discriminator so third parties can resolve composition without guessing:

```jsonc
{
  "item_type": "food" | "meal",
  "food_id": "…", "variant_id": "…", "food_name": "…",
  "child_meal_id": "…", "child_meal_name": "…", "child_meal_serving_unit": "…",
  "quantity": 2, "unit": "serving",
  "resolved_nutrition": { "calories": 0, "protein": 0 /* … scaled contribution */ }
}
```

Plus a meal-level `total_nutrition`. Document in `SparkyFitnessServer/config/swagger.ts`.

## 9. AI chatbot tools + in-process MCP (`ai/tools/foodTools.ts`)

- `log_meal` → goes through `createFoodEntryMeal`, so it **inherits recursive flattening for free** — no logic change, but verify.
- `list_meals` / meal detail output: include linked-meal components (distinct label, e.g. `↳ [meal] Egg-fried rice ×2`) in the formatted text. **Golden-string tests** in `tests/chatbotTools*.test.ts` assert exact output — update those.
- `save_as_meal_template` (`createMealFromDiaryEntries`) builds from diary leaf foods only — no change needed, but note it can't reconstruct sub-meal structure (acceptable).
- MCP re-publish (`ai/mcp/mcpAdapter.ts`) is automatic from the registry — no change beyond the tool output text. (`SparkyFitnessMCP/` deprecated — untouched.)

## 10. Frontend web

- `src/types/meal.ts`: add `item_type`, `child_meal_id`, `child_meal_name`, `child_meal_serving_unit` to `MealFood` / `MealFoodPayload`.
- `src/components/MealBuilder.tsx`: allow adding a **meal** as an ingredient (extend `FoodSearchDialog` or add a meal-search tab); render linked-meal rows with a **distinct badge/icon + link** to the meal detail; `calculateMealNutrition` must add the child meal's scaled contribution (fetch/resolve totals, or use API-provided `resolved_nutrition`).
- `src/utils/nutritionCalculations.ts`: teach `calculateMealNutrition` / `getMealData` to handle `item_type='meal'` items (prefer server-resolved totals to avoid client-side recursion).
- Client-side cycle guard: when adding a meal ingredient, prevent selecting the meal being edited (server is authoritative, but fail fast in UI).
- `src/pages/Foods/MealManagement.tsx`, `src/pages/Diary/LogMealDialog.tsx`, `src/pages/Reports/ReportsTables.tsx`: verify rendering of meals that contain sub-meals (mostly display, since diary is flattened).

### Reports tab impact (verified) — effectively zero for correctness

The nutrition report reads **only leaf `food_entries`** (`reportRepository.ts`, `UNION ALL` of `food_entries WHERE food_entry_meal_id IS NULL` and `food_entry_meals JOIN food_entries ON food_entry_meal_id`). Both branches sum leaf rows. Because the recursive flattener writes **only leaf `food_entries`** at log time (even for meal→meal2→meal3), report totals, charts (`NutritionChartsGrid`, `NutritionPeriodSummary`), and period summaries are correct with **no server-side report changes**.

**Only caveat — CSV / tabular export provenance (optional):** the tabular view + export (`reportUtil.ts`, `ReportsTables.tsx`) render one row per leaf food. A meal built from sub-meals shows leaf food names grouped under its container; nutrition is right, but the export does **not** indicate which leaf food came from which sub-meal. Adding a "source sub-meal" column is an optional enhancement, not a correctness fix.

## 11. Mobile (Android/iOS)

**Mobile is a separate app and is NOT auto-covered by web + server changes.** It has its own nutrition math and rendering (`src/utils/mealNutrition.ts`, `mealBuilderDraft.ts`) plus ~6 meal screens. What the server gives it for free is correct data and the **flattened logging path** (logging a meal that contains sub-meals just works). What still needs explicit mobile work:
- render the linked-meal **badge + link** (`MealDetailScreen`, `MealsLibraryScreen`, `EditLoggedMealScreen`),
- compute **display nutrition that includes sub-meals** (prefer server-resolved totals to avoid client-side recursion),
- the **add-a-meal-as-an-ingredient** flow (`MealAddScreen`).

This is a dedicated phase after web + server (Phase 5), not a byproduct of them.

## 12. Shared package

Hand-edit `shared/src/schemas/database/MealFoods.zod.ts` (no regen script — the file itself documents this) to add `child_meal_id` / `item_type`. Validate from consumers, not in isolation.

---

## 13. Risk register & edge cases

- **Cycles** — recursive self-reference. Mitigation: reachability check + max depth (both server-enforced; DB `CHECK` can't express transitive cycles).
- **RLS regression** — the existing `modify_policy` will reject `food_id IS NULL` rows; must rewrite or all sub-meal writes fail. High priority.
- **`ON DELETE CASCADE` silently mutating parents** — recommend deletion-impact guard instead.
- **Public-sharing leakage** — publishing a meal that links a private sub-meal; block or cascade explicitly.
- **Nutrition drift** — child meal edited after parent references it; consistent with current snapshot/"needs-review" behavior, but document.
- **Performance** — recursive resolution; bounded by depth limit + `child_meal_id` index.
- **Legacy diary rows** — none affected (flattening only changes new logs).

## 14. Testing

- Server: unit tests for the recursive flattener (multi-level, quantity multiplication, depth limit), cycle-rejection, RLS (can't link inaccessible meal), deletion-impact. Route tests for create/update/get with `item_type='meal'`. Update chatbot golden-string tests.
- Frontend/mobile: MealBuilder nutrition with a linked meal, badge rendering, client cycle guard.

## 15. Suggested phasing

1. **DB + RLS + repository read/flatten + service validation** (server foundation, fully testable).
2. **Diary + meal-plan expansion** (recursive flattening) + tests.
3. **Web editor + nutrition + API/Swagger contract**.
4. **AI tool output + golden tests**.
5. **Mobile**.
6. **Docs** (family-sharing + security-tiers, required by repo rules).

---

## Open decisions (recommended default in bold)

1. **`ON DELETE` for a linked child meal:** **`RESTRICT` + deletion-impact warning** vs. `CASCADE` (silent).
2. **Publishing a meal that links a private sub-meal:** **block with error** vs. cascade-publish the sub-meal.
3. **Nutrition snapshot on the child-meal row:** **store snapshot (parity)** vs. always resolve live.
4. **Max nesting depth:** recommend **5**.

## Process note

`SparkyFitnessServer/AGENTS.md` asks that a `plan-reviewer` agent review this before finalizing. That agent is not currently available in the harness, so it has not been run. Consider running the `Plan` agent to pressure-test the design, or promoting this into a formal RFC under `docs/`.
