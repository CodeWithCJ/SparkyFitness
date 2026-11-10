# Calculation Settings

This page explains how BMR formulas, body fat algorithms, daily energy adjustments, and calorie deficit targets are calculated in **SparkyFitness**.

---

## 1. Basal Metabolic Rate (BMR) Algorithms

Your Basal Metabolic Rate (BMR) represents the energy your body requires to perform basic life-sustaining functions at rest. SparkyFitness supports multiple clinical formulas to estimate BMR:

| Algorithm                       | Required Inputs             | Best For                          | Formula                                                                                   |
| :------------------------------ | :-------------------------- | :-------------------------------- | :---------------------------------------------------------------------------------------- |
| **Mifflin-St Jeor** _(Default)_ | Age, Gender, Height, Weight | General population                | Male: `10W + 6.25H - 5A + 5`<br>Female: `10W + 6.25H - 5A - 161`                          |
| **Revised Harris-Benedict**     | Age, Gender, Height, Weight | Historical comparison             | Male: `13.397W + 4.799H - 5.677A + 88.362`<br>Female: `9.247W + 3.098H - 4.33A + 447.593` |
| **Katch-McArdle**               | Weight, Body Fat %          | Individuals with tracked body fat | `370 + 21.6 × LBM`<br>_(LBM = Lean Body Mass)_                                            |
| **Cunningham**                  | Weight, Body Fat %          | Highly athletic/muscular builds   | `500 + 22 × LBM`                                                                          |
| **Oxford**                      | Weight, Gender              | Varied age groups & demographics  | Male: `14.2W + 593`<br>Female: `10.9W + 677`                                              |

_Note: Weight (`W`) is in kg, Height (`H`) is in cm, and Age (`A`) is in years._

### Measured BMR

If a smart scale or a connected health app reports a BMR, SparkyFitness can use that
measured value for that day instead of the formula above, and the calculation
breakdown on the Diary labels it **Measured**.

This is **off by default**. Turn on **Use measured BMR from check-ins and synced
devices** in Calculation Settings to enable it; until you do, your chosen formula
is always used.

- **It counts only on the day it was recorded.** A measured BMR is never carried
  forward. Days without a reading fall back to your chosen formula, so turning the
  sync off restores the formula the next day — you do not have to delete anything.
- **Implausible readings are ignored.** A value must fall between 600 and 6,000
  kcal. When your profile is complete enough to produce a formula estimate, it must
  _also_ land within 60–160% of that estimate; if it is not — for example when
  height or date of birth is missing — the absolute bounds decide on their own. A
  partial-day figure or a mis-mapped metric is discarded and the formula is used
  instead. The second check matters because a value can look reasonable on its own
  and still be impossible for your body.
- **Readings for a day that has not finished are refused.** Some providers report
  BMR as a running daily total rather than a rate, so a sync partway through the
  day hands back part of the day's figure. Only completed days are accepted.
- **It also sets your safety floor.** The Standard Adaptive Safety Floor uses the
  higher of your RMR and the clinical minimum, and your measured BMR _is_ that RMR
  when one is available. So a measured value that differs from the formula moves
  the floor under your calorie goal, not just the estimate above it.

To stop using measured values, turn the setting off in Calculation Settings. That
covers every source at once. You can also disable BMR sync at the provider — on
Apple Health and Health Connect that is a per-metric setting, so you can keep
syncing weight and body fat while dropping BMR. Garmin has no per-metric control,
which is why the Calculation Settings toggle exists.

---

## 2. Body Fat Algorithms

Body Fat Percentage is used directly in lean-mass BMR formulas (Katch-McArdle/Cunningham). SparkyFitness can estimate body fat percentage from your measurements using two algorithms:

### U.S. Navy Method

Uses circumferences to estimate body fat. Measurements are converted to inches for the standard formula:

