# Technical Specification: Adaptive TDEE Calculator (Retrospective Mode)

## 1. Objective

Implement a weight-trending "Adaptive TDEE" calculator that empirically determines a user's maintenance calories by correlating historical calorie intake with actual body weight changes. This feature bypasses the inaccuracies of wrist-based activity trackers.

---

## 2. Mathematical Algorithm (The Core)

The algorithm calculates TDEE over a **Rolling Window** (Default: 28 days).

### 2.1. Data Preparation

- **Window**: Today - 28 days.
- **Inputs**:
  - `DailyCalories[]`: Array of calorie sums per day.
  - `WeightEntries[]`: Array of [(date, weight_kg)](file:///c:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx#172-216) pairs.
- **Preprocessing**:
  - **Weight Interpolation**: Since users weigh in inconsistently, perform linear interpolation to fill gaps between entries.
  - **Weight Smoothing**: Apply a 7-day Simple Moving Average (SMA) to the interpolated weight data to derive the `WeightTrend`.
  - **Calorie Filtering**: Ignore days with 0 calories logged (assumed missing data) unless the user specifically logs a "Fast".

- **Window**: `[Today - 28 days, Today]`.
- **Inputs**: 
    - `DailyCalories[]`: Array of calorie sums per day.
    - `WeightEntries[]`: Array of [(date, weight_kg)](file:///c:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx#172-216) pairs.
- **Preprocessing (The "Secret Sauce")**:
    - **Step 1: Interpolation**: Users weigh in inconsistently. Use `linear interpolation` to create a virtual weight entry for every single day in the window. 
        - If today is Mar 10 and the last weigh-in was Mar 5 (80kg) and before that Mar 1 (79kg), the slope is 0.2kg/day. Mar 6-9 are filled with 80.2, 80.4, etc.
    - **Step 2: 7-Day SMA Smoothing**: Apply a 7-day Simple Moving Average (SMA) to the *interpolated* data. This filters out "noise" (water weight/bloat).
    - **Step 3: Calorie Filtering**: 
        - Days with `SUM(calories) < 200` (configurable threshold) should be marked as "Missing Data" and excluded from the average calculation to prevent dragging down the TDEE unfairly.
        - If > 25% of the window is "Missing Data", set `Confidence = LOW`.

### 2.2. The Energy Balanced Formula
1. **Weekly Rate of Change (RoC)**: [(WeightTrend[today] - WeightTrend[today - 7])](file:///c:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx#172-216) (or over the whole window divided by weeks). 
2. **Maintenance TDEE**: 
   `TDEE = (Avg_Daily_Intake) - (Avg_Daily_Weight_Change_kg * 7700)`
   *(Note: 7700 kcal is the approximate energy density of 1kg of human body fat/tissue).*

---

## 3. Backend Implementation (SparkyFitnessServer)

### 3.1. [NEW] `services/AdaptiveTdeeService.js`
- **Method**: `calculateAdaptiveTdee(userId)`
- **Data Fetching**:
    - Fetch user `age`, `gender`, `height` from `profiles` (for fallback).
    - Fetch `activity_level` from `user_preferences`.
- **Logic Flow**:
    1. Try to fetch 35 days of data (to allow for the 7-day smoothing startup).
    2. If sufficient data exists (at least 2 weight entries separated by > 7 days), run the **Adaptive Algorithm**.
    3. **Fallback Logic**: If data is insufficient (new user), use the standard formula:
       `Fallback_TDEE = BMR(weight, height, age, gender) * Activity_Multiplier`
- **Activity Multipliers (Constants)**:
    - `sedentary`: 1.2
    - `lightly_active`: 1.375
    - `moderately_active`: 1.55
    - `very_active`: 1.725
    - `extra_active`: 1.9

### 3.2. [NEW] `routes/adaptiveTdeeRoutes.js`
- `GET /api/adaptive-tdee`: Returns the object containing `tdee`, `confidence`, `weightTrend`, and `isFallback`.

---

## 4. Frontend Implementation (SparkyFitnessFrontend)

### 4.1. [MODIFY] [src/utils/calorieCalculations.ts](file:///c:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/utils/calorieCalculations.ts)
- **Goal Calculation**: 
  - If `adjustmentMode === 'adaptive'`:
    `Goal = fetchAdaptiveTdee() + calorieGoalOffset`
  - Ensure the `calorieGoalOffset` (e.g., -500 for weight loss) is still applied correctly on top of the adaptive baseline.

### 4.2. [MODIFY] [src/pages/Settings/CalculationSettings.tsx](file:///c:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Settings/CalculationSettings.tsx)
- **UI States**:
    - **Loading**: Show a pulsing skeleton.
    - **Active**: Show a card with:
        - Big Number: `2,540 kcal` (Adaptive Maintenance)
        - Subtext: "Based on your last 28 days of data."
        - Visualization: A small sparkline showing the Weight Trend vs Intake.
    - **Insufficient Data**: Show a progress bar: "Collecting data... 8/14 days logged. Keep weighing in!"

### 4.4. [MODIFY] `src/pages/Diary/DailyProgress.tsx`
- The "Energy Goal" display should show a small "(Adaptive)" badge next to the calorie number if enabled.

---

## 5. Implementation Vibe Checklist (For the implementation AI)
- [ ] Handle `lbs` vs `kg` conversion correctly (Store internally as kg, display as user pref).
- [ ] Use `date-fns` for robust date math.
- [ ] Cache the TDEE result in `localStorage` or `React Context` with a 1-hour TTL to prevent excessive API calls.
- [ ] Ensure the "Weight Trend" is what's displayed on the Diary, not just the raw last weight.
- [ ] The "Quality Score" should be visible to the user so they know *why* the TDEE might be fluctuating (e.g. "Low confidence: missed 4 days of logging").

---

## 6. Mathematical Edge Cases
- **The "Vacation" scenario**: User loses weight but also stops logging calories. 
    - *Defense*: If calories are 0, RoC should not be calculated for that day. 
- **The "First Day" scenario**: Fallback to BMR immediately.
- **The "Rapid Water Loss" scenario**: (e.g. starting Keto). RoC will be huge.
    - *Defense*: Cap the maximum possible TDEE adjustment to +/- 1000 kcal from BMR to prevent dangerous recommendations.

---

## 7. Database & Schema Context (For reference)

### `user_preferences` Table

- `calorie_goal_adjustment_mode` (TEXT): Now accepts `'adaptive'`.
- `activity_level` (VARCHAR): Used as a fallback if adaptive data is insufficient.

### `check_in_measurements` Table

- `weight` (NUMERIC): Primary source for trend analysis.
- `entry_date` (DATE): Sorting key.

### `food_entries` Table

- `calories` (NUMERIC): Summed per `entry_date`.

---

## 6. Verification & Edge Cases

### Test Scenarios

1. **Perfect Maintenance**: 2500 kcal intake + 0.0kg change = 2500 TDEE.
2. **Deficit**: 2000 kcal intake + 0.5kg loss/week ($\approx$ 3850 kcal deficit/week $\approx$ 550/day) = 2550 TDEE.
3. **Dirty Bulk**: 4000 kcal intake + 1kg gain/week = 2900 TDEE.
4. **No Weight Data**: Fallback to MSJ (Mifflin-St Jeor) formula multiplied by `activity_level`.
5. **Zero Logs**: Handle division by zero gracefully.

### Vibe Coding Tip

> [!IMPORTANT]
> Use `lodash` or simple reducers for the moving average. Ensure date comparisons account for time-zones (use the user's `timezone` from preferences).
