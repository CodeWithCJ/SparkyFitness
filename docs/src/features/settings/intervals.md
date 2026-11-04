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
4. Turn on **Activate this provider** and click **Add Provider**. SparkyFitness imports yesterday and today right away.
5. To sync automatically, edit the provider and set **Sync Frequency** to **Hourly**.

---

## Data Synchronized

### Activities

Each Intervals.icu activity becomes one exercise entry. Re-syncing updates the same entries instead of adding new ones, and keeps values you edited by hand.

| Intervals.icu | SparkyFitness |
|---|---|
| Name, sport type, start date and time | Exercise name, category, date and start time |
| Moving and elapsed time, distance | Duration, moving and elapsed time, distance |
| Calories | Calories burned |
| Average and max heart rate | Average and max heart rate |
| Average, max and moving speed | Speed |
| Cadence | Cadence, in steps per minute for runs, walks and hikes (Intervals.icu counts one foot, so the value is doubled) |
| Average and weighted average power, intensity, training load | Power, normalized power, intensity factor, training load (Intervals.icu's own load score) |
| Elevation gain and loss, lowest and highest altitude | Elevation (a loss of 0 is left empty, as virtual rides report) |
| Device and weather temperature | Temperature |
| Ground contact time, vertical oscillation, stride length (runs) | Running dynamics |
| Perceived exertion (1 to 10) | Workout effort |
| Heart rate zones | Time in each heart rate zone (only for 5-zone setups) |

- **Strava activities are skipped.** Intervals.icu cannot share activities it received from Strava through its API.
- **Garmin activities are skipped when Garmin is also connected.** If you have an active Garmin provider in SparkyFitness, activities that Intervals.icu received from Garmin Connect, or that you uploaded to Intervals.icu as a Garmin file (`<id>_ACTIVITY.fit`), are not imported, so the same run is not logged twice. Activities the Garmin import already holds are skipped too, even after you disconnect Garmin, and so is any activity that starts in the same minute as one already imported from Garmin (for example a Zwift ride that Zwift sent to both).
- **Duplicates clean themselves up.** If Intervals.icu imported an activity before the Garmin import stored its own copy, the next Intervals.icu sync covering that day removes the Intervals.icu copy and keeps Garmin's. Edits you made to the removed copy (such as notes) are lost.

### Wellness

| Intervals.icu | SparkyFitness |
|---|---|
| Weight, body fat, steps | Check-in measurements |
| Resting heart rate, VO2 max, floors climbed | Daily health summary |
| Fitness (CTL) and fatigue (ATL) | Daily health summary training load (chronic and acute, as whole numbers), plus their ratio |
| HRV (rMSSD and SDNN) | HRV samples |
| SpO2, respiration | SpO2 and respiration samples |

Not imported: sleep (Intervals.icu has no bedtime), blood pressure, blood glucose (no unit given), hydration (it would double-count water logged in SparkyFitness), nutrition (SparkyFitness can push it to Intervals.icu, so reading it back would loop), readiness, and the subjective scores (mood, soreness, and so on). Also not imported: GPS tracks and laps, and max power.

---

## Sync Schedule & Manual Controls

- **Hourly Sync**: Every hour, SparkyFitness imports yesterday and today for every active Intervals.icu provider whose sync frequency is not **Manual**.
- **Sync Now / Sync Range**: Import any date range of up to 365 days from the provider card.

---

## Privacy & Security

> [!IMPORTANT]
> **Strictly Private**:
> * The Intervals.icu connection is strictly private (`is_strictly_private = TRUE`): its credentials are **never** shared with family or friends, and only the account owner can sync, view the status of, or disconnect it.
> * The activities and health data it imports follow the same sharing rules as data from any other device.
> * The Athlete ID and API Key are encrypted at rest using AES-256-GCM.
