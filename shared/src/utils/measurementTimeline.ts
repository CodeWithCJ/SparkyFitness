import { instantToDay, localDateTimeToUtc } from './timezone.ts';

export interface MeasurementReading {
  timestamp: string;
  value: number;
  source: string;
}

/** Only observed instants, with null separators over sensor gaps. No daily reduction. */
export function measurementDayPoints(
  readings: readonly MeasurementReading[],
  day: string,
  timezone: string
) {
  const dayStart = localDateTimeToUtc(`${day}T00:00`, timezone).getTime();
  const unique = new Map<string, MeasurementReading>();
  for (const reading of readings) {
    if (
      !Number.isFinite(Date.parse(reading.timestamp)) ||
      !Number.isFinite(reading.value)
    )
      continue;
    if (instantToDay(reading.timestamp, timezone) === day)
      unique.set(reading.timestamp, reading);
  }
  const sorted = [...unique.values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const points: { minutes: number; value: number | null; timestamp: string }[] =
    [];
  sorted.forEach((reading, index) => {
    const minutes = (Date.parse(reading.timestamp) - dayStart) / 60_000;
    const previous = sorted[index - 1];
    if (
      previous &&
      Date.parse(reading.timestamp) - Date.parse(previous.timestamp) >
        15 * 60_000
    ) {
      const last = points[points.length - 1]!;
      points.push({
        minutes: last.minutes + 0.001,
        value: null,
        timestamp: previous.timestamp,
      });
    }
    points.push({
      minutes,
      value: reading.value,
      timestamp: reading.timestamp,
    });
  });
  return points;
}
