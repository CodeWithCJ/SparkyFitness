// Several sources can store a day's total burn in daily_health_metrics, one row
// each. The calorie target uses one of them per day, never a sum: Garmin Connect
// can also write into Health Connect, so adding them would count the same day
// twice.
//
// The choice is a fixed order, not the most recent capture. Capture time is when
// SparkyFitness fetched the value, not how fresh it is, so a late sync would win
// with older data. Health Connect comes first because the phone already merges
// its own sources by the person's Health Connect priority.
//
// Only sources that stamp each total with when it was read are listed. Apple
// Health totals are stamped with the start of their day, so the stored value
// never moves past the day's first sync and a completed day would use a morning
// partial; they stay out until the iPhone reader stamps its read time.
const DEVICE_TOTAL_SOURCE_ORDER = ['health_connect', 'garmin', 'polar'];

export interface DeviceTotalCaloriesSourceRow {
  entry_date: string;
  source_provider: string;
  total_calories: number;
  captured_at?: Date | string | null;
}

/** Keeps one row per day from the listed sources, in date order. */
export function pickDeviceTotalPerDay(
  rows: DeviceTotalCaloriesSourceRow[]
): DeviceTotalCaloriesSourceRow[] {
  const byDate = new Map<string, DeviceTotalCaloriesSourceRow>();
  for (const row of rows) {
    // A zero total (Health Connect accepts one) is no figure at all, so it must
    // not hide another source's real total for that day.
    if (!(Number(row.total_calories) > 0)) continue;
    const rank = DEVICE_TOTAL_SOURCE_ORDER.indexOf(row.source_provider);
    if (rank === -1) continue;
    const current = byDate.get(row.entry_date);
    if (
      !current ||
      rank < DEVICE_TOTAL_SOURCE_ORDER.indexOf(current.source_provider)
    ) {
      byDate.set(row.entry_date, row);
    }
  }
  return [...byDate.values()].sort((a, b) =>
    a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0
  );
}
