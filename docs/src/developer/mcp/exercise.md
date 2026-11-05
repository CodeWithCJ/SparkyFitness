---
title: Exercise Management Tool
description: Tool for tracking fitness activities and managing workouts.
---

# Exercise Management Tool (`sparky_manage_exercise`)

The `sparky_manage_exercise` tool is designed for comprehensive fitness tracking. It allows users and AI agents to search for exercises, log workouts (with multi-set support), manage routines, and view exercise history. If an exercise is not found, it can be automatically created.

**Tool Name:** `sparky_manage_exercise`

**Description:** Primary tool for fitness tracking. Use this to search for exercises, log workouts (multi-set support), manage routines, and view your exercise history. If an exercise is missing, it will be automatically created. Supports providing details across multiple turns.

## Actions

The `sparky_manage_exercise` tool supports the following actions:

### `search_exercises`

- **Description:** Searches for existing exercise definitions.
- **Parameters:**
  - `searchTerm` (string): Name or part of exercise name.
  - `muscleGroup` (string, optional): Muscle group to filter by (e.g., "Chest", "Biceps").
  - `equipment` (string, optional): Equipment to filter by (e.g., "Dumbbell", "None").

### `create_exercise`

- **Description:** Creates a new exercise definition.
- **Parameters:**
  - `name` (string): Full name for a new exercise.
  - `category` (string, optional): Category (e.g., "Strength", "Cardio").
  - `calories_per_hour` (number, optional): Estimated calories burned per hour.
  - `description` (string, optional): Description of the exercise.

### `log_exercise`

- **Description:** Logs an exercise performed by the user, including sets and reps if applicable.
- **Parameters:**
  - `exercise_id` (string, optional): UUID of the exercise.
  - `exercise_name` (string, optional): Name of the exercise to log (alternative to ID).
  - `entry_date` (string, YYYY-MM-DD): The date the exercise was performed.
  - `duration_minutes` (number, optional): Duration of the exercise in minutes.
  - `calories_burned` (number, optional): Calories burned during the exercise.
  - `notes` (string, optional): Any additional notes for the exercise.
  - `sets` (array of objects, optional): Details for multiple sets (e.g., for strength training).
    - Each set object includes: `reps` (number), `weight` (number, kg), `duration` (number, seconds), `rest_time` (number, seconds), `set_type` (enum: "Working Set", "Warmup", "Drop Set", "Failure").

### `list_exercise_diary`

- **Description:** Retrieves all logged exercise entries for a specific date, representing the user's exercise history.
- **Parameters:**
  - `entry_date` (string, YYYY-MM-DD): The date to retrieve the exercise diary for.

### `get_workout_presets`

- **Description:** Retrieves a list of available workout presets/routines.
- **Parameters:** None.

### `get_workout_preset`

- **Description:** Returns one preset in full: every exercise's ID, its sets, its superset group, and its progression and per-set ramp settings. Call this before `update_workout_preset` so the replacement list includes every exercise that should remain.
- **Parameters:**
  - `preset_id` (number, optional): Numeric ID of the workout preset.
  - `preset_name` (string, optional): Name of a preset you own or that is family-shared. Public presets outside those scopes must use `preset_id`.

### `log_workout_preset`

- **Description:** Logs a predefined workout preset to the user's exercise diary.
- **Parameters:**
  - `preset_id` (number, optional): Numeric ID of the workout preset.
  - `preset_name` (string, optional): Name of a preset you own or that is family-shared. Public presets outside those scopes must use `preset_id`.
  - `entry_date` (string, YYYY-MM-DD): The date the preset was performed.

### `update_workout_preset`

