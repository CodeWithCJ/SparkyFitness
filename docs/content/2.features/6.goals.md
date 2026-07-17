# Goals

SparkyFitness allows you to set and track various fitness and nutrition goals, helping you stay motivated and monitor your progress.

---

## Nutrient Goal Direction (Minimum / Maximum / Target)

By default, every nutrient goal in SparkyFitness is treated as a **minimum** — a target to reach, with progress filling toward 100% as you approach it. That works well for protein or fiber, but it doesn't fit every nutrient or every person: someone managing high cholesterol wants cholesterol treated as a ceiling, not something to "fill up"; someone maintaining their weight wants calories treated as a range to stay near, not a bar to max out.

**Settings → Nutrient Goal Direction** lets you choose, per nutrient (predefined or custom), how progress should be judged:

- **Minimum** _(default for most nutrients)_ — more is better. Progress fills toward the goal; unchanged from the classic behavior.
- **Maximum** — less is better. The nutrient is shown as a limit to stay under: green with a checkmark while you're at or under the limit, red with an "Xg over" indicator once you exceed it. Cholesterol, sodium, saturated fat, trans fat, and Total Sugar default to Maximum out of the box; you can flip any nutrient back to Minimum, or set any other nutrient to Maximum, at any time.
- **Target range** — hit a band. You set a lower and upper bound (e.g. calories 1700–1900); the goal shows green while your total is inside the band, and amber/red outside it. Useful for calories when maintaining weight, or for precise macro tracking where being too far under is just as undesirable as being too far over.

A nutrient with no explicit choice saved simply uses its built-in default (Minimum, unless it's one of the five listed above) — nothing changes for existing goals until you visit the settings screen and pick something different.

This applies to the Diary page's Nutrition Summary card and to the Daily Energy Goal ring (for calories, when set to Target range).

---

## Tracking Added Sugars

SparkyFitness's built-in "Sugars" goal reflects **total sugar** (naturally occurring plus added), because that's what most food databases report per item. If you want to track **added sugars** specifically — sugar added during processing, as distinct from sugars naturally present in fruit or milk — create a custom nutrient (Settings → Custom Nutrients) named **"Added Sugars"** (matching the wording used on nutrition labels), set its Goal Direction to **Maximum**, and log it per food the same way you would any other custom nutrient.

### Auto-calculate a recommended limit

When editing goals for a custom nutrient that looks like an added-sugar tracker (recognized name variants: "Sugar(s)" or "Added Sugar(s)", singular or plural, case-insensitive) and is set to Maximum, an **Auto-calculate** control appears next to its goal field, offering three evidence-based options:

| Option | Basis | Formula |
| :--- | :--- | :--- |
| **WHO Ideal** | WHO's conditional recommendation for additional health benefit | 5% of your daily calorie goal ÷ 4 kcal/g |
| **WHO Maximum** | WHO's strong recommendation | 10% of your daily calorie goal ÷ 4 kcal/g |
| **AHA Fixed** | American Heart Association | 36g/day (men), 25g/day (women) — a flat guideline, not scaled by calories |

Picking an option fills in the computed gram value; you can still edit it manually afterward.

---

## Interactions with Calculation Settings

The Nutrient Goal Direction feature only changes how progress is *displayed* against whatever goal number already exists — it doesn't compute goal values itself (except the Added Sugar auto-calculate above). Two things to be aware of when combining it with [Calculation Settings](/features/settings/calculation-settings):

- **Calories in Target mode vs. Adaptive/Dynamic goals:** if your Daily Calorie Goal Adjustment is set to Adaptive, Dynamic, Percentage Earn-Back, or Device Projection, your calorie *goal value* recalculates regularly (e.g. as your Adaptive TDEE updates). A manually entered Target band for calories does **not** move with it — you'll need to revisit and adjust the band yourself if your adaptive goal shifts significantly. Target range for calories pairs best with a **Fixed** goal adjustment, where the goal value stays constant.
- **Two separate "sugar" calculations:** Calculation Settings' **Sugar Calculation Algorithm** (WHO Guidelines/Low-Carb-Keto/Balanced) computes a recommendation for the built-in **Total Sugar** goal. The **Auto-calculate** control described above is a distinct calculation for your **Added Sugars** custom nutrient. They share "WHO guidelines" terminology but target different fields with different percentages — check which one you're adjusting.
