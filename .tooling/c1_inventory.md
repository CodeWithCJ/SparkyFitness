# C1 Inventory (working doc — not committed)

## Meal type API contract (/api/meal-types)
- { id, name, sort_order: number|null, user_id: string|null, created_at, is_visible: boolean,
    show_in_quick_log: boolean|null, default_time: 'HH:MM'|null }
- Canonical ID: `id`
- System types: user_id === null; Custom: user_id !== null
- No dedicated "system key" column — system detection via user_id + name match
- custom_meal_percentages: Record<string, number> keyed by LOWERCASE NAME (web contract, verified in
  frontend/src/utils/goals.ts + buildGoalsPayload)
- Legacy *_percentage fields exist for breakfast/lunch/dinner/snacks

## FoodEntry
- meal_type: string (required, name snapshot)
- meal_type_id?: string (optional, canonical)
- entries carry both from server

## Verified working already
- groupFoodEntriesByMealType: groups by id w/ name fallback, custom NOT merged into Other,
  sort by sort_order (999 fallback), unmatched -> 'other' group
- useMealTypes filters is_visible + sorts by sort_order; defaultMealTypeId via default_time
- MealTypeSettingsScreen invalidates mealTypesQueryKey on change
- FoodEntryAdd payload uses meal_type_id (effectiveMealId)
- defaultMealTypeForTime (shared) considers custom types with default_time; hidden excluded via useMealTypes
- FoodSummary label: system -> t(), custom -> literal (local switch)
- getMealPercentage keyed by name (matches web contract)

## Gaps to fix
1. getMealTypeLabel (constants/meals) returns hardcoded EN — used in 6+ UI spots. Add centralized
   getMealTypeDisplayLabel(name, t) in mealNutrition.ts; switch UI usages.
2. Diary -> MealTypeDetail passes only NAME (MealTypeKey). Need mealTypeId + mealLabel + date.
   Navigation MealTypeDetail gains mealTypeId?: string.
3. FoodSummary onPressMealType passes group.name only -> need mealTypeId too.
4. MealTypeDetail filters by name via filterFoodEntriesByMealType -> add ID-first filter helper.
5. FoodSearch -> FoodEntryAdd has NO mealTypeId param -> add optional mealTypeId override.
6. MealTypeDetail has no "Add food" action -> add header action passing mealTypeId to FoodSearch.
7. CopyMealSheet matches target by NAME (state = name); backend /food-entries/copy requires NAMES only
   (verified server route: sourceMealType/targetMealType required, matched by name case-insensitive).
   -> UI selects by ID, payload sends name (only accepted format). Document backend limitation.
8. getMealPercentage tests missing (system/custom/rename/0/missing).

## UX decision (C1 §5)
- Keep existing Diary UX: only non-empty sections render (incl. custom).
- Custom categories reachable via picker (FoodEntryAdd) + new MealTypeDetail "Add food" action.
- Hidden categories: never in picker; historical entries in hidden categories still show (grouped by id).
