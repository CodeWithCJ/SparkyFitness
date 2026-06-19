import {
  insertRecords,
  deleteRecordsByUuids,
  getGrantedPermissions,
  type HealthConnectRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { fetchDailySummary } from '../api/dailySummaryApi';
import { resolveCollapsedFoodEntries } from '../../utils/loggedMealCollapse';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import { isQuotaExceededError } from './index';
import { loadLastWritebackTime, saveLastWritebackTime } from '../storage';
import {
  foodEntryToNutritionRecord,
  waterMlToHydrationRecord,
  computeWritebackDates,
} from './writebackMappers';
import { WRITEBACK_METRICS, type WritebackMetric } from '../../WritebackMetrics';

type DailySummary = Awaited<ReturnType<typeof fetchDailySummary>>;

// Orchestrates the outbound phase: SparkyFitness diary → Health Connect. Reads the
// daily summary once per date, maps the manually-logged entries to HC records, and
// replaces the previous run's records (delete-then-insert with fresh ids). Android
// only; the iOS entry point is a no-op.

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Per-date set of clientRecordIds we last wrote, so the next run can delete exactly
// those before inserting fresh ones (handles add / edit / delete uniformly).
const writtenIdsKey = (recordType: string, date: string): string =>
  `writeback${recordType}Ids:${date}`;

const loadWrittenIds = async (recordType: string, date: string): Promise<string[]> =>
  (await loadHealthPreference<string[]>(writtenIdsKey(recordType, date))) ?? [];

// Persisted AFTER the insert resolves. A crash in that gap orphans the just-written
// records (the next run can't find them to delete) — a rare, self-correcting-on-edit
// tradeoff we accept rather than a write-ahead log.
const saveWrittenIds = (recordType: string, date: string, ids: string[]): Promise<void> =>
  saveHealthPreference(writtenIdsKey(recordType, date), ids);

// Content signature of the last successful write for a date, so an unchanged day can
// be skipped entirely (no delete/insert) — Health Connect rate-limits writes, and
// re-writing identical data every sync wastes that quota.
const writtenSignatureKey = (recordType: string, date: string): string =>
  `writeback${recordType}Sig:${date}`;

const loadWrittenSignature = (recordType: string, date: string): Promise<string | null> =>
  loadHealthPreference<string>(writtenSignatureKey(recordType, date));

const saveWrittenSignature = (recordType: string, date: string, signature: string): Promise<void> =>
  saveHealthPreference(writtenSignatureKey(recordType, date), signature);

// Deterministic replace: delete the exact ids we wrote last run, then insert this
// run's records (which carry brand-new, version-suffixed clientRecordIds — see
// writebackMappers). We do NOT rely on Health Connect's clientRecordId+version
// upsert: via the RN bridge it does not reliably overwrite on edit, and re-inserting
// a stable id we just deleted is rejected (HC tombstones deleted clientRecordIds).
// Fresh ids each run sidestep both. Mirrors the read/Garmin provider pattern.
const replaceTrackedRecords = async (
  previousIds: string[],
  recordType: 'Nutrition' | 'Hydration',
  records: HealthConnectRecord[],
): Promise<void> => {
  if (previousIds.length > 0) {
    await deleteRecordsByUuids(recordType, [], previousIds);
  }
  if (records.length > 0) {
    await insertRecords(records);
  }
};

const recordIds = (records: HealthConnectRecord[]): string[] =>
  records.map((r) => r.metadata?.clientRecordId).filter((id): id is string => id != null);

// Order-independent content signature for a run's records, excluding metadata: the
// clientRecordId carries a per-run version suffix and clientRecordVersion changes
// every run, so neither belongs in a *content* hash — we want to detect diary
// changes, not the version stamp.
const hashString = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const recordsSignature = (records: HealthConnectRecord[]): string => {
  const projections = records
    .map((r) => {
      const content = { ...(r as unknown as Record<string, unknown>) };
      delete content.metadata;
      return JSON.stringify(content);
    })
    .sort();
  return hashString(projections.join('|'));
};

// Active metrics that also hold a granted write permission. getGrantedPermissions is
// queried once per run, not per metric/date.
const writableMetrics = async (metrics: WritebackMetric[]): Promise<WritebackMetric[]> => {
  let granted: { recordType?: string; accessType?: string }[];
  try {
    granted = await getGrantedPermissions();
  } catch {
    return [];
  }
  return metrics.filter((m) => {
    const ok = granted.some((p) => p.recordType === m.recordType && p.accessType === 'write');
    if (!ok) addLog(`[Writeback] Skipping ${m.label}: write permission not granted`, 'WARNING');
    return ok;
  });
};

const writeNutritionForDate = async (
  date: string,
  summary: DailySummary,
  version: number,
): Promise<void> => {
  const entries = await resolveCollapsedFoodEntries(date, summary.foodEntries);

  // Only write entries that originated in Sparky. Entries with a `source` were
  // imported from a provider (e.g. Health Connect itself) — re-exporting them
  // would duplicate that provider's own data back into HC.
  const records = entries
    .filter((e) => !e.source)
    .map((entry) => foodEntryToNutritionRecord(entry, version))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const signature = recordsSignature(records);
  if (signature === (await loadWrittenSignature('Nutrition', date))) {
    addLog(`[Writeback] Nutrition ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  await replaceTrackedRecords(await loadWrittenIds('Nutrition', date), 'Nutrition', records);
  await saveWrittenIds('Nutrition', date, recordIds(records));
  await saveWrittenSignature('Nutrition', date, signature);
  addLog(`[Writeback] Nutrition ${date}: wrote ${records.length} record(s)`, 'INFO');
};

const writeHydrationForDate = async (
  date: string,
  summary: DailySummary,
  version: number,
): Promise<void> => {
  const ml = summary.waterIntake ?? 0;
  const record = waterMlToHydrationRecord(date, ml, version);
  const records = record ? [record] : [];

  const signature = recordsSignature(records);
  if (signature === (await loadWrittenSignature('Hydration', date))) {
    addLog(`[Writeback] Hydration ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  await replaceTrackedRecords(await loadWrittenIds('Hydration', date), 'Hydration', records);
  await saveWrittenIds('Hydration', date, recordIds(records));
  await saveWrittenSignature('Hydration', date, signature);
  addLog(`[Writeback] Hydration ${date}: ${ml} ml -> wrote ${records.length} record(s)`, 'INFO');
};

/**
 * Run the writeback phase for the given calendar dates. Gated per-metric on the
 * opt-in preference AND a granted write permission. Each metric/date is isolated so
 * one failure doesn't abort the rest. Returns `false` if a Health Connect quota
 * error stopped the run early — the caller holds the cursor so the unwritten dates
 * retry next sync; `true` once every date has been attempted. A metric the user
 * hasn't granted is skipped without holding the cursor (otherwise it would retry
 * forever); a per-date failure is logged and reconciled by the cursor's overlap.
 */
export const writebackPhase = async (dates: string[]): Promise<boolean> => {
  const enabled = await Promise.all(
    WRITEBACK_METRICS.map((m) => loadHealthPreference<boolean>(m.preferenceKey)),
  );
  const active = WRITEBACK_METRICS.filter((_, i) => enabled[i] === true);
  if (active.length === 0) return true;

  const writable = await writableMetrics(active);
  if (writable.length === 0) return true;

  // Also the clientRecordId suffix, so each run writes fresh ids (see writebackMappers).
  const version = Date.now();

  for (const date of dates) {
    let summary: DailySummary;
    try {
      summary = await fetchDailySummary(date); // once per date, shared by both metrics
    } catch (error) {
      addLog(`[Writeback] Failed to load summary for ${date}: ${message(error)}`, 'ERROR');
      continue;
    }
    for (const metric of writable) {
      try {
        if (metric.id === 'nutrition') {
          await writeNutritionForDate(date, summary, version);
        } else {
          await writeHydrationForDate(date, summary, version);
        }
      } catch (error) {
        if (isQuotaExceededError(error)) {
          addLog('[Writeback] Health Connect quota exceeded — stopping; resumes next sync', 'WARNING');
          return false;
        }
        addLog(`[Writeback] Failed ${metric.label} for ${date}: ${message(error)}`, 'ERROR');
      }
    }
  }
  return true;
};

/**
 * Cursor-aware entry point called from the sync engine. Computes the date window,
 * runs the writeback phase, and advances the cursor only on a complete run (a
 * quota-stopped run keeps the cursor so the unwritten dates retry next sync).
 * Callers wrap this in their own try/catch so writeback can't block inbound sync.
 */
export const runWriteback = async (): Promise<void> => {
  const dates = computeWritebackDates(await loadLastWritebackTime());
  const completed = await writebackPhase(dates);
  if (completed) await saveLastWritebackTime();
};
