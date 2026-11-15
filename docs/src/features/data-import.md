# Importing your data

SparkyFitness provides generic CSV importers for bringing your history in from other apps: **Food Diary**, **Workout History**, and **Check-in & Health Data**. The importers parse the file in your browser and let you map your file's columns to the expected fields, so the same importer works for many sources — including exports from MyFitnessPal, Flo, Hevy, and others.

Everything lives in **Settings → Data Import**, where each importer is a labelled row with an **Import** button. These are one-time migration tools, which is why they live in Settings rather than on the daily screens.

## Common to all importers

All three importers share the same workflow and controls:

- **Loading** — upload a CSV (**Upload CSV**, max 25 MB) or paste its contents and press **Parse Text**. A **Download Template** button provides a sample file with the expected headers.
- **Format bar** — delimiter, decimal separator, and quote character are auto-detected from the file and can be overridden individually, for files whose separators differ from the defaults.
- **Column mapping** — most columns are auto-detected from the header row. Headers are normalized before matching (ignoring case, underscores, spaces, and punctuation, and stripping parenthetical units, so `Protein (g)` matches `Protein`), and common aliases are recognized: `Carbohydrates` → `carbs`, `Fiber` → `dietary_fiber`, `Sugar` → `sugars`, `Date` → `entry_date` (Workout History). Matching is by name only, never by position or content, so a column that can't be auto-matched is left unmapped rather than guessed. When a required column can't be matched, a mapping dialog appears and you assign the file column to the expected field by hand.
- **Editable preview** — after loading (and confirming the mapping), the parsed rows appear in an editable table where you can fix cells, **Add Row**, or **Clear Data** before submitting. Food Diary and Check-in & Health Data have this editable preview; **Workout History**'s preview is read-only (it shows the parsed entries as text, not editable controls), so to correct a value there you edit the CSV file and process it again.

## Food Diary

Logs past meals to your food diary by date and meal type, matching or creating foods as needed.

Field reference:

