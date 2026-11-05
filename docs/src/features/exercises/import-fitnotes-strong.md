# Import from FitNotes or Strong

You can bring your workout history over from FitNotes or Strong without editing the file.

## Export from the other app

- **FitNotes:** Settings → Spreadsheet Export → Export Workout Data. This gives a CSV with columns such as `Date`, `Exercise`, `Category`, `Weight (kgs)` or `Weight (lbs)`, `Reps`, `Distance`, `Time` and `Comment`.
- **Strong:** Settings → Export Data. This gives a CSV with columns such as `Date`, `Workout Name`, `Exercise Name`, `Set Order`, `Weight`, `Reps` and `Notes`.

## Import into SparkyFitness

1. On the web app, open **Settings → Data Import → Workout History (CSV)**.
2. Upload the file, or paste its contents, and process it.
3. SparkyFitness recognises the file by its columns. You see a message naming the app, and a preview of the sessions to import: one entry per exercise per workout day.
4. Check the preview and import.

## What is carried over

- Every set's reps, weight, distance, time and note.
- Strong's warm-up (`W`), drop (`D`) and failure (`F`) sets keep their set type. Strong's rest timer rows are skipped.
- The workout notes from Strong become the entry notes; the FitNotes category becomes the exercise category.
- Exercises you don't have yet are created as your own custom exercises.

## Units

FitNotes names its weight unit in the header, and newer Strong exports have a `Weight Unit` column; those are used as written. Older Strong exports have no unit, so their weights are read in your preferred weight unit. Everything is converted to your units when it is imported.

Dates are imported as the calendar day the other app recorded, without any time zone shift.

## Older servers

The import uses the same server endpoint as the standard workout history CSV, so it works with older servers too.
