import type { HealthMetricSamples } from '@workspace/shared';

/**
 * Every sample stored for `day`, across all of its rows. A day has one row per
 * source, and GET /generic-health/samples orders rows by day only, so taking
 * the first row would chart whichever source happened to come back first.
 */
export function samplesForDay(
  rows: readonly HealthMetricSamples[] | null | undefined,
  day: string
): unknown[] {
  const out: unknown[] = [];
  for (const row of rows ?? []) {
    if (String(row.entry_date || '').slice(0, 10) !== day) continue;
    if (Array.isArray(row.samples)) out.push(...row.samples);
  }
  return out;
}
