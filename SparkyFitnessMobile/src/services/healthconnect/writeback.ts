import {
  insertRecords,
  deleteRecordsByUuids,
  getGrantedPermissions,
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
  nutritionClientRecordId,
  waterClientRecordId,
  computeWritebackDates,
} from './writebackMappers';
import { WRITEBACK_METRICS, type WritebackMetric } from '../../WritebackMetrics';

// Orchestrates the outbound phase: SparkyFitness diary → Health Connect. Reads
// the existing daily summary (no server changes), maps to HC records, upserts via
// insertRecords (idempotent by clientRecordId), and deletes records that no
// longer exist in the app. Android-only; the iOS entry point is a no-op.

// Per-date set of clientRecordIds we last wrote, so a later sync can delete the
// ones that disappeared (food deleted / water zeroed). Stored under the same
// @HealthConnect preference prefix.
const writtenIdsKey = (metricId: string, date: string): string =>
  `writeback${metricId}Ids:${date}`;

const loadWrittenIds = async (metricId: string, date: string): Promise<string[]> =>
  (await loadHealthPreference<string[]>(writtenIdsKey(metricId, date))) ?? [];

const saveWrittenIds = (metricId: string, date: string, ids: string[]): Promise<void> =>
  saveHealthPreference(writtenIdsKey(metricId, date), ids);

// Delete clientRecordIds we wrote previously but didn't write this run.
const deleteStale = async (
  recordType: 'Nutrition' | 'Hydration',
  previousIds: string[],
  currentIds: string[],
): Promise<void> => {
  const current = new Set(currentIds);
  const stale = previousIds.filter((id) => !current.has(id));
  if (stale.length > 0) {
    await deleteRecordsByUuids(recordType, [], stale);
    addLog(`[Writeback] Deleted ${stale.length} stale ${recordType} record(s)`, 'DEBUG');
  }
};

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

  const records = entries
    .map((entry) => foodEntryToNutritionRecord(entry, version))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (records.length > 0) {
    await insertRecords(records);
  }
  const currentIds = entries
    .filter((e) => e.serving_size !== 0)
    .map((e) => nutritionClientRecordId(e.id));

  await deleteStale('Nutrition', await loadWrittenIds('Nutrition', date), currentIds);
  await saveWrittenIds('Nutrition', date, currentIds);
};

const writeHydrationForDate = async (date: string, version: number): Promise<void> => {
  const summary = await fetchDailySummary(date);
  const ml = summary.waterIntake ?? 0;
  const record = waterMlToHydrationRecord(date, ml, version);

  if (record) {
    await insertRecords([record]);
  }
  const currentIds = record ? [waterClientRecordId(date)] : [];

  await deleteStale('Hydration', await loadWrittenIds('Hydration', date), currentIds);
  await saveWrittenIds('Hydration', date, currentIds);
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
