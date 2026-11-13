# Glucose readings from Apple Health and Health Connect

SparkyFitness can preserve timestamped blood glucose readings shared with Apple Health by Dexcom or another glucose app. Daily glucose minimum, maximum and average measurements continue to sync as before.

## Setup

1. In the Dexcom app, enable sharing glucose readings with Apple Health. Confirm readings appear in Apple's Health app under Blood Glucose.
2. In SparkyFitness on iOS, enable **Blood Glucose** in Health Data Sync and grant read access when prompted. If needed, change access in Apple's Health settings.
3. Sync from the iOS app. The readings are sent to your configured SparkyFitness server.
4. Open **Reports → Measurements** on the web or in the Android/iOS app and choose a date range and day. Set **Glucose Unit** to **mmol/L** or **mg/dL** in web **Settings → Preferences**, or mobile **Settings → App Settings → Glucose unit**. Both Blood glucose charts use this saved account preference. Gaps longer than 15 minutes break the line rather than implying continuous coverage.

The first sync imports up to 30 days within the selected sync range. Subsequent runs revisit the last two days within the selected sync range for late-arriving readings. Choose a range covering previous days to capture readings shared after midnight. Earlier daily summaries cannot reconstruct a CGM curve; timestamped readings must still be available in Apple Health to import them.

This is a historical view. Dexcom controls when readings are shared with Apple Health; delays in Dexcom sharing, phone sync or SparkyFitness background execution also delay this chart. Use the Dexcom app for live readings and alarms.

## Android Health Connect

On Android, CGM apps that write Blood Glucose to Health Connect can supply the same timestamped timeline. Grant SparkyFitness Blood Glucose read access in Health Connect and enable **Blood Glucose** in Health Data Sync. The sync retains every reading in mmol/L and its source package when available, using the same bounded, account-scoped retry pipeline as iOS. Empty reads do not erase observations or certify missing history as imported. No new permission is required beyond the existing glucose toggle.

## Storage and sharing

Readings are stored in the existing `health_metric_samples` table as `blood_glucose`, in mmol/L, with original timestamps and the source app's bundle identifier when available. The upload source is `SparkyFitness Mobile`. Windowed re-syncs replace that source's readings in the same window without duplicating them or replacing other providers' data. Empty reads on iOS leave stored readings intact because HealthKit can hide denied access as an empty result.

Glucose inherits the table's existing check-in/report sharing permissions. Delegates with **Manage Check-in** can manage it; delegates with **Manage Check-in** or **View Reports** can read it. No Dexcom credentials or direct Dexcom API connection are required.

## Deployment

Update the server before the mobile app. Server startup applies `20261106000000_add_blood_glucose_samples.sql`, which widens the existing metric constraint without creating tables or changing RLS policies. Old mobile clients continue syncing daily summaries. If a newer mobile app is used with an older server, the passive glucose upload is refused and retried on a later sync; daily summaries continue working.

## Mobile custom CGM imports

The mobile **Measurement timeline** also offers every numeric custom category. Choose a CGM category with frequency **All** to see readings posted through an API or integration, including non-manual sources. Source selection keeps different writers apart. The chart is read-only and does not expose synced readings through the manual diary editor. Readings must have stored measurement timestamps; the chart never substitutes upload timestamps for missing event times.

## Food, exercise and other context

Both platforms provide independent display toggles for food, exercise, sleep, medications, stress, caffeine, alcohol and hydration. Food rows include names and carbohydrate amounts; nutrient snapshots are scaled to the quantity consumed. Exercise spans start at the recorded workout time and end after its logged duration, including workouts crossing midnight. Sleep uses its recorded bedtime and wake time. Taken medication doses use the actual logged time, not a scheduled dose time; skipped and snoozed doses are not plotted as taken.

Caffeine and alcohol come from logged food nutrient values. Individual hydration records use their explicit `logged_at` time; the day's hydration total remains a day total. Stress uses available wearable samples, daily averages and stress custom entries. Daily totals, averages and other entries without a precise time remain in the context list and receive no invented position on the curve. Missing or inaccessible context is identified without blocking the glucose view. Each existing API continues to enforce its own permissions, including medication permissions.

These overlays help compare recorded events with glucose changes; they do not determine causes or predict insulin or treatment needs. Factors that were not recorded cannot be reconstructed.

## Zoom and compact controls

On mobile, the chart opens with category/source settings, context-layer controls and event details collapsed. Pinch to zoom in time and drag horizontally to pan; **Reset zoom** returns to the full day. **Inspect readings** switches from navigation gestures to long-press value inspection. Changing the day, category, source or unit resets the transform. Web provides **Zoom in**, **Zoom out**, **Earlier**, **Later** and **Reset zoom** controls, with a minimum 30-minute window. Context spans stay aligned with the visible time window. Native gestures require device verification before release.

Timed context also appears in a compact **Events in view** strip with category icons, food carbohydrate amounts, and exercise start/end times. This strip follows zoom and pan; daily totals and entries without timestamps remain in event details. Mobile uses the app’s existing platform icons and themed data colors.

An empty iOS glucose window is not certified as imported, because Apple Health can return an empty result when read access is denied. A later sync retries that bounded history after access is granted. Web and mobile read neighboring sample buckets and select observations by the current account timezone, so a timezone change does not hide readings near midnight.
