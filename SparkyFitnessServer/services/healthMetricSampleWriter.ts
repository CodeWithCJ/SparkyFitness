/**
 * Day-bucketed writer for health_metric_samples.
 *
 * Extracted from garminHealthProcessor so the generic /api/health-data workout
 * path can reuse it rather than growing a second copy of the bucketing rules
 * (which would drift). Garmin's behaviour is unchanged: `replace` is the default
 * and its call sites pass no options.
 */

import { getClient } from '../db/poolManager.js';
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

/**
 * Groups flat {entry_date, timestamp, ex, sl, ...fields} samples into one bucket
 * per day and upserts each as a single health_metric_samples row.
 *
 * Bucketing by the caller-supplied `entry_date` (rather than deriving a day from
 * the timestamp here) is what keeps a workout or sleep session that crosses
 * midnight landing on the correct calendar days.
 *
 * The whole batch runs in one transaction. In `merge` mode each bucket's
 * existing row is read with `SELECT ... FOR UPDATE` before being merged and
 * written back, so a concurrent writer targeting the same (user, metric, day,
 * provider) row blocks until this transaction commits instead of reading a
 * stale snapshot and silently dropping this write's samples (or vice versa).
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

  const client = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');

    // Chronological order, not Map insertion order: two concurrent merge
    // requests covering the same set of days in opposite orders would
    // otherwise each hold one day's advisory lock while waiting on the
    // other's, and Postgres aborts one transaction outright (no retry here)
    // rather than resolving the deadlock.
    const buckets = [...byDate.values()].sort((a, b) =>
      a.entry_date.localeCompare(b.entry_date)
    );

    for (const bucket of buckets) {
      if (mode === 'merge') {
        // Advisory lock first: FOR UPDATE alone can't serialize a first write
        // (no row exists yet to lock), so a second concurrent "first write" for
        // the same key must block here, not just at the row-lock below.
        await genericHealthRepo.acquireHealthMetricSampleLockWithClient(
          client,
          userId,
          metric,
          bucket.entry_date,
          sourceProvider
        );
        // Locks the row (if any) for the rest of this transaction — a second
        // concurrent merge for the same key blocks here until this COMMIT,
        // then sees this write's result rather than the pre-merge snapshot.
        const existingRow =
          await genericHealthRepo.getHealthMetricSampleRowForUpdateWithClient(
            client,
            userId,
            metric,
            bucket.entry_date,
            sourceProvider
          );
        const existing = Array.isArray(existingRow?.samples)
          ? (existingRow.samples as Record<string, unknown>[])
          : [];

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

      // Date.parse, not localeCompare: lexicographic order only agrees with
      // chronological order when every sample uses the same UTC offset, and this
      // merges freshly-written samples with whatever was already stored.
      bucket.samples.sort(
        (a, b) => Date.parse(String(a.t)) - Date.parse(String(b.t))
      );

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
      await genericHealthRepo.upsertHealthMetricSamplesWithClient(
        client,
        userId,
        row
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return byDate.size;
}
