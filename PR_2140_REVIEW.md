# Comprehensive Code Review: PR #2140

**PR Title:** Fix adaptive TDEE energy density mismatch and add weight gain support  
**PR URL:** https://github.com/CodeWithCJ/SparkyFitness/pull/2140  
**Target Branch:** `dev`  
**Review Date:** August 16, 2026  
**Reviewer:** Antigravity AI Pair Programmer  

---

## 1. Executive Summary

PR #2140 is a high-quality, impactful change that addresses fundamental calculation discrepancies and missing feature capabilities across the adaptive calorie engine:

1. **Standardizes energy density** across calculation models and UI projections to $6{,}000\text{ kcal/kg}$ (fixing #2128).
2. **Adds first-class weight gain support** with `lean_bulk` ($+10\%$) and `bulk` ($+20\%$) goal modes, signed manual adjustments, and gain-specific rate-of-change safety thresholds.
3. **Flips custom percentage orientation** so positive values represent surpluses ($+$ adds food) and negative values represent deficits ($-$ cuts food), aligning with user intuition.
4. **Surfaces safety floor diagnostics** instead of silently clamping small-stature users' calorie targets.
5. **Fixes onboarding state loss** where activity level, goal mode, and body fat estimates were previously discarded.

Overall, the core mathematical models, database migrations, and domain refactorings are solid. However, our deep-dive review identified **several technical flaws, UI edge-case rendering bugs, and standard-practice deviations** that should be addressed before merging to production.

---

## 2. Strengths & Positive Architectural Decisions

- **Domain Unification:** Centralizing `ENERGY_DENSITY_KCAL_PER_KG` in `@workspace/shared` eliminates the previous split where `AdaptiveTdeeService` assumed $6{,}000\text{ kcal/kg}$ while UI projections assumed $7{,}700\text{ kcal/kg}$.
- **Physiologically Grounded Safety Thresholds:** Gaining weight carries much tighter safety boundaries ($0.25\% / 0.5\%$ body weight/week) than losing weight ($1.0\% / 1.5\%$) because muscle hypertrophy is biologically rate-limited and excess surplus is stored primarily as adipose tissue.
- **Actionable Safety Floor Feedback:** Surfacing `clampedFloorSource` ('rmr' vs 'absolute') and `maxFeasibleDeficitPercent` gives clear, constructive guidance to users whose targets are adjusted by the adaptive safety floor.
- **Onboarding End-to-End Persistence:** Properly persisting `activityLevel`, `goalMode`, and initial `body_fat_percentage` prevents new accounts from inadvertently defaulting to sedentary maintenance.
- **Migration & Test Coverage:** Includes unit and integration tests covering migration safety, signed percentage arithmetic, and safety floor bounds.

---

## 3. Detailed Findings: Flaws, Edge Cases & Deviations

### Finding 1 (Technical Flaw): Redeclared Interface & Bypassed Flag in `CalorieTargetBreakdown.tsx`

* **Location:** [CalorieTargetBreakdown.tsx](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/components/CalorieTargetBreakdown.tsx#L19-L28) and [L583-L596](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/components/CalorieTargetBreakdown.tsx#L583-L596)
* **Severity:** Medium
* **Issue:** 
  `CalorieTargetBreakdown.tsx` declares its own local `CalorieTargetResult` interface instead of importing the canonical `CalorieTargetResult` type from `@workspace/shared`. Because of this, it omitted `wasClampedToFloor` from its local definition and re-implemented a manual clamping heuristic:
  ```tsx
  // Current implementation in CalorieTargetBreakdown.tsx:
  {previewResult.finalTarget === Math.round(targetSafetyFloor) &&
  Math.round(targetBaseline * (1 - deficitPct)) < targetSafetyFloor ? (
    <span className="text-amber-600 dark:text-amber-400 font-medium">
      ⚠️ Daily budget was automatically raised to safety floor limit.
    </span>
  ) : ...}
  ```
* **Risk:** This duplicates clamping logic and can drift if rounding or floor rules in `computeCalorieTarget` evolve.
* **Recommendation:** Import `CalorieTargetResult` directly from `@workspace/shared` and use `previewResult.wasClampedToFloor` directly.

---

### Finding 2 (UI/Logical Flaw): Negative Zero & "Deficit" Label on 0% Manual Adjustment

* **Location:** [CalorieTargetBreakdown.tsx](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/components/CalorieTargetBreakdown.tsx#L531-L559)
* **Severity:** Low-Medium
* **Issue:**
  When `goalMode === 'manual'` and `goalModeCustomPercentage === 0`:
  1. `goalMode === 'maintain'` is `false`, so it enters the custom mode branch.
  2. `previewResult.isGainGoal` is `false` (since `0 < 0` is false).
  3. The label renders as `"Goal Deficit:"` and the line formats to:
     ```
     Goal Deficit: manual Deficit (-0%) = -0 kcal
     ```
  While `CalculationSettings.tsx` added guard logic (`previewResult.appliedDeficit === 0 ? '' : ...`), `CalorieTargetBreakdown.tsx` did not include this guard.
* **Recommendation:** In `CalorieTargetBreakdown.tsx`, check if `deficitPct === 0` (or `calculatedDeficitAmount === 0`) and render neutral sign/text:
  ```tsx
  {deficitPct === 0 ? '' : previewResult.isGainGoal ? '+' : '-'}
  ```

---

### Finding 3 (Technical Flaw): Floating Point Input Rejection in Calculation Settings

* **Location:** [CalculationSettings.tsx](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx#L1134-L1160) & [preferenceService.ts](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessServer/services/preferenceService.ts#L78-L84)
* **Severity:** Medium
* **Issue:**
  In `CalculationSettings.tsx`, the custom percentage input parses raw string to a float with `const parsed = Number(raw)`. If a user types a float (e.g. `12.5` or `-7.5`):
  1. Frontend state accepts `12.5`.
  2. Saving sends `goal_mode_custom_percentage: 12.5` to `PUT /api/preferences`.
  3. Backend validation (`preferenceService.ts` line 80: `!Number.isInteger(pct)`) and Zod schema (`UserPreferences.zod.ts`: `z.number().int()`) reject the request with HTTP 400 Bad Request.
  4. The user receives a generic toast error *"Failed to save calculation settings"* with no indication why.
* **Recommendation:**
  1. Add `step="1"` to the HTML `<Input>` in `CalculationSettings.tsx`.
  2. In `onChange`, round or truncate to integer: `const parsed = Math.round(Number(raw));` or reject non-integers on blur.

---

### Finding 4 (Standard Practice Deviation): Non-Standard Age Calculation in `calculateBasePlan`

* **Location:** [nutritionCalculations.ts](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/utils/nutritionCalculations.ts#L623-L626)
* **Severity:** Low-Medium
* **Issue:**
  `calculateBasePlan` computes user age as:
  ```ts
  const age = new Date().getFullYear() - birthDate.getFullYear();
  ```
  This is inaccurate by 1 year for any user whose birthday has not yet occurred in the current calendar year.
* **Recommendation:**
  Use the canonical `calculateAge(formData.birthDate)` helper exported by `@workspace/shared` (which is already used consistently throughout `DailyProgress.tsx`, `CalculationSettings.tsx`, and `useDailyProgress.ts`).

---

### Finding 5 (Database Migration Safety): Non-Idempotent Sign Flip Migration

* **Location:** [20260816173934_flip_goal_mode_custom_percentage_sign.sql](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessServer/db/migrations/20260816173934_flip_goal_mode_custom_percentage_sign.sql#L20-L22)
* **Severity:** Low (Mitigated by migration tracking table)
* **Issue:**
  The migration executes:
  ```sql
  UPDATE public.user_preferences
  SET goal_mode_custom_percentage = -goal_mode_custom_percentage
  WHERE goal_mode_custom_percentage <> 0;
  ```
  If executed more than once (e.g. during replay, test setup, or manual execution), negating an already negated value flips it back to positive.
* **Recommendation:** While SparkyFitness's migration runner uses a tracking table, defensive migration design should guard against double execution:
  ```sql
  UPDATE public.user_preferences
  SET goal_mode_custom_percentage = -goal_mode_custom_percentage
  WHERE goal_mode_custom_percentage > 0;
  ```
  *(Under the legacy schema, stored values were strictly in $[0, 40]$; values $>0$ represent unmigrated legacy deficits).*

---

### Finding 6 (Code Semantics): Semantic Mismatch in Constant Naming for Gain Projections

* **Location:** [calorieConstants.ts](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/shared/src/constants/calorieConstants.ts#L28-L38) & [calorieCalculations.ts](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/shared/src/utils/calorieCalculations.ts#L526)
* **Severity:** Low (Code Cleanliness)
* **Issue:**
  `ENERGY_DENSITY_KCAL_PER_KG` defines only a `LOSS: 6000` property. However, `calorieCalculations.ts` uses `ENERGY_DENSITY_KCAL_PER_KG.LOSS` for both weight loss and weight gain projections:
  ```ts
  const projectedWeeklyChangeKg =
    (dailyEnergyBalance * 7) / ENERGY_DENSITY_KCAL_PER_KG.LOSS;
  ```
* **Recommendation:**
  Either export a general constant `ENERGY_DENSITY_KCAL_PER_KG: 6000` or define `ENERGY_DENSITY_KCAL_PER_KG = { LOSS: 6000, GAIN: 6000 }` (or `DEFAULT: 6000`) so calling code reads naturally without implying a loss model is being applied to a surplus.

---

### Finding 7 (Type Safety): Narrow `activityLevel` Cast in `onboarding.ts`

* **Location:** [onboarding.ts](file:///Users/chandrasjr/Documents/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/utils/onboarding.ts#L57)
* **Severity:** Low
* **Issue:**
  In `SparkyFitnessFrontend/src/utils/onboarding.ts`:
  ```ts
  activityLevel: formData.activityLevel as 'light' | 'moderate' | 'heavy',
  ```
  The cast omits `'not_much'`, which is a valid option in `OnBoardingSteps.tsx` and in the shared `ActivityLevel` type.
* **Recommendation:** Use `formData.activityLevel as ActivityLevel`.

---

## 4. Cross-Package Rules & Monorepo Checklist Verification

| Checklist Item | Status | Notes |
| :--- | :---: | :--- |
| **Server Migration (`db/migrations/`)** | ✅ PASS | Created `20260816173934_flip_goal_mode_custom_percentage_sign.sql` |
| **RLS Policies (`rls_policies.sql`)** | N/A | No new tables or user-scoped entities created |
| **Database Backup (`db_schema_backup.sql`)** | ✅ PASS | Left untouched for CI automated sync |
| **Shared Zod Schemas (`shared/src/schemas/`)** | ✅ PASS | `UserPreferences.zod.ts` updated with new enums and signed range $[-40, 40]$ |
| **Developer Documentation** | ✅ PASS | `calculation-settings.md` thoroughly updated with models and guidance |
| **Date & Timezone Conventions** | ✅ PASS | Uses day strings and timezone helpers |
| **TypeScript Typing (`no any`)** | ✅ PASS | Explicit typing applied to preference validations; no `any` added |
| **Localization (`locales/en/`)** | ✅ PASS | Only `en/translation.json` modified; no machine-synced files edited |

---

## 5. Recommended Action Items (Quick Fixes)

```diff
--- a/SparkyFitnessFrontend/src/components/CalorieTargetBreakdown.tsx
+++ b/SparkyFitnessFrontend/src/components/CalorieTargetBreakdown.tsx
@@ -13,17 +13,10 @@ import { usePreferences } from '@/contexts/PreferencesContext';
 import { getEnergyUnitString } from '@/utils/nutritionCalculations';
 import {
   getGoalModeAdjustment,
+  CalorieTargetResult,
   ENERGY_DENSITY_KCAL_PER_KG,
 } from '@workspace/shared';
 
-interface CalorieTargetResult {
-  baselineTdee: number;
-  appliedDeficit: number;
-  rmr: number;
-  absoluteFloorValue: number;
-  finalTarget: number;
-  insufficientHistory: boolean;
-  isGainGoal: boolean;
-}
 
@@ -542,9 +535,11 @@ export const CalorieTargetBreakdown: React.FC<CalorieTargetBreakdownProps> = ({
               <span>
                 {goalMode}{' '}
                 {previewResult.isGainGoal
                   ? t('settings.breakdown.surplus', 'Surplus')
                   : t('settings.breakdown.deficit', 'Deficit')}{' '}
-                ({previewResult.isGainGoal ? '+' : '-'}
+                ({deficitPct === 0 ? '' : previewResult.isGainGoal ? '+' : '-'}
                 {Math.abs(Math.round(deficitPct * 100))}%) ={' '}
-                {previewResult.isGainGoal ? '+' : '-'}
+                {deficitPct === 0 ? '' : previewResult.isGainGoal ? '+' : '-'}
                 {Math.abs(
                   Math.round(
                     convertEnergy(calculatedDeficitAmount, 'kcal', energyUnit)
                   )
                 )}{' '}
                 {getEnergyUnitString(energyUnit)}
               </span>
@@ -583,9 +578,7 @@ export const CalorieTargetBreakdown: React.FC<CalorieTargetBreakdownProps> = ({
           {isAdaptiveMethod && (
             <div className="text-sm text-gray-500 italic mt-0.5">
-              {previewResult.finalTarget === Math.round(targetSafetyFloor) &&
-              Math.round(targetBaseline * (1 - deficitPct)) <
-                targetSafetyFloor ? (
+              {previewResult.wasClampedToFloor ? (
                 <span className="text-amber-600 dark:text-amber-400 font-medium">
                   ⚠️ Daily budget was automatically raised to safety floor
                   limit.
```

```diff
--- a/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx
+++ b/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx
@@ -1134,7 +1134,8 @@ const CalculationSettings = () => {
                 id="goal-mode-custom-percentage"
                 type="number"
+                step="1"
                 min={-MAX_GOAL_MODE_PERCENTAGE}
                 max={MAX_GOAL_MODE_PERCENTAGE}
                 value={customPercentageInput}
                 onChange={(e) => {
                   const raw = e.target.value;
                   setCustomPercentageInput(raw);
                   if (raw === '' || raw === '-') {
                     setGoalModeCustomPercentage(0);
                     return;
                   }
-                  const parsed = Number(raw);
+                  const parsed = Math.round(Number(raw));
                   if (Number.isNaN(parsed)) return;
                   setGoalModeCustomPercentage(
                     Math.min(
                       MAX_GOAL_MODE_PERCENTAGE,
                       Math.max(-MAX_GOAL_MODE_PERCENTAGE, parsed)
                     )
                   );
                 }}
```

```diff
--- a/SparkyFitnessFrontend/src/utils/nutritionCalculations.ts
+++ b/SparkyFitnessFrontend/src/utils/nutritionCalculations.ts
@@ -10,6 +10,7 @@ import {
   calculateBmr,
   computeCalorieTarget,
   goalModeFromPrimaryGoal,
+  calculateAge,
 } from '@workspace/shared';
@@ -623,8 +624,5 @@ export const calculateBasePlan = (
-  const birthDate = formData.birthDate
-    ? new Date(formData.birthDate)
-    : new Date();
-  const age = new Date().getFullYear() - birthDate.getFullYear();
+  const age = formData.birthDate ? calculateAge(formData.birthDate) : NaN;
```

---

## 6. Summary Conclusion

PR #2140 is structurally sound, mathematically well-founded, and brings substantial value to users tracking surplus and deficit goals. Addressing the items detailed above—particularly importing `CalorieTargetResult` in `CalorieTargetBreakdown.tsx`, sanitizing integer inputs in `CalculationSettings.tsx`, and fixing negative zero formatting—will ensure zero regressions and maintain the monorepo's strict quality standards.
