# SparkyFitness Roadmap

This is a proposed roadmap, not a commitment. It lists gaps people notice when they move to SparkyFitness from dedicated nutrition coaching apps (such as MacroFactor) and strength training apps (such as Caliber), ordered roughly by value for effort. Each item should get its own issue and maintainer approval before work starts, as `CONTRIBUTING.md` asks for new features.

For how SparkyFitness compares with other apps today, see [How SparkyFitness Compares](docs/src/features/comparison.md).

## Already covered

These are sometimes listed as gaps but already exist, so they are not on this roadmap:

- Adaptive TDEE (expenditure estimated from intake and weight trend), and an Adaptive goal method that sets the calorie target from it plus a weekly rate of change
- Nutrition label scanning, food photo estimates and AI-assisted logging
- Per-nutrient goal directions (minimum, maximum or range), custom nutrients, goal presets and different goals per weekday
- Workout presets and plan templates, supersets, RPE, rest timers, a plate calculator and progression suggestions
- Personal records and estimated 1RM
- Muscle-group recovery and exercise-variety scoring
- Apple Watch and Wear OS apps, and home screen widgets on iOS and Android
- Progress photos, check-ins and habits

## Nutrition

### 1. Weekly check-in for calorie targets

**Already built:** the Adaptive goal method (Settings > Calculation, web and mobile) keeps the calorie target in line with measured expenditure and a weekly kg/lb goal, and updates it continuously. A deterministic weekly review (`shared/src/utils/calorieTargetReview.ts`) works out whether the person is on track, the rate the current target implies, the rate the weight trend shows, and targets for a chosen rate. Today only the AI assistant and the MCP server (`sparky_review_calorie_target`) can show it.

**Gap:** Targets are either fully automatic (Adaptive) or fully manual. There is no in-app check-in where the user sees the review and decides, and the rate can't be set as a share of body weight.

**Proposal:** A check-in screen on web and mobile that shows the existing review and offers new targets. The user accepts, edits or skips. Add a rate option as percent of body weight per week (for example, lose 0.5%) and an optional weekly reminder. Accepted changes go into the existing goal history.

**Size:** Small to medium. The calculation exists; the work is the screen and the reminder.

### 2. Timeline diary view on mobile

**Already built:** the web diary has a timeline layout ordered by time of day (`SparkyFitnessFrontend/src/pages/Diary/DiaryTimeline.tsx`).

**Gap:** The mobile diary is grouped by meal only.

**Proposal:** Port the timeline layout to mobile, with quick-add at any point in the day.

**Size:** Small.

### Other nutrition gaps

Smaller or less certain items, not yet numbered. Each needs its own issue like the rest.

| Feature | Seen in | Approach |
| --- | --- | --- |
| Expenditure and trend-weight charts over time | MacroFactor | Store a weekly snapshot of the values already computed and chart them. Small. |
| Diet phases: cut, maintain and bulk blocks with dates, a target weight, a projected finish date, and macros that re-split when calories change | MacroFactor | Extend goal modes with dated phases and a projection from the current rate. Medium. |
| Faster logging: add several foods at once, quick-add calories or macros only, and copy a meal from another day on mobile | MacroFactor, MyFitnessPal | Interface work only. Small. |
| Micronutrient insights: weekly averages against goals and the foods that supply each nutrient | MacroFactor | Queries over diary data already stored. Small to medium. |
| Food data quality: a completeness score, reporting errors, and ranking complete entries first in search | MacroFactor, MyFitnessPal | Score entries from the configured providers by field completeness instead of curating a database. Medium. |
| Meal planner with a shopping list | MyFitnessPal, Built With Science | Build on meal plan templates and add up their ingredients. Lower priority because Mealie and Tandoor users already have this. Medium. |
| Short in-app explanations (how Adaptive TDEE works, how to set protein) | Built With Science, MacroFactor | Tips that link to the project's own docs. Small. |

### 3. First-class recipes

**Gap:** Recipes come through meals and Mealie/Tandoor import, not a dedicated recipe manager.

**Proposal:** Recipes with ingredients, yield and per-serving nutrition, plus import from a recipe URL by reading the schema.org `Recipe` data that recipe sites publish.

**Size:** Medium to large.

### 4. Offline logging on mobile

**Gap:** The mobile apps need the server to log anything. This matters most on hosted instances and on poor connections.

**Proposal:** A local queue for food, exercise and measurement entries that syncs when the server is reachable, with clear conflict handling.

**Size:** Large.

## Strength training

### 5. Starter program library

**Gap:** Users can build workout presets and plans, but there is no set of ready-made programs to start from.

**Proposal:** A small library of well-known programs (beginner full body, upper/lower and push/pull/legs splits) shipped as plan templates the user can copy and edit.

**Size:** Small to medium. It reuses the existing plan template system.

### 6. Strength standards

**Gap:** Personal records and estimated 1RM are shown on their own, with no reference point.

**Proposal:** Compare estimated 1RM against bodyweight-relative strength standards by sex and age for the main lifts, with the source of the standards shown.

**Size:** Small to medium.

### 7. Exercise guidance

**Gap:** Some exercises have instructions, but coverage is uneven and there are no demonstrations.

**Proposal:** Fill instruction gaps for common exercises and support linking a demonstration image or video per exercise.

**Size:** Medium, mostly content.

## Out of scope

- **Paid human coaching.** SparkyFitness has no paid tier. Family & Friends sharing already lets a trainer view a client's data.
- **A curated, verified food database.** The project relies on the food providers you configure rather than maintaining its own database.
- **Social feeds and challenges.** Sharing is delegated caregiver access, not a community.
