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
