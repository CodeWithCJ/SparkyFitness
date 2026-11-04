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

Logging is already close to dedicated strength apps such as Caliber, MacroFactor Workouts and Built With Science. The gap is structure: those apps hand you a multi-week program and steer it week to week, while SparkyFitness gives you the tools to build one yourself. These items close that gap without proprietary content or algorithms.

### 5. Strength program library

**Gap:** Users can build workout presets and plans, but there is no set of ready-made strength programs to start from. Run programs already have this.

**Proposal:** A library of programs written for the project from generic, well-known methods (beginner full body, upper/lower, push/pull/legs, top set plus back-off sets and double-progression hypertrophy blocks, 3 to 6 days a week). Ship them as CC0 data files in the repo so people can add programs by pull request, with no branded program names or copied text. Reuse the run-program engine for the calendar, keeping your place and scheduling workouts into the diary.

**Size:** Medium.

### 6. Mesocycles and deloads

**Gap:** Progression works one workout at a time. There are no multi-week blocks and no planned deloads.

**Proposal:** Programs run in blocks with RIR targets that tighten each week (for example 3, 2, 1, then a deload week). Offer an early deload when lifts stall or the post-workout feedback shows high fatigue. Document the rules so anyone can check why a target changed.

**Size:** Medium. It builds on the existing progression and workout feedback.

### 7. Weekly set targets per muscle

**Gap:** Training Consistency shows sets per muscle this week against last week, but not whether that is enough.

**Proposal:** A target range of weekly hard sets per muscle, with defaults from published research (cited) that the user can edit, flags for muscles under or over the range, and suggestions that aim for it.

**Size:** Small.

### 8. Gym profiles

**Gap:** Available equipment is a single list, so swaps and plans can't follow you between a home gym, a work gym and travel.

**Proposal:** Named equipment profiles that filter alternatives, presets and the program generator. Pick one when starting a workout.

**Size:** Small.

### 9. Program generator

**Gap:** People who don't want to choose a program have to build one by hand.

**Proposal:** Build a program from days per week, session length, goal, equipment profile and muscles to prioritise, using documented rules over the existing exercise metadata (primary muscles, equipment, movement pattern). The AI assistant can explain or adjust the result but is not required. Depends on items 7 and 8.

**Size:** Large.

### 10. Strength standards and strength score

**Gap:** Personal records and estimated 1RM are shown on their own, with no reference point.

**Proposal:** Percentiles for the main lifts by sex, bodyweight and age, derived from the public-domain OpenPowerlifting dataset with the source shown, rolled up into per-muscle-group and overall scores. Add balance checks such as push against pull and quad against hamstring. Use our own method, not another app's scoring formula.

**Size:** Medium.

### 11. Adjusting the week around missed or short sessions

**Gap:** Swapping an exercise works, but skipping or shortening a session doesn't change the rest of the week.

**Proposal:** A "short on time" option that keeps the main lifts and drops accessories, and moving a missed session forward so the week stays balanced.

**Size:** Medium.

### 12. Per-lift and per-muscle progress views

**Gap:** Trends exist but are spread across reports.

**Proposal:** Estimated 1RM and volume trend lines per lift with plateau markers, and a body part strength view. Mostly interface work on data that is already stored.

**Size:** Small.

### 13. Exercise guidance

**Gap:** Instructions and demonstration video links exist, but coverage is uneven on common lifts. Commercial apps use their own licensed video libraries, which an open-source project can't copy.

**Proposal:** Fill image and instruction gaps from free-exercise-db (public domain) and wger (CC-BY-SA, with attribution kept), add short form-cue lists written by contributors, and keep user-supplied video links.

**Size:** Medium, mostly content.

### 14. Import from Strong and Hevy exports

**Gap:** People switching from these apps want their history. Check what the existing Hevy integration and exercise history CSV import already cover first.

**Proposal:** Column mappings for the Strong and Hevy CSV exports, using the existing exercise history import.

**Size:** Small.

## Out of scope

- **Paid human coaching.** SparkyFitness has no paid tier. Family & Friends sharing already lets a trainer view a client's data.
- **Celebrity-authored programs and licensed video libraries.** Programs and media come from contributors under open licences instead.
- **A curated, verified food database.** The project relies on the food providers you configure rather than maintaining its own database.
- **Social feeds and challenges.** Sharing is delegated caregiver access, not a community.