| Field | Required | Type | Description |
| --- | --- | --- | --- |
| `date` | Yes | Date (`YYYY-MM-DD`) | The day the meal was logged. |
| `meal_type` | Yes | Text | Matched against your meal types (`breakfast`, `lunch`, `dinner`, `snacks`, or custom), case-insensitively; a value that matches none fails the import with `Invalid meal type`, so select an existing meal type for any unmatched value before importing. |
| `meal_name` | No | Text | Groups rows into a named meal — see [Meal grouping](#meal-grouping). |
| `food_name` | Yes* | Text | The food to match against your library or create. *Not needed when [importing as meal totals](#importing-per-meal-totals-aggregate-files). |
| `brand` | No | Text | Optional brand, used to improve matching. |
| `quantity` | Yes* | Number | Amount per the unit. *Not needed when importing as meal totals. |
| `unit` | Yes* | Text | Matched against the known unit list (`g`, `kg`, `mg`, `oz`, `lb`, `ml`, `l`, `cup`, `tbsp`, `tsp`, `piece`, `slice`, `serving`, `can`, `bottle`, `packet`, `bag`, `bowl`, `plate`, `handful`, `scoop`, `bar`, `stick`, `whole`); a value that matches none is stored as-is (kept unchanged), so correct an unmatched unit before importing. |
| `calories`, `protein`, `carbs`, `fat`, `saturated_fat`, `polyunsaturated_fat`, `monounsaturated_fat`, `trans_fat`, `cholesterol`, `sodium`, `potassium`, `dietary_fiber`, `sugars`, `vitamin_a`, `vitamin_c`, `calcium`, `iron` | No | Number | Standard nutrients; fill any subset you have. |
| *(any other column)* | No | Number | Any column beyond the base set is treated as a custom nutrient by its header name. |

### Meal grouping

Rows are grouped into meals by `meal_name`:

- **No `meal_name`** — the row is logged as a single food entry (its food is matched or created and logged directly).
- **With `meal_name`** — rows sharing the same date, meal type, and name are combined into one meal, each row becoming a food within that meal. If a saved meal with that name exists it is expanded; otherwise a new ad-hoc meal is created.

### Importing per-meal totals (aggregate files)

Some exports (most notably MyFitnessPal) give **one row per meal** with nutrient totals and no food name, quantity, or unit. When the importer detects this — the `food_name`, `quantity`, and `unit` columns all unmapped while at least one nutrient is mapped — it shows an **Import as meal totals** option, turned on by default. With it enabled, each row is logged as a single serving of a meal named after its type, carrying that row's nutrient totals, so the per-meal summary imports without inventing individual foods. Turn it off to import such rows the normal way.

### Matching and overrides

Food Diary-specific options (the other importers don't create or match foods, so they have no equivalent), shown in the review screen alongside the editable table:

- **Match food names against** — *My Items* (always on), plus optional **Family** and **Public** scopes. A row whose name matches a food in a ticked scope logs against that food; a name that matches nothing (or matches only outside the ticked scopes) creates a new food from the row's nutrient columns.
- **Override existing food nutrition with imported values** — when a row matches one of your own foods, rewrite that food's stored nutrition with the imported values instead of just logging it. Enabling this disables Family/Public matching, since overriding only applies to your own foods.

> [!NOTE]
> **Re-importing a file.** Single food entries are de-duplicated on re-upload (matched by the row's content *and* position), so importing the exact same file twice won't double them — but a reordered or modified file may partially duplicate. Grouped meals are *not* de-duplicated at all: re-importing a meal group creates a fresh copy of the meal. Import once, or clear the diary before re-importing.

## Workout History

Imports past workouts, sets, reps, and weights. The system creates new exercises or presets if they don't exist, and imports your entries, sets, and activity details.

Field reference:

| Level | Field | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Workout | `entry_date` | Yes | Date (`YYYY-MM-DD`) | The day the workout was performed. |
| Workout | `exercise_name` | Yes | Text | The exercise to match against your library or create. |
| Workout | `exercise_force` | Yes | Text | `pull`, `push`, or `static`. |
| Workout | `exercise_level` | Yes | Text | `beginner`, `intermediate`, or `expert`. |
| Workout | `exercise_mechanic` | Yes | Text | `isolation` or `compound`. |
| Per-set | `set_number` | No | Number | Which set the row describes. |
| Per-set | `reps` | No | Number | Reps for the set. |
| Per-set | `weight` | No | Number | Weight for the set. |
| Per-set | `duration_min` | No | Number | Duration in minutes (for timed sets). |
| Per-set | `rest_time_sec` | No | Number | Rest after the set, in seconds. |

**Activity Field** and **Value** are custom fields you can add to each entry.

## Check-in & Health Data

Imports body measurements, sleep, vitals, activity, hydration, and mood. The importer has a category selector, and the expected columns depend on the category:

| Category | Field | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Body Measurements | `date` | Yes | Date | The day of the measurement. |
| Body Measurements | `weight` | No | Number | Body weight. |
| Body Measurements | `weight_unit` | No | Text | Unit for `weight`. |
| Body Measurements | `body_fat` | No | Number | Body-fat percentage. |
| Body Measurements | `height`, `neck`, `waist`, `hips` | No | Number | Circumferences/height. |
| Body Measurements | `length_unit` | No | Text | Unit for the length fields. |
| Sleep | `date` | Yes | Date | The night of sleep. |
| Sleep | `bedtime`, `wake_time` | No | Time | Sleep window. |
| Sleep | `duration_in_seconds`, `time_asleep_in_seconds` | No | Number | Total duration and time asleep. |
| Sleep | `deep_sleep_seconds`, `light_sleep_seconds`, `rem_sleep_seconds`, `awake_sleep_seconds` | No | Number | Time per stage. |
| Sleep | `sleep_score` | No | Number | Overall score. |
| Sleep | `stage_events` | No | Text | Raw stage event sequence. |
| Sleep | `source` | No | Text | Where the data came from. |
| Vitals & Custom | `date` | Yes | Date | The day of the reading. |
| Vitals & Custom | `type`, `value`, `unit` | No | Text/Number | Which vital, its value, and unit. |
| Vitals & Custom | `source`, `notes` | No | Text | Origin and free-form notes. |
| Daily Activity | `date` | Yes | Date | The day of the activity. |
| Daily Activity | `type`, `value`, `unit` | No | Text/Number | Which metric, its value, and unit. |
| Daily Activity | `source` | No | Text | Origin. |
| Hydration | `date` | Yes | Date | The day. |
| Hydration | `value`, `unit` | No | Number/Text | Amount and unit. |
| Hydration | `source` | No | Text | Origin. |
| Mood | `date` | Yes | Date | The day. |
| Mood | `mood_value` | No | Number | Mood score. |
| Mood | `mood_tags` | No | Text | Comma-separated mood tags. |
| Mood | `notes` | No | Text | Free-form notes. |

Each category has a downloadable template and a set of accepted values shown in the UI.

## Migrating from MyFitnessPal

MyFitnessPal's file export is a **Premium / Premium+** feature — free accounts can't download the CSVs (they can print a report or share their diary, but that's not the same as the export).

**Getting the export.** Request it from the app (**More** → **Nutrition**/**Progress** → **Export**) or the website (**Reports** → **Export**), pick a date range, and confirm your email. MyFitnessPal emails the ZIP to your account email. For the current, authoritative steps, see [MyFitnessPal's export guide](https://support.myfitnesspal.com/hc/en-us/articles/360032273352-Export-your-nutrition-progress-and-exercise-data) — their menus shift from time to time.

**What's in the ZIP — and how well each file imports.** Three CSVs (named `<Type>-Summary-<date-range>.csv`), each feeding one of the generic importers. Support differs by file: the importers match columns by name, and MFP's column names line up with some importers' expected fields better than others.

- `Nutrition-Summary-…` → **Food Diary** — **best support.** MFP's `Protein (g)`, `Carbohydrates (g)`, `Fiber`, `Sugar`, `Meal`, and `Date` all map automatically. Caveat: the export is one row per *meal* (nutrient totals, no individual foods), so the importer's **Import as meal totals** mode (see [Importing per-meal totals](#importing-per-meal-totals-aggregate-files)) is what makes it work — each meal's totals land as a single serving, not per-food entries.
 - `Measurement-Summary-…` → **Check-in & Health Data** — **works; tested with weight.** MFP's measurement file has `Date` and `Weight` with no unit column, so the **unit guard** forces you to declare the weight unit before import. Declare the unit the column is actually in (kg or lb); Check-in converts the value to kg from that unit, so `177 lb` lands as `80.3 kg` rather than being stored as `177 kg`. Weight imports cleanly; the other measurement fields (height, neck, waist, hips) use the same path but haven't been exercised against real MFP data.
 - `Exercise-Summary-…` → **Workout History** — **limited.** Only `Date` and `Exercise` (the activity name) match the importer's expected fields. The importer *does* support `calories_burned`, `distance`, `reps`, `weight`, `duration_min`, `rest_time_sec`, `entry_notes`, and set fields, but it reads them by their canonical column names and the header-mapping dialog only exposes the required fields — so MFP's `Exercise Calories`, `Exercise Minutes`, `Sets`, `Reps Per Set`, `Pounds`, `Steps`, and `Note` don't match and are dropped as-is. The import yields a list of activity names with dates, not the calories, duration, steps, sets, or weight the export contains. To recover any of them, rename the column to the matching canonical name (e.g. `Exercise Calories` → `calories_burned`, `Note` → `entry_notes`) in the CSV before processing; values that don't match a supported field are still dropped. Two caveats if you do recover them: Workout History stores `weight` in your profile's weight unit **without converting**, so renaming a `Pounds` column to `weight` while your unit is kg stores pounds as kg — convert the values first; and it expects one row per set with a valid `set_number`, so an MFP `Sets` count (total sets) is not a set number and can't be used as one. Useful for seeding a rough activity history; not a faithful exercise-log import.

Unzip the file, then import each CSV into its matching importer. The header matching above absorbs most of the differences; any remaining column is mapped by hand in the mapping dialog. Dialogs list the importer's standard fields — Food Diary additionally lists your defined custom nutrients, while arbitrary extra columns are read by their file name (rename a custom-nutrient header to the nutrient's name to match it). Two dialogs list only required fields: **Workout History** (its optional fields — calories, distance, notes, … — aren't in it, so rename those columns to their canonical names first) and **Sleep** (its optional `record_timezone` / `record_utc_offset_minutes` columns are dropped through the mapping path; keep them only by importing without the dialog, i.e. with all required headers already canonical).

> [!NOTE]
> The MyFitnessPal export is a summary, not a detailed log, and the import reflects what the export contains — shaped by how well each file's column names match the importer's expected fields. The import can't produce detail the export doesn't have, and (for exercise) only recovers columns whose names match a supported field (rename them first if needed, as above).

## Why the importers are generic

SparkyFitness favors generic importers over per-vendor parsers. Imports are typically a one-time migration, so the payoff of a robust parser for a single vendor is small; and vendor export formats change over time, and headers vary by account language, so a parser built for one vendor tends to break and needs constant upkeep. The generic importers are maintained centrally, and the header-mapping dialog is the escape hatch: when a column can't be auto-matched, you map it by hand there. Dialogs list the importer's standard fields (Food Diary also lists your defined custom nutrients); the Workout History and Sleep dialogs list only required fields, so Workout History's optional fields must be renamed to their canonical names first, and Sleep's `record_timezone` / `record_utc_offset_minutes` columns are kept only by importing without the dialog (all required headers already canonical).

For any app — MyFitnessPal, Flo, Hevy, and so on — the workflow is the same: export your data, then import it through the generic importers, mapping columns as needed.

## Related pages

- [Check-In](/features/check-in)
- [Measurements](/features/measurements)
- [Food Database Manager](/features/food/food-database-manager)
- [Exercise Database Manager](/features/exercises/exercise-database-manager)
- [User Settings](/features/user-settings)
