# SparkyFitness Roadmap

This is a proposed roadmap, not a commitment. It lists gaps people notice when they move to SparkyFitness from dedicated nutrition coaching apps (such as MacroFactor) and strength training apps (such as Caliber), ordered roughly by value for effort. Each item should get its own issue and maintainer approval before work starts, as `CONTRIBUTING.md` asks for new features.

For how SparkyFitness compares with other apps today, see [How SparkyFitness Compares](docs/src/features/comparison.md).

## Already covered

These are sometimes listed as gaps but already exist, so they are not on this roadmap:

- Adaptive TDEE (expenditure estimated from intake and weight trend)
- Nutrition label scanning, food photo estimates and AI-assisted logging
- Per-nutrient goal directions (minimum, maximum or range), custom nutrients, goal presets and different goals per weekday
- Workout presets and plan templates, supersets, RPE, rest timers, a plate calculator and progression suggestions
- Personal records and estimated 1RM
- Muscle-group recovery and exercise-variety scoring
- Apple Watch and Wear OS apps, and home screen widgets on iOS and Android
- Progress photos, check-ins and habits

## Nutrition

### 1. Target adjustment from Adaptive TDEE

**Gap:** Adaptive TDEE estimates expenditure, but calorie and macro targets only change when the user edits them. Coaching apps recalculate targets every week towards a goal rate.

**Proposal:** An optional weekly check-in that shows the current expenditure estimate and offers new targets for a chosen rate of change (for example, lose 0.5% of body weight per week). The user accepts, edits or skips the change. Nothing changes without their consent, and the existing goal history records each accepted change.

**Size:** Medium. The expenditure calculation already exists; most of the work is the check-in flow on web and mobile.

### 2. Timeline diary view

**Gap:** The diary is grouped by meal only. A timeline view, ordered by time of day, makes quick logging and reviewing intake through the day faster.

**Proposal:** An optional diary layout that orders entries by logged time, with quick-add at any point.

**Size:** Small to medium.

### 3. First-class recipes

**Gap:** Recipes come through meals and Mealie/Tandoor import, not a dedicated recipe manager.

**Proposal:** Recipes with ingredients, yield and per-serving nutrition, plus import from a recipe URL.

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
