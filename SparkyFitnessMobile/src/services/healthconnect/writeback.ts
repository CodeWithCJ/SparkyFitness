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

// Orchestrates the outbound phase: SparkyFitness diary → Health Connect. Reads
// the existing daily summary, maps the manually-logged entries to HC records, and
// replaces the previous run's records (delete-then-insert with fresh ids). Android
// only; the iOS entry point is a no-op.

// Per-date set of clientRecordIds we last wrote, so the next run can delete exactly
// those before inserting fresh ones (handles add / edit / delete uniformly).
// Stored under the same @HealthConnect preference prefix.
const writtenIdsKey = (metricId: string, date: string): string =>
  `writeback${metricId}Ids:${date}`;

const loadWrittenIds = async (metricId: string, date: string): Promise<string[]> =>
  (await loadHealthPreference<string[]>(writtenIdsKey(metricId, date))) ?? [];

const saveWrittenIds = (metricId: string, date: string, ids: string[]): Promise<void> =>
  saveHealthPreference(writtenIdsKey(metricId, date), ids);

// Deterministic replace: delete the exact ids we wrote last run, then insert this
// run's records (which carry brand-new, version-suffixed clientRecordIds — see
// writebackMappers). We do NOT rely on Health Connect's clientRecordId+version
// upsert: via the RN bridge it does not reliably overwrite on edit, and re-inserting
// a stable id we just deleted is rejected (HC tombstones deleted clientRecordIds).
// Fresh ids each run sidestep both. Mirrors the read/Garmin provider pattern.
const replaceProviderRecords = async (
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

// clientRecordIds of the records actually built this run (what we just inserted).
const recordIds = (records: HealthConnectRecord[]): string[] =>
  records.map((r) => r.metadata?.clientRecordId).filter((id): id is string => id != null);

const hasWritePermission = async (metric: WritebackMetric): Promise<boolean> => {
  try {
    const granted = await getGrantedPermissions();
    return granted.some(
      (p) =>
        (p as { recordType?: string; accessType?: string }).recordType === metric.recordType &&
        (p as { accessType?: string }).accessType === 'write',
    );
  } catch {
    return false;
  }
};

const writeNutritionForDate = async (date: string, version: number): Promise<void> => {
  const summary = await fetchDailySummary(date);
  const entries = await resolveCollapsedFoodEntries(date, summary.foodEntries);

  // Only write entries that originated in Sparky. Entries with a `source` were
  // imported from a provider (e.g. Health Connect itself) — re-exporting them
  // would duplicate that provider's own data back into HC.
  const records = entries
    .filter((e) => !e.source)
    .map((entry) => foodEntryToNutritionRecord(entry, version))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const previousIds = await loadWrittenIds('Nutrition', date);
  await replaceProviderRecords(previousIds, 'Nutrition', records);
  await saveWrittenIds('Nutrition', date, recordIds(records));
  addLog(`[Writeback] Nutrition ${date}: wrote ${records.length} record(s)`, 'INFO');
};

const writeHydrationForDate = async (date: string, version: number): Promise<void> => {
  const summary = await fetchDailySummary(date);
  const ml = summary.waterIntake ?? 0;
  const record = waterMlToHydrationRecord(date, ml, version);
  const records = record ? [record] : [];

  const previousIds = await loadWrittenIds('Hydration', date);
  await replaceProviderRecords(previousIds, 'Hydration', records);
  await saveWrittenIds('Hydration', date, recordIds(records));
  addLog(`[Writeback] Hydration ${date}: ${ml} ml -> wrote ${records.length} record(s)`, 'INFO');
};

/**
 * Run the writeback phase for the given calendar dates. Gated per-metric on the
 * opt-in preference AND a granted write permission. Each metric/date is isolated
 * so one failure doesn't abort the rest; a Health Connect quota error stops the
 * phase early (it will resume next sync).
 */
export const writebackPhase = async (dates: string[]): Promise<void> => {
  const enabled = await Promise.all(
    WRITEBACK_METRICS.map((m) => loadHealthPreference<boolean>(m.preferenceKey)),
  );
  const active = WRITEBACK_METRICS.filter((_, i) => enabled[i] === true);
  if (active.length === 0) return;

  const version = Date.now(); // monotonic clientRecordVersion so edits overwrite

  for (const metric of active) {
    if (!(await hasWritePermission(metric))) {
      addLog(`[Writeback] Skipping ${metric.label}: write permission not granted`, 'WARNING');
      continue;
    }
    for (const date of dates) {
      try {
        if (metric.id === 'nutrition') {
          await writeNutritionForDate(date, version);
        } else {
          await writeHydrationForDate(date, version);
        }
      } catch (error) {
        if (isQuotaExceededError(error)) {
          addLog('[Writeback] Health Connect quota exceeded — stopping; resumes next sync', 'WARNING');
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[Writeback] Failed ${metric.label} for ${date}: ${message}`, 'ERROR');
      }
    }
  }
};

/**
 * Cursor-aware entry point called from the sync engine. Computes the date window,
 * runs the writeback phase, and advances the writeback cursor on completion.
 * Callers wrap this in their own try/catch so writeback can't block inbound sync.
 */
export const runWriteback = async (): Promise<void> => {
  const dates = computeWritebackDates(await loadLastWritebackTime());
  await writebackPhase(dates);
  await saveLastWritebackTime();
};