- **Males:** `86.01 × log10(waist - neck) - 70.041 × log10(height) + 36.76`
- **Females:** `163.205 × log10(waist + hips - neck) - 97.684 × log10(height) - 78.387`

### BMI Method

Uses height, weight, and age to estimate body fat:

- **Males:** `1.2 × BMI + 0.23 × Age - 16.2`
- **Females:** `1.2 × BMI + 0.23 × Age - 5.4`
- _(where `BMI = Weight (kg) / Height (m)²`)_

---

## 3. Daily Calorie Goal Adjustment

This setting determines **how physical activity changes your calorie budget** throughout the day. On the web each option is a card; the full explanation of the one you pick, and any settings that belong to it (the earn-back percentage, activity level, Device Projection options), appear under the cards.

- **Adaptive TDEE:** Estimates expenditure from matching food and weight observations, then introduces changes gradually. Only completed weight days enter the fit. Today's weigh-in can first enter tomorrow's fit; food after that measurement needs a later weigh-in to close its interval. The formula baseline and plausibility band still use the latest profile weight/height snapshot: logging today's weight can therefore change the displayed result when the estimate refreshes, including for historical dates. Historical dates use the settings saved for each day.
  - **Expenditure (Adaptive TDEE):** On the Diary page, "Expenditure" represents your calculated Total Daily Energy Expenditure (TDEE). This is the baseline number from which your deficit/surplus is subtracted.
  - **Evidence needed:** A complete calculation needs at least 2 measured weight dates spanning 14 days, plus 14 qualifying food dates with ≥200 kcal between those measurements, inside a 28-day lookback. The first weight day is included; the final weight day is excluded. Two weights 14 days apart therefore need all 14 intervening daily food intervals. Weight change is fitted to the actual observation dates; missing weight days are not filled or counted. Three regular weekly readings can qualify with MEDIUM confidence; minimal two-reading evidence remains LOW. Before usable evidence exists, the baseline is `BMR × Activity Multiplier`.
  - **Matching food and weight:** `Raw TDEE = Regression-weighted daily intake - (Observed daily weight change in kg × 6,000 kcal/kg)`. Food and activity receive the same positive daily interval weights used by the weight-rate regression, from the first fitted weight date (included) to the last (excluded). Food outside that measured period has no effect on the calculation. With day-only records, this assumes weigh-ins represent a consistent time at day boundaries; a final weigh-in cannot be explained by food eaten afterwards. A new complete calculation is learned only on another completed weight day with enough matching food history.
  - **Unknown food days and bias:** Food dates below 200 kcal are omitted and the remaining weights are renormalized, rather than filling unknown days with zero. This assumes the missing weighted intake resembles the logged intake. Unlogged higher-intake days can bias inferred expenditure **down**; genuine unmarked fasting days can bias it **up** when they are omitted. A qualifying day can still be incomplete. The calculation does not identify fasting or verify that food logs are complete.
  - **Plausibility cap and gradual changes:** Each complete calculation is capped to within ±500 kcal of `BMR × Activity Multiplier`. It is held for 14 days, then its difference from the formula baseline fades over 7 days. The displayed expenditure averages the last 28 daily calculation, hold, fade or formula inputs. Held evidence stays the same while the displayed average can continue converging. The breakdown shows one status and the observed weight rate; **Calculation details** opens the evidence dates, weighted intake, raw arithmetic, cap and history adjustment.
  - **Readiness for target advice:** The latest calculation's confidence is insufficient on its own. The full filtered history must contain 28 learned contributions whose source confidence is not LOW, whose evidence was no older than 10 days on the day it contributed, and whose raw value was uncapped, with no faded inputs. Earlier low-confidence, stale or capped evidence can keep the status at **Still adjusting** even when the latest calculation looks settled. Numerical calorie budgeting continues to use the gradual estimate. These are advice-eligibility checks, not proof that lag or noise has disappeared.
  - **Upgrading an existing adaptive target:** The revised estimator reconstructs its history from saved logs; it does not carry over the older version's estimate. Existing TDEE and calorie targets can therefore change immediately on upgrade, in either direction, beyond the 36 kcal/day limit. Short or sparse history may now use the formula fallback or an average that still includes formula inputs. Longer existing histories can already fill all 28 contributions on the first calculation. For example, with no earlier history, a fixed 2,400 kcal/day formula and an old 2,900 kcal/day estimate, 14 logged food days and two weights only 7 days apart fall back to 2,400. Twenty completed consecutive daily weight/food records at stable weight and 2,900 kcal intake instead give about 2,507 kcal/day: six learned contributions and 22 formula inputs. These are synthetic examples, not personal target recommendations; the stability bound does not compare outputs from different algorithm versions.
  - **Daily movement:** Within this estimator version, with an unchanged formula baseline and unchanged past records, the conservative bound for rounded displayed estimates is 36 kcal/day (about 151 kJ/day); the unrounded mean bound is `1,000 ÷ 28 ≈ 35.714 kcal/day`. A birthday, a change in measured BMR availability/value, profile/settings changes, or corrected/backfilled records can recalculate the result and are outside that bound. **Activity Level** sets both the formula baseline and plausibility band, and can hold an estimate down if set too low.

    **The full response takes weeks.** The averaging window is only one source of delay; fitting weight changes and carrying/fading old evidence also contribute. In final-source synthetic tests with consistent daily weigh-ins and complete food logs, a new logger's full initial estimate took **42 days (about 6 weeks)**. In a separate lasting expenditure-step scenario (2,600 → 2,300 kcal/day, intake held at 2,600 and formula baseline at 2,400), half the response appeared by day **28**, 90% by **42**, and the full response by **55 (about 8 weeks)**. The first eligible calculation starts influencing the budget earlier; a full initial estimate means the startup formula inputs have left the average. Sparse logs, caps and changed baselines can behave differently; an out-of-band value cannot be reached while capped. These are engineering benchmarks, not clinical validation or personal predictions.

    The 28-day stability window trades faster response for more noise. A synthetic 1 kg scale-only level shift still produced a transient error peaking near **214 kcal/day**, recovering by day 55; averaging reduced the peak without eliminating the artifact. This is a stability policy, not a water or tissue detector, and its time thresholds are engineering choices.

    **Why retain 6,000 kcal/kg?** It is the existing shared compatibility assumption, rather than a universal density for body fat, water or every kilogram of scale-weight change. [Hall (2008)](https://pubmed.ncbi.nlm.nih.gov/17848938/) explains why the energy deficit per kilogram lost varies with initial body composition and the amount lost; it does not validate a universal 6,000 value. Composition and direction can change the error: when the true deficit per kilogram lost exceeds this assumption, the formula understates inferred expenditure; water-driven loss can bias it the other way. The app cannot separate these components from scale weights.

    [Shiose et al. (2016)](https://pubmed.ncbi.nlm.nih.gov/27231310/) measured increased body water after carbohydrate loading. [Hall & Chow (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3127505/) discuss uncertainty when inferring energy intake changes from weight measurements; their model does not validate this expenditure calculation. [Bhutani et al. (2017)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5506524/) found that two-week fluctuations in participants not deliberately changing weight were predominantly fat-free mass, mainly water. The [NIDDK Body Weight Planner research](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner) uses a separate dynamic model of body-weight change. These sources support caution, not certainty about an individual's weight change or the app's thresholds.

- **Dynamic Goal:** Increases your budget as you burn active calories or take steps (adds exercise directly back to your budget).
- **Fixed Goal:** Your calorie target remains completely static, ignoring daily exercise.
- **Percentage Earn-Back:** Adds back a custom percentage (e.g., 50%) of active calories burned to create a buffer against device calorie over-estimations.
- **Device Projection:** Uses the cumulative **Total Calories** value (resting plus active energy) synced from Health Connect, Garmin or Polar. When more than one of them has a total for the same day, one is used, never a sum, in this order: Health Connect, Garmin, Polar. Apple Health totals are not used yet. For the current day, it projects that value from its dedicated source capture time to midnight and treats the result as your live TDEE; completed days use the recorded total without extrapolation. Goal Mode is then applied directly: for example, a projected TDEE of 2,400 kcal becomes 2,400 kcal at Maintain, 2,160 kcal at Body Recomposition (-10%), or 2,640 kcal at Lean Bulk (+10%). On Android, enable **Total Calories** in the app's Health Connect sync settings; Garmin and Polar send it with their daily summary. To use Garmin's figure while the phone also syncs, turn off Total Calories in the phone's sync settings; days the phone already synced keep its figure. When that value is unavailable, too early, or implausible for a complete daily total, SparkyFitness falls back to BMR plus projected active calories.

> [!NOTE]
> [Calorie cycling](#calorie-cycling) works only with **Adaptive TDEE**, **Fixed Goal**, or Dynamic / Percentage Earn-Back with Adaptive full-day targets. The other modes already raise your budget on the days you log exercise, so cycling on top would count your training twice.

> [!NOTE]
> If you use [Nutrient Goal Direction](/features/goals)'s **Target range** for calories, note that Adaptive, Dynamic, Percentage Earn-Back, and Device Projection all recalculate your calorie goal value regularly — a manually entered target band won't move with it. Target range for calories works best paired with **Fixed Goal**.

---

### Percentage macro goals and exercise

**Adjust percentage macro goals with exercise calories** is available in web
Calculation Settings and mobile Calorie Settings. It is off by default.

When enabled, protein, carbohydrate and fat gram targets use your saved percentage
split and the positive exercise calories credited by your calorie adjustment mode.
For example, a 2,000 kcal goal plus 500 credited exercise calories uses 2,500 kcal
for the macro calculation. With 50% exercise earn-back, it uses 2,250 kcal instead.
The existing fiber calorie allocation is preserved; fiber and micronutrient targets
do not increase.

Fixed goals and goals entered directly in grams stay unchanged. Adaptive targets
that already include activity do not earn it back again; **Count activity calories
separately** can credit that day's resolved activity once. Device Projection uses
the positive exercise-attributable increase above its no-activity budget and the
base goal, without adding the workout again. Resting-only projection changes are
not added as exercise.

Targets follow the selected diary date and update when activity is edited, removed
or synced. The saved base goals and percentage split remain unchanged. Changes to
this option apply from today in your timezone, alongside the other recorded
calorie settings. Earlier days keep their own on/off choice: enabling it does not
raise past macro targets, and disabling it does not remove past exercise credit.
Turning it off restores the existing macro calculation from today onward.

## 4. Goal Mode & Caloric Deficits

**Goal Mode** adjusts your baseline calorie target. Select **Weekly weight change** to enter a desired weekly change directly, or keep one of the existing percentage-based modes.

### Weekly Weight Change

Choose **Maintain**, **Lose weight**, or **Gain weight**. The weekly entry starts in your profile's weight unit: kilograms, pounds, or stone and pounds. You can also choose grams; for example, **500 g/week** and **0.5 kg/week** represent the same setting. Changing only the display unit keeps the saved rate unchanged. Maintain uses a zero adjustment. Existing percentage goals stay selected until you explicitly switch modes.

SparkyFitness converts the signed weekly change into a daily calorie adjustment using the same energy-density assumption as its Adaptive TDEE and projected weight-change calculations:

`daily adjustment = weekly change in kg × energy density (kcal/kg) ÷ 7`

Loss subtracts calories; gain adds them. The daily adjustment stays the same when the baseline changes. The requested weekly rate is an estimate, not a guarantee of measured weight change. The configured safety floor still limits weekly targets with either calculation method, so the effective projected change can be smaller than the requested rate. The input accepts up to 2 kg (2,000 g, about 4.409 lb) in either direction per week, to gram precision; this is an input limit, not a recommended rate. Pound and stone/pound entries are converted to kilograms and rounded to the nearest gram for storage. For example, 1 lb/week is stored as 0.454 kg/week.

This choice works with Adaptive Goal, Dynamic Goal, Fixed Goal, Percentage Earn-Back, and Device Projection. The selected calculation method still determines the non-device baseline, while each goal adjustment mode keeps its existing handling of activity. Device Projection applies the weekly daily adjustment once to its projected device TDEE.

### Percentage-Based Modes

The existing presets and custom percentage remain available. **Positive adds calories, negative cuts them.** Switching back to them restores percentage-based behavior; the saved weekly amount is ignored until Weekly weight change is selected again.

| Goal Mode              | Adjustment          | Target Purpose                                   |
| :--------------------- | :------------------ | :----------------------------------------------- |
| **Maintain**           | 0%                  | Weight maintenance                               |
| **Body Recomposition** | -10%                | Gain muscle while losing fat simultaneously      |
| **Cut**                | -15%                | Steady fat loss                                  |
| **High Cut**           | -20%                | Aggressive fat loss                              |
| **Lean Bulk**          | +10%                | Muscle gain with minimal fat gain                |
| **Bulk**               | +20%                | Faster weight gain                               |
| **Manual**             | Custom (-40% – 40%) | Personalized rate; enter -15 to cut, +15 to gain |

### Rate of Change Guidance

The app rates your projected rate of change, and the safe range is not symmetric:

- **Weight loss:** up to ~1.0% of body weight per week is comfortable; above 1.5% is flagged as excessive.
- **Weight gain:** up to ~0.25% per week is comfortable; above 0.5% is flagged, because past that point the extra weight is predominantly fat rather than muscle.

Gain is deliberately much slower than loss. Muscle growth is limited by training and recovery, not by how large the surplus is.

### Calculation Methods

- **Adaptive Method:** Applies the deficit to your Calculated Adaptive TDEE (falling back to BMR × activity multiplier if history is insufficient).
- **Manual Method:** Applies the deficit to your manually entered calorie target.

With the **Adaptive Method**, the default baseline represents the whole day's
expenditure. **Dynamic Goal** and **Percentage Earn-Back** therefore do not add
exercise, background-step calories, or BMR to this target again. Remaining calories
are the calculated food target minus intake. Activity and net energy are still
reported separately. This also applies while Adaptive uses its fallback estimate.
**Device Projection** keeps its explicit full-day projection behavior. With the
**Manual Method**, Dynamic and Percentage Earn-Back continue to credit activity.
If BMR cannot be calculated, the stored manual target and its earn-back behavior
remain in use.

### Count activity calories separately

**Dynamic Goal + Adaptive Method** offers an optional **Count activity calories
separately** switch. It is off by default. When enabled, SparkyFitness subtracts
regression-weighted historical activity calories from the raw full-day adaptive estimate,
then applies the BMR-based plausibility limits and the same hold, fade and
28-day averaging policy independently to that baseline. Its history adjustment
can differ from the full-day estimate's adjustment. Goal Mode and
the selected safety floor apply to the filtered baseline. Today's activity calories from
steps and workouts are then credited once; BMR is not credited again, even when
**Include Resting Calories** is enabled for net-energy reporting.

Until there is enough food and weight history, the baseline uses **BMR × Activity
Multiplier**. Choose the activity level to describe activity outside the steps
and workouts you credit separately. Consistent food, weight, step and workout
history matters: missing or exaggerated historical activity changes the learned
baseline. On qualifying food dates inside the fitted period, days without recorded
activity contribute zero. Dates outside that period or without qualifying food
are omitted from both weighted means. The two paths also have independent
history-quality checks: activity-only capping does not disable otherwise eligible
full-day target advice. The estimated full-day Adaptive TDEE remains
visible for reference; it is distinct from the baseline used for this option.

On the web, press **Save Preferences** to apply a change; server-derived preview
values use saved settings until refreshed. Mobile saves the switch immediately.
Switching to another mode or the Manual Method preserves your choice but makes
it inactive. Percentage Earn-Back continues to suppress extra activity credit
under the Adaptive Method.

Device Projection always uses the projected device TDEE as the live baseline for the selected Goal Mode; the calculation-method selector controls the saved non-device baseline and previews used by the other modes.

### Use Move ring for active calories

On iPhone, SparkyFitness can read your active calories from the Move ring instead
of the Apple Health Active Energy total, so they match the Fitness app. This is
**off by default**. Turn on **Use Move ring for active calories** in Calories &
BMR on the iPhone app; the setting is saved to your account.

- **The ring is built from your Apple Watch and iPhone.** Workouts other apps save
  to Apple Health can add to it too.
- **Days without a ring keep the Active Energy total**, for example when Activity
  access is off in Apple Health.
- **It applies to days synced after the change.** Earlier days keep what they had
  until they sync again.

### Calorie cycling

Calorie cycling gives you more calories on training days and fewer on rest days, while your **weekly total stays the same**: your daily target × 7. It sits on top of everything above, so the days keep following your Adaptive TDEE and Goal Mode. It is **off by default**.

Turn it on under **Calorie cycling** in Calculation Settings on the web, or the **Calorie Cycling** card in Calories & BMR on the mobile app:

- **Off:** the same target every day.
- **Training / rest:** choose your training days (1 to 6) and how much extra they get, for example +15%.
- **Custom:** set each weekday from −40% to +40%.

The percentages you choose are balanced so the week still adds up. With Mon, Wed and Fri at +15% and a 2,600 kcal target, training days get about 2,810 kcal and rest days about 2,440 kcal; the seven days still total 18,200 kcal.

The week is shown as a bar chart: one bar per day, with a dashed line at your daily target and a dotted line at your safety floor. Green bars get more than your target, amber bars less, and today is marked with a dot.

- **Tap a bar** to see that day. Tapping never changes it.
- **Training / rest:** tap the icon under a day (a dumbbell or a moon) to switch it between training and rest. On the phone, tap the day name.
- **Custom:** drag a bar up or down on the web, or drag the handle on top of a bar on the phone. On the web, the arrow keys also move the selected day by 1% (Shift for 5%).
- **Fine-tune the selected day** below the chart with **−** and **+** (1% at a time) or by typing a value. In Training / rest, this is where you switch the day and set the training-day boost.
- **The day card** shows the selected day's target, whether it is a training or rest day, and the change against your daily target. On the web, the Live Preview below follows the selected day too.

The week total under the chart shows the seven days against your daily target × 7. On the phone each change is saved as you make it (a drag when you let go); on the web, press **Save Preferences**.

- **Carbs take the change.** Protein normally stays the same and carbs take the extra or missing calories (4 kcal per gram). Only a low day bigger than all of that day's carbs takes the rest from fat, and only beyond fat from protein (for instance if the safety floor is disabled with an extreme protein split), so your macros never add up to more than the day's calories (assuming your baseline macros matched your daily target).
- **The safety floor still applies.** A rest day is never set below your [safety floor](#_5-metabolic-safety-floors). If one would be, it is held at the floor and the difference comes off the other days, so the week still matches.
- **Each day follows that day's target.** Every day is worked out from its own target. While your target stays the same and your cycling pattern does not change midweek, the week totals your target × 7 (give or take a few calories of rounding). When your target moves during the week (for example as Adaptive TDEE updates), cycling is enabled/adjusted midweek, the safety floor moves, or an active weekly plan overrides specific days, the week can differ from 7 × today's target.
- **Skipping a training day changes nothing.** Targets come from the weekday, not from logged workouts. If you miss Monday's session you can still eat Monday's amount and the week balances out, or move the session and adjust yourself.
- **Weekly goal plans come first.** On a day an active [weekly goal plan](/features/goals#goal-presets-and-weekly-plans) sets, that plan's preset is used and cycling is paused.
- **Past days keep their targets.** A change applies from today, like every other calculation setting.

In the Diary the calorie goal shows **High day +210** or **Low day −160**, and the target breakdown includes the cycling step. When cycling is on, the calorie field on the Goals page is your **base** calories: the target before cycling.

---

## 5. Metabolic Safety Floors

SparkyFitness shows two recommended safety limits for calorie goals:

1.  **Resting Metabolism (RMR) Floor:** Your target should not fall below your resting metabolic rate.
2.  **Absolute Clinical Floor:** 1,200 kcal for biological females; 1,500 kcal for biological males.

> [!IMPORTANT]
> **Adaptive Safety Floor:**
>
> - **Standard (default):** The higher of your estimated RMR and the sex-specific clinical minimum is enforced. If an Adaptive or Weekly weight change target falls below it, SparkyFitness raises the target and explains which limit bound.
> - **Custom minimum:** Replaces the Standard floor with a calorie value you choose. This can be below or above the recommended limits; those recommendations and health warnings remain visible.
> - **Disabled:** Does not automatically raise Adaptive or Weekly weight change targets. The calculated target is used as-is, while recommended limits and health warnings remain visible.
> - Under the **Manual** method, percentage-based targets are **not automatically raised**, but a prominent warning banner is displayed warning you that your budget is in an unsafe range. **Weekly weight change** targets use the configured floor with either calculation method.

With [calorie cycling](#calorie-cycling) on, the floor also applies to each cycled day under either method: a low day is held at the floor and the other days give up the difference. A disabled floor does not hold cycled days.

Under the Adaptive method the floor applies whenever the calculated target falls below it. That is almost always a deficit, but a surplus can trip it too: if your entire maintenance sits below the clinical minimum, even a gain goal is raised to that minimum.

> [!TIP]
> If a goal mode appears to have no effect, the Standard floor is binding. With the fallback estimate (TDEE = RMR × activity multiplier) and RMR as the binding half, the floor bites once your deficit exceeds roughly `1 - 1/activityMultiplier` — about 17% at **Sedentary** (×1.2), and 0% at **None** (×1.0), where every deficit mode returns the same target. Once Adaptive learns from your logs, the limit depends on how far its gradual expenditure estimate sits above your RMR.
>
> Check your **Activity Level** and profile data: they set the formula baseline and the ±500 kcal plausibility band used throughout Adaptive's gradual calculation. An understated level can hold the estimate down. If your target has been agreed with a qualified clinician and still falls below the Standard floor, choose a **Custom minimum** or **Disabled**. Very small adults may find the clinical minimum sits above their own maintenance. Very low calorie targets can carry health risks and may require medical supervision.

---

## 6. Nutrient Calculation Algorithms

These pickers choose a formula for suggesting gram targets for certain nutrient goals, based on your calorie goal, age, and sex:

- **Fat Breakdown Algorithm** (AHA Guidelines / Keto-Adapted / Mediterranean): suggests how to split total fat into saturated, polyunsaturated, monounsaturated, and trans fat.
- **Mineral Calculation Algorithm** (RDA Standard / Athletic Performance / Heart Health): suggests sodium, potassium, calcium, and iron targets.
- **Vitamin Calculation Algorithm** (RDA Standard / Immune Support / Antioxidant Focus): suggests Vitamin A and C targets.
- **Sugar Calculation Algorithm** (WHO Guidelines 10% max / Low-Carb-Keto 5% max / Balanced 15% max): suggests a target for the built-in **Total Sugar** goal, as a percentage of your daily calories.

This is different from the **Added Sugars** auto-calculate control described in [Goals → Tracking Added Sugars](/features/goals) — that one computes a limit for a separate, user-created "Added Sugars" custom nutrient using WHO/AHA guidelines, not this Total Sugar percentage.
