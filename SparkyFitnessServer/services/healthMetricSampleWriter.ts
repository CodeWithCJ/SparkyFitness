/**
 * Day-bucketed writer for health_metric_samples.
 *
 * Extracted from garminHealthProcessor so the generic /api/health-data workout
 * path can reuse it rather than growing a second copy of the bucketing rules
 * (which would drift). Garmin's behaviour is unchanged: `replace` is the default
 * and its call sites pass no options.
 */

import * as genericHealthRepo from '../models/genericHealthRepository.js';
import {
  type HealthMetric,
  healthMetricSamplesInitializerSchema,
} from '@workspace/shared';

interface SampleBucket {
  entry_date: string;
  device_name: string | null;
  samples: Record<string, unknown>[];
}

/** A flat sample as the provider processors build them. */
export interface FlatHealthSample {
  entry_date: string;
  timestamp: Date;
  /** Links the sample to an exercise_entries row. */
  ex?: string;
  /** Links the sample to a sleep_entries row. */
  sl?: string;
  device_name?: string | null;
  [key: string]: unknown;
}

export type SampleWriteMode = 'replace' | 'merge';

export interface SampleWriteOptions {
  /**
   * `replace` overwrites the day's whole array — correct for a provider that
   * returns the full day on every sync (Garmin).
   *
   * `merge` keeps existing samples that fall outside `window` and replaces only
   * those inside it. Required for any partial-day writer: health_metric_samples
   * stores ONE row per (user, metric, day, provider), so writing a single 40
   * minute workout in replace mode would delete the rest of that day's readings.
   */
  mode?: SampleWriteMode;
  /** Instants bounding the samples being written. Required for `merge`. */
  window?: { startMs: number; endMs: number };
}

/** Reads the existing samples for one day+provider, or [] when there is no row. */
async function loadExistingSamples(
  userId: string,
  actingUserId: string,
  metric: HealthMetric,
  sourceProvider: string,
  entryDate: string
): Promise<Record<string, unknown>[]> {
  // getHealthMetricSamples filters by metric and date but not by provider, so
  // narrow to this provider here — merging another provider's samples into this
  // row would duplicate readings across both rows.
  const rows = await genericHealthRepo.getHealthMetricSamples(
    userId,
    actingUserId,
    metric,
    entryDate,
    entryDate
  );
  const row = rows.find((r) => r.source_provider === sourceProvider);
  const samples = row?.samples;
  return Array.isArray(samples) ? (samples as Record<string, unknown>[]) : [];
}

/**
 * Groups flat {entry_date, timestamp, ex, sl, ...fields} samples into one bucket
 * per day and upserts each as a single health_metric_samples row.
 *
 * Bucketing by the caller-supplied `entry_date` (rather than deriving a day from
 * the timestamp here) is what keeps a workout or sleep session that crosses
 * midnight landing on the correct calendar days.
 *
 * Returns the number of day buckets written.
 */
export async function upsertSamplesByDay(
  userId: string,
  actingUserId: string,
  metric: HealthMetric,
  sourceProvider: string,
  flatSamples: FlatHealthSample[],
  options: SampleWriteOptions = {}
): Promise<number> {
  if (flatSamples.length === 0) return 0;

  const mode: SampleWriteMode = options.mode ?? 'replace';

  const byDate = new Map<string, SampleBucket>();
  for (const s of flatSamples) {
    const { entry_date, timestamp, ex, sl, device_name, ...metricFields } = s;
    const bucket = byDate.get(entry_date) ?? {
      entry_date,
      device_name: device_name ?? null,
      samples: [],
    };
    const sample: Record<string, unknown> = {
      t: timestamp.toISOString(),
      ...metricFields,
    };
    if (ex) sample.ex = ex;
    if (sl) sample.sl = sl;
    bucket.samples.push(sample);
    if (!bucket.device_name && device_name) bucket.device_name = device_name;
    byDate.set(entry_date, bucket);
  }

  for (const bucket of byDate.values()) {
    if (mode === 'merge') {
      const existing = await loadExistingSamples(
        userId,
        actingUserId,
        metric,
        sourceProvider,
        bucket.entry_date
      );

      // Without a window there is nothing to scope the replacement to, so keep
      // every prior sample and treat the write as purely additive.
      const window = options.window;
      const retained = existing.filter((sample) => {
        if (!window) return true;
        const ms = Date.parse(String(sample.t));
        if (!Number.isFinite(ms)) return true;
        return ms < window.startMs || ms > window.endMs;
      });

      bucket.samples = retained.concat(bucket.samples);
    }

    bucket.samples.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  }

  for (const bucket of byDate.values()) {
    // Validates AND narrows to the metric's specific sample shape (the
    // discriminated union's whole purpose) instead of an `any`/type-assertion
    // cast — also catches malformed upstream data at ingest with a clear error
    // rather than a silent bad write.
    const row = healthMetricSamplesInitializerSchema.parse({
      user_id: userId,
      metric,
      entry_date: bucket.entry_date,
      source_provider: sourceProvider,
      device_name: bucket.device_name,
      samples: bucket.samples,
    });
    await genericHealthRepo.upsertHealthMetricSamples(
      userId,
      actingUserId,
      row
    );
  }

  return byDate.size;
}
