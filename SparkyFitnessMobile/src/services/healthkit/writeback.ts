import {
  saveCorrelationSample,
  saveQuantitySample,
  deleteObjects,
  authorizationStatusFor,
  type CorrelationSample,
  type QuantitySample,
  type QuantityTypeIdentifierWriteable,
  type ObjectTypeIdentifier,
  type SampleTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { fetchDailySummary } from '../api/dailySummaryApi';
import { resolveCollapsedFoodEntries } from '../../utils/loggedMealCollapse';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import { loadLastWritebackTime, saveLastWritebackTime } from '../storage';
import {
  foodEntryToNutrientSamples,
  waterMlToSample,
  computeWritebackDates,
  DIETARY_WRITE_IDENTIFIERS,
  DIETARY_ENERGY_IDENTIFIER,
  DIETARY_WATER_IDENTIFIER,
  type NutrientSampleDescriptor,
  type WaterSampleDescriptor,
} from './writebackMappers';
import { WRITEBACK_METRICS, type WritebackMetric } from '../../WritebackMetrics';
import { getMealTypeLabel } from '../../constants/meals';

type DailySummary = Awaited<ReturnType<typeof fetchDailySummary>>;

// Orchestrates the outbound phase: SparkyFitness diary → HealthKit. Reads the daily
// summary once per date, maps the manually-logged entries to HealthKit samples, and
// replaces the previous run's records (delete-then-save). Nutrition is written as one
// HKCorrelationTypeIdentifierFood per food entry so it appears grouped in Apple Health;
// hydration is a single DietaryWater sample per day. iOS only; Android uses
// healthconnect/writeback.ts via the top-level ./writeback shim.

// HKCorrelationTypeIdentifierFood — the grouped "one food" record. Also doubles as the
// tracked-UUID map key for the correlation objects themselves (deleteObjects is scoped
// to one type, so we delete the correlation UUIDs under this key too).
const FOOD_CORRELATION_TYPE = 'HKCorrelationTypeIdentifierFood' as const;

// HKAuthorizationStatus.sharingAuthorized. HealthKit reliably reports SHARE/write
// status (only READ status is hidden), so this is the iOS analogue of Android's
// getGrantedPermissions(). We compare against the literal so the enum need not be in
// the test mock.
const SHARING_AUTHORIZED = 2;

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isAuthorized = (type: ObjectTypeIdentifier): boolean =>
  authorizationStatusFor(type) === SHARING_AUTHORIZED;

// HealthKit has no clientRecordId, so dedup tracks each saved sample's UUID. Keys
// mirror Android's scheme (one per recordType per date), under the @HealthKit prefix
// (these helpers come from healthkit/preferences).
const nutritionUuidsKey = (date: string): string => `writebackNutritionUuids:${date}`;
const hydrationUuidsKey = (date: string): string => `writebackHydrationUuids:${date}`;
const nutritionSigKey = (date: string): string => `writebackNutritionSig:${date}`;
const hydrationSigKey = (date: string): string => `writebackHydrationSig:${date}`;

// Order-independent djb2 content signature (shared formula with Android), so an
// unchanged day can be skipped without any HealthKit writes. Excludes UUID/version —
// those change every run and would defeat the skip.
const hashString = (value: string): string => {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// A tag for the SHAPE of what we write into HealthKit (not the diary content). Mixed into
// the content signature below so that changing what metadata we attach — e.g. adding the
// Meal label — invalidates every stored signature and triggers a one-time rewrite of
// already-written days. Bump (change the string) on any future write-shape change.
const NUTRITION_WRITE_SCHEMA = 'sample-meal-label';

const nutritionSignature = (descriptors: NutrientSampleDescriptor[]): string => {
  const projections = descriptors
    .map((d) =>
      JSON.stringify({
        name: d.name,
        mealType: d.mealType,
        start: d.start.toISOString(),
        end: d.end.toISOString(),
        samples: d.samples
          .map((s) => ({ quantityType: s.quantityType, unit: s.unit, quantity: s.quantity }))
          .sort((a, b) => a.quantityType.localeCompare(b.quantityType)),
      }),
    )
    .sort();
  return hashString([NUTRITION_WRITE_SCHEMA, ...projections].join('|'));
};

const hydrationSignature = (descriptor: WaterSampleDescriptor | null): string => {
  const projections = descriptor
    ? [
        JSON.stringify({
          identifier: descriptor.identifier,
          unit: descriptor.unit,
          quantity: descriptor.quantity,
          start: descriptor.start.toISOString(),
          end: descriptor.end.toISOString(),
        }),
      ]
    : [];
  return hashString(projections.join('|'));
};

// Delete every tracked UUID, grouped by its HealthKit type (deleteObjects is scoped to
// one type per call). A failed delete doesn't abort the rest of the day's replace; the
// UUIDs that failed are returned (grouped by type) so the caller can carry them forward
// and retry, rather than orphaning those samples in HealthKit.
const deleteTrackedByType = async (
  tracked: Record<string, string[]>,
): Promise<Record<string, string[]>> => {
  const failed: Record<string, string[]> = {};
  for (const [type, uuids] of Object.entries(tracked)) {
    if (uuids.length === 0) continue;
    try {
      await deleteObjects(type as SampleTypeIdentifierWriteable, { uuids });
    } catch (error) {
      addLog(`[Writeback] Failed to delete ${uuids.length} ${type} record(s): ${message(error)}`, 'WARNING');
      failed[type] = uuids; // remember so a later run can retry — never orphan a sample
    }
  }
  return failed;
};

// Save one Food correlation. Returns the saved CorrelationSample (carrying the
// correlation UUID + the contained samples' UUIDs) or undefined on failure/undefined
// result — the caller treats undefined as a failed write.
const saveFoodCorrelation = async (
  descriptor: NutrientSampleDescriptor,
  version: number,
): Promise<CorrelationSample | undefined> => {
  // HKFoodType surfaces the food name in Apple Health; Meal is a custom metadata key
  // (HealthKit has no standard meal field) that mirrors how MyFitnessPal labels its
  // entries by meal type; the version is a traceability marker (no clientRecordId on iOS).
  // The same dict is stamped onto BOTH the correlation AND every contained sample: Apple
  // Health's per-nutrient detail view reads the quantity sample's own metadata, not the
  // parent correlation's, so correlation-only metadata never surfaces in the UI.
  const metadata: Record<string, string | number> = {
    HKFoodType: descriptor.name,
    SparkyWritebackVersion: version,
  };
  const mealLabel = descriptor.mealType ? getMealTypeLabel(descriptor.mealType) : '';
  if (mealLabel) metadata.Meal = mealLabel;
  const samples = descriptor.samples.map((sample) => ({ ...sample, metadata }));
  try {
    const result = await saveCorrelationSample(
      FOOD_CORRELATION_TYPE,
      samples,
      descriptor.start,
      descriptor.end,
      metadata,
    );
    if (!result) {
      addLog(`[Writeback] saveCorrelationSample returned undefined for "${descriptor.name}"`, 'WARNING');
    }
    return result;
  } catch (error) {
    addLog(`[Writeback] Failed to save food "${descriptor.name}": ${message(error)}`, 'ERROR');
    return undefined;
  }
};

const saveWaterSample = async (
  descriptor: WaterSampleDescriptor,
  version: number,
): Promise<QuantitySample | undefined> => {
  try {
    const result = await saveQuantitySample(
      descriptor.identifier,
      descriptor.unit,
      descriptor.quantity,
      descriptor.start,
      descriptor.end,
      { SparkyWritebackVersion: version },
    );
    if (!result) {
      addLog('[Writeback] saveQuantitySample returned undefined for water', 'WARNING');
    }
    return result;
  } catch (error) {
    addLog(`[Writeback] Failed to save water: ${message(error)}`, 'ERROR');
    return undefined;
  }
};

const writeNutritionForDate = async (
  date: string,
  summary: DailySummary,
  version: number,
): Promise<void> => {
  const entries = await resolveCollapsedFoodEntries(date, summary.foodEntries);

  // A user can authorize energy but deny, say, sodium. A correlation containing an
  // unauthorized sample fails the WHOLE correlation, so filter each entry's samples to
  // authorized types — dropping only the denied nutrient, never the food entry.
  const authorized = new Set<string>(DIETARY_WRITE_IDENTIFIERS.filter((t) => isAuthorized(t)));

  // Only write entries that originated in Sparky. Entries with a `source` were imported
  // from a provider — re-exporting them would duplicate that provider's own data.
  const descriptors = entries
    .filter((e) => !e.source)
    .map((entry) => foodEntryToNutrientSamples(entry))
    .filter((d): d is NutrientSampleDescriptor => d !== null)
    .map((d) => ({ ...d, samples: d.samples.filter((s) => authorized.has(s.quantityType)) }))
    .filter((d) => d.samples.length > 0);

  const signature = nutritionSignature(descriptors);
  if (signature === (await loadHealthPreference<string>(nutritionSigKey(date)))) {
    addLog(`[Writeback] Nutrition ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  const previous = (await loadHealthPreference<Record<string, string[]>>(nutritionUuidsKey(date))) ?? {};
  const failedDeletes = await deleteTrackedByType(previous);

  const tracked: Record<string, string[]> = {};
  // A failed delete means an old sample still exists in HealthKit, so the date isn't fully
  // done — start "not succeeded" so the signature is withheld and the next run retries.
  let allSucceeded = Object.keys(failedDeletes).length === 0;
  for (const descriptor of descriptors) {
    const saved = await saveFoodCorrelation(descriptor, version);
    if (!saved) {
      allSucceeded = false;
      continue;
    }
    // Track each contained sample's UUID grouped by its quantity type, plus the
    // correlation's own UUID under the food-correlation key, so the next run can delete
    // both (correlation cascade-delete is undocumented).
    for (const object of saved.objects) {
      const quantityType = (object as { quantityType?: string }).quantityType;
      if (quantityType) (tracked[quantityType] ??= []).push(object.uuid);
    }
    (tracked[FOOD_CORRELATION_TYPE] ??= []).push(saved.uuid);
  }

  // Carry forward any UUIDs we couldn't delete so a later run retries them — never forget
  // an orphaned HealthKit sample. (Freshly-saved UUIDs are distinct, so no dedup needed.)
  for (const [type, uuids] of Object.entries(failedDeletes)) {
    (tracked[type] ??= []).push(...uuids);
  }

  // Always persist the UUID map so the next run can delete what we wrote plus anything we
  // failed to delete. Persist the signature only when every save AND delete succeeded, so
  // a partial failure isn't treated as "done" — the cursor's 1-day overlap reconciles it.
  await saveHealthPreference(nutritionUuidsKey(date), tracked);
  if (allSucceeded) {
    await saveHealthPreference(nutritionSigKey(date), signature);
  }
  addLog(`[Writeback] Nutrition ${date}: wrote ${descriptors.length} food(s)`, 'INFO');
};

const writeHydrationForDate = async (
  date: string,
  summary: DailySummary,
  version: number,
): Promise<void> => {
  const ml = summary.waterIntake ?? 0;
  const descriptor = waterMlToSample(date, ml);

  const signature = hydrationSignature(descriptor);
  if (signature === (await loadHealthPreference<string>(hydrationSigKey(date)))) {
    addLog(`[Writeback] Hydration ${date}: unchanged — skipped`, 'DEBUG');
    return;
  }

  const previous = (await loadHealthPreference<string[]>(hydrationUuidsKey(date))) ?? [];
  const tracked: string[] = [];
  let allSucceeded = true;
  if (previous.length > 0) {
    try {
      await deleteObjects(DIETARY_WATER_IDENTIFIER, { uuids: previous });
    } catch (error) {
      addLog(`[Writeback] Failed to delete previous water for ${date}: ${message(error)}`, 'WARNING');
      // Keep the undeleted UUIDs and withhold the signature so a later run retries them
      // instead of orphaning the sample in HealthKit.
      tracked.push(...previous);
      allSucceeded = false;
    }
  }

  if (descriptor) {
    const saved = await saveWaterSample(descriptor, version);
    if (saved) tracked.push(saved.uuid);
    else allSucceeded = false;
  }

  await saveHealthPreference(hydrationUuidsKey(date), tracked);
  if (allSucceeded) {
    await saveHealthPreference(hydrationSigKey(date), signature);
  }
  addLog(`[Writeback] Hydration ${date}: ${ml} ml -> wrote ${tracked.length} record(s)`, 'INFO');
};

// Active metrics that also hold a granted write permission. Hydration gates on
// DietaryWater; nutrition gates on DietaryEnergyConsumed (individual denied nutrients
// are handled by the per-type filter in writeNutritionForDate, not by gating here). A
// metric the user hasn't granted is skipped WITHOUT holding the cursor — exactly as
// Android does — so it doesn't retry forever.
const writableMetrics = (metrics: WritebackMetric[]): WritebackMetric[] =>
  metrics.filter((m) => {
    const gate: QuantityTypeIdentifierWriteable =
      m.id === 'hydration' ? DIETARY_WATER_IDENTIFIER : DIETARY_ENERGY_IDENTIFIER;
    const ok = isAuthorized(gate);
    if (!ok) addLog(`[Writeback] Skipping ${m.label}: write permission not granted`, 'WARNING');
    return ok;
  });

/**
 * Run the writeback phase for the given calendar dates. Gated per-metric on the opt-in
 * preference AND a granted write permission. Each metric/date is isolated so one
 * failure doesn't abort the rest. HealthKit has no write quota, so this always returns
 * `true` once every date has been attempted; per-date failures are logged and
 * reconciled by the cursor's 1-day overlap. A metric the user hasn't granted is skipped
 * without holding the cursor.
 */
export const writebackPhase = async (dates: string[]): Promise<boolean> => {
  const enabled = await Promise.all(
    WRITEBACK_METRICS.map((m) => loadHealthPreference<boolean>(m.preferenceKey)),
  );
  const active = WRITEBACK_METRICS.filter((_, i) => enabled[i] === true);
  if (active.length === 0) return true;

  const writable = writableMetrics(active);
  if (writable.length === 0) return true;

  // Traceability marker stamped into written samples' metadata (no clientRecordId on iOS).
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
        addLog(`[Writeback] Failed ${metric.label} for ${date}: ${message(error)}`, 'ERROR');
      }
    }
  }
  return true;
};

/**
 * Cursor-aware entry point called from the sync engine. Computes the date window, runs
 * the writeback phase, and advances the cursor. Callers wrap this in their own
 * try/catch so writeback can't block inbound sync.
 */
export const runWriteback = async (): Promise<void> => {
  const dates = computeWritebackDates(await loadLastWritebackTime());
  const completed = await writebackPhase(dates);
  if (completed) await saveLastWritebackTime();
};