- **Description:** Updates a preset. Only the provided fields change. `exercises`, when provided, replaces the entire exercise list. Requires `confirmed=true`; without it the tool returns a prompt and does not change anything.
- **Parameters:**
  - `preset_id` (number): Numeric ID of the workout preset to update.
  - `confirmed` (boolean): Must be `true` to apply the update.
  - `name` (string, optional): New name.
  - `description` (string, optional): New description.
  - `is_public` (boolean, optional): Whether the preset is shared publicly.
  - `exercises` (array or JSON string, optional): Replacement list of `{exercise_id, sets?, superset_group?, progression_mode?, rep_goal?, increment_type?, increment_value?, equipment_brand?, ramp_increment?}`. A progression or ramp field left out keeps the exercise's current value (matched by `exercise_id`); `null` clears it.

  Progression and ramp fields (also accepted by `create_workout_preset`):

  - `progression_mode`: `rep_goal`, `fixed`, `step_load`, `double`, `triple`, or `manual` (off).
  - `rep_goal`: total reps (`rep_goal`, `step_load`), reps per set (`fixed`), or the top of the per-set rep range (`double`, `triple`).
  - `rep_range_min`: the bottom of the per-set rep range (`double`, `triple`).
  - `increment_type`: `weight` or `reps`.
  - `increment_value`: amount added once the goal is met; kilograms for `weight`, a rep count for `reps`.
  - `equipment_brand`: optional equipment or machine brand.
  - `ramp_increment`: kilograms added to each successive working set within one workout (negative ramps down). See [Progression & Per-Set Ramp](/features/exercises/progression-and-per-set-ramp).

### `delete_workout_preset`

- **Description:** Permanently deletes a workout preset. Requires `confirmed=true`; without it the tool returns a prompt and does not delete.
- **Parameters:**
  - `preset_id` (number): Numeric ID of the workout preset to delete.
  - `confirmed` (boolean): Must be `true` to delete.

### `delete_exercise_entry`

- **Description:** Deletes a specific exercise entry from the user's diary.
- **Parameters:**
  - `entry_id` (string): UUID of the exercise entry to delete.

### `suggest_alternatives`

- **Description:** Ranked substitutes for an exercise that train the same primary muscles, with the reason for each (same muscles, same equipment, same movement, done recently, in library). Draws on the user's library and, when their Free Exercise DB provider is active, the Free Exercise DB catalog (catalog results are not in the library yet; the user adds them from exercise search). See [Adaptive Coaching](/features/exercises/adaptive-coaching).
- **Parameters:**
  - `exercise_id` (string, optional): UUID of the exercise.
  - `exercise_name` (string, optional): Exact name, alternative to the ID.
  - `alternative_mode` (string, optional): `similar` (default, prefers the same equipment) or `different_equipment` (only exercises using none of its equipment).
  - `equipment` (string, optional): Comma-separated equipment the user has; results need nothing else.
  - `avoid_muscles` (string, optional): Comma-separated muscles to avoid, e.g. for an injury.
  - `limit` (number, optional): Maximum results (1–50, default 10).

### `rate_workout`

- **Description:** Records how a logged workout felt. The workout is identified by any exercise entry ID from `list_exercise_diary`. Only the fields given change; omitted fields keep what is already recorded (`difficulty: null` clears it, `pain: false` clears pain and its note). Adaptive suggestions use it next time: pain on a named exercise (`scope: exercise`) makes that exercise lighter, while pain on the whole workout without naming an exercise holds weight instead. Pain never adds load. Only workouts logged as sessions (presets or live workouts) can be rated.
- **Parameters:**
  - `entry_id` (string): UUID of an exercise entry in the workout.
  - `scope` (string, optional): `session` (default) rates the whole workout; `exercise` rates only this exercise.
  - `difficulty` (string, optional): `too_easy`, `just_right` or `too_hard`.
  - `pain` (boolean, optional): Pain or discomfort was felt; omit to keep what is recorded.
  - `pain_note` (string, optional): What hurt (max 500 characters; implies `pain=true`, cannot be combined with `pain=false`).

### `get_workout_coaching`

- **Description:** How the next session's suggestions will adapt to recent feedback, for one exercise or every exercise in a preset, with the reason for each (lighter after pain, hold after "too hard", a step up after "too easy" twice, variation hints). Reports when the user has turned adaptive suggestions off.
- **Parameters:**
  - `exercise_id` / `exercise_name` (string, optional): One exercise.
  - `preset_id` (number) / `preset_name` (string), optional: Every exercise in a workout preset.

