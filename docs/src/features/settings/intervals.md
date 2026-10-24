# Intervals.icu Integration

The Intervals.icu integration imports activities and daily wellness data from [Intervals.icu](https://intervals.icu) into SparkyFitness. If your watch already uploads to Intervals.icu (for example through Garmin Connect), it can be your single source for activities and wellness.

---

## Setup Instructions

### 1. Find your Athlete ID and API Key

1. Sign in to [intervals.icu](https://intervals.icu).
2. Open **Settings** and scroll to **Developer Settings**.
3. Note your **Athlete ID** (it starts with `i`, for example `i12345`).
4. Generate an **API Key** and copy it.

### 2. Connect in SparkyFitness

1. Go to **Settings → External Providers**.
2. Click **Add New Data Provider** and select **Intervals.icu**.
3. Enter your **Athlete ID** and **API Key**.
4. Click **Save**. SparkyFitness imports yesterday and today right away.
5. To sync automatically, edit the provider and set **Sync Frequency** to anything other than **Manual**.

---

## Data Synchronized

### Activities

Each Intervals.icu activity becomes one exercise entry: name, sport type (as the exercise category), date, moving time, distance, calories, average heart rate, and elevation gain (in the notes). Re-syncing updates the same entries instead of adding new ones.

- **Strava activities are skipped.** Intervals.icu cannot share activities it received from Strava through its API.
- **Garmin activities are skipped when Garmin is also connected.** If you have an active Garmin provider in SparkyFitness, activities that Intervals.icu received from Garmin Connect, or that you uploaded to Intervals.icu as a Garmin file (`<id>_ACTIVITY.fit`), are not imported, so the same run is not logged twice. Activities the Garmin import already holds are skipped too, even after you disconnect Garmin, and so is any activity that starts in the same minute as one already imported from Garmin (for example a Zwift ride that Zwift sent to both).
- **Duplicates clean themselves up.** If Intervals.icu imported an activity before the Garmin import stored its own copy, the next Intervals.icu sync covering that day removes the Intervals.icu copy and keeps Garmin's. Edits you made to the removed copy (such as notes) are lost.

### Wellness

| Intervals.icu | SparkyFitness |
|---|---|
| Weight, body fat, steps | Check-in measurements |
| Resting heart rate | Daily health summary |
| VO2 max | Daily health summary |
| HRV (rMSSD) | HRV samples |

Not imported: sleep (Intervals.icu has no bedtime), nutrition, fitness/fatigue/form (CTL/ATL), readiness, and the subjective scores (mood, soreness, and so on).

---

## Sync Schedule & Manual Controls

- **Daily Sync**: Once a day, SparkyFitness imports yesterday and today for every active Intervals.icu provider whose sync frequency is not **Manual**.
- **Sync Now / Sync Range**: Import any date range of up to 365 days from the provider card.

---

## Privacy & Security

> [!IMPORTANT]
> **Strictly Private**:
> * Intervals.icu credentials and data are strictly private (`is_strictly_private = TRUE`) and are **never** shared with family or friends through account sharing permissions.
> * The Athlete ID and API Key are encrypted at rest using AES-256-GCM.
