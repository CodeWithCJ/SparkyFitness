import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import { getTodayDate } from '../../utils/dateUtils';
import type {
  CheckInMeasurement,
  CheckInMeasurementRange,
  WaterIntake,
  WaterContainer,
  WaterIntakeResponse,
} from '../../types/measurements';
import type {
  CreateWaterContainerBody,
  UpdateWaterContainerBody,
  DrinkPresetCatalogEntry,
  WaterIntakeLogEntry,
} from '@workspace/shared';
import type {
  CustomCategory,
  CustomMeasurementEntry,
  LatestManualCustomEntry,
  SaveCustomMeasurementPayload,
} from '../../types/customMeasurements';
import { reduceLatestManualEntries } from '../../utils/measurementHistory';
import { isManualSource } from '../../utils/customMeasurementsForm';

/**
 * Fetches measurements for a given date.
 *
 * The `/check-in/:date` endpoint carries forward the latest value per field
 * (intentional server behavior for the web editor). The mobile diary/editor
 * need exactly what was recorded on this day, so query the range endpoint for
 * a single day — a plain `WHERE entry_date = date` with no carry-forward.
 */
export const fetchMeasurements = async (
  date: string
): Promise<CheckInMeasurement> => {
  const rows = await fetchMeasurementsRange(date, date);
  return (rows?.[0] ?? {}) as CheckInMeasurement;
};

/**
 * Fetches water intake for a given date.
 */
const fetchWaterIntake = async (date: string): Promise<WaterIntake> => {
  return apiFetch<WaterIntake>({
    endpoint: `/api/measurements/water-intake/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch water intake',
  });
};

let lastPerRecordWaterSupport: boolean | null = null;

/**
 * Whether the active server accepts per-record water sync (upsert by
 * source_id). Older servers instead SET the day total per incoming record, so
 * sending individual drinks against one would leave the day at the last
 * drink's volume — callers fall back to a single day-aggregate record there.
 *
 * Feature detection, not a version check: the same server release that added
 * per-record ingestion also added the `manual_ml` breakdown to the day-totals
 * endpoint, so its presence identifies exactly the right deploy. On probe
 * failure the last successful answer is reused (the sync that needed it is
 * about to fail on the same network anyway); first-ever probe failures assume
 * support, matching current-release servers.
 */
export const serverSupportsPerRecordWater = async (): Promise<boolean> => {
  try {
    const totals = await fetchWaterIntake(getTodayDate());
    lastPerRecordWaterSupport =
      totals != null && typeof totals === 'object' && 'manual_ml' in totals;
  } catch {
    if (lastPerRecordWaterSupport === null) return true;
  }
  return lastPerRecordWaterSupport;
};

/**
 * Fetches available water containers.
 */
export const fetchWaterContainers = async (): Promise<WaterContainer[]> => {
  return apiFetch<WaterContainer[]>({
    endpoint: '/api/water-containers',
    serviceName: 'Measurements API',
    operation: 'fetch water containers',
  });
};

/** Creates a water container, optionally linked to a food (#2115). */
export const createWaterContainer = async (
  body: CreateWaterContainerBody
): Promise<WaterContainer> => {
  return apiFetch<WaterContainer>({
    endpoint: '/api/water-containers',
    serviceName: 'Measurements API',
    operation: 'create water container',
    method: 'POST',
    body,
  });
};

/**
 * Updates a water container. An explicit `null` on a link field unlinks it;
 * an omitted field leaves it unchanged (see waterContainerRepository.ts on
 * the server for the same present-vs-omitted distinction).
 */
export const updateWaterContainer = async (
  id: number,
  body: UpdateWaterContainerBody
): Promise<WaterContainer> => {
  return apiFetch<WaterContainer>({
    endpoint: `/api/water-containers/${id}`,
    serviceName: 'Measurements API',
    operation: 'update water container',
    method: 'PUT',
    body,
  });
};

export const deleteWaterContainer = async (id: number): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/water-containers/${id}`,
    serviceName: 'Measurements API',
    operation: 'delete water container',
    method: 'DELETE',
  });
};

export const setPrimaryWaterContainer = async (
  id: number
): Promise<WaterContainer> => {
  return apiFetch<WaterContainer>({
    endpoint: `/api/water-containers/${id}/set-primary`,
    serviceName: 'Measurements API',
    operation: 'set primary water container',
    method: 'PUT',
  });
};

export const reorderWaterContainers = async (
  containerIds: number[]
): Promise<void> => {
  return apiFetch<void>({
    endpoint: '/api/water-containers/reorder',
    serviceName: 'Measurements API',
    operation: 'reorder water containers',
    method: 'PUT',
    body: { container_ids: containerIds },
  });
};

export const fetchDrinkPresetCatalog = async (): Promise<
  DrinkPresetCatalogEntry[]
> => {
  return apiFetch<DrinkPresetCatalogEntry[]>({
    endpoint: '/api/water-containers/catalog',
    serviceName: 'Measurements API',
    operation: 'fetch drink preset catalog',
  });
};

/** Materializes a catalog preset into a per-user food + linked container. */
export const addDrinkPreset = async (
  catalogId: string
): Promise<WaterContainer> => {
  return apiFetch<WaterContainer>({
    endpoint: '/api/water-containers/presets',
    serviceName: 'Measurements API',
    operation: 'add drink preset',
    method: 'POST',
    body: { catalog_id: catalogId },
  });
};

/**
 * Fetches measurements for a date range.
 */
export const fetchMeasurementsRange = async (
  startDate: string,
  endDate: string
): Promise<CheckInMeasurementRange[]> => {
  return apiFetch<CheckInMeasurementRange[]>({
    endpoint: `/api/measurements/check-in-measurements-range/${startDate}/${endDate}`,
    serviceName: 'Measurements API',
    operation: 'fetch measurements range',
  });
};

export type WaterIntakeRangeEntry = {
  entry_date: string;
  water_ml: number;
};

/**
 * Fetches one water total per day that has logged water in the range. Days with no
 * intake are absent from the response, not returned as zero.
 */
export const fetchWaterIntakeRange = async (
  startDate: string,
  endDate: string
): Promise<WaterIntakeRangeEntry[]> => {
  return apiFetch<WaterIntakeRangeEntry[]>({
    endpoint: `/api/measurements/water-intake-range/${startDate}/${endDate}`,
    serviceName: 'Measurements API',
    operation: 'fetch water intake range',
  });
};

/**
 * Per-field carry-forward lookup: the newest recorded value on or before the
 * given day, one entry per standard field.
 *
 * The plain `/check-in/:date` endpoint carries forward too, but this one answers
 * `null` rather than `{}` when the user has no history at all, and it is not
 * shared with the read path the diary uses for a single day's real values.
 * `steps` and `bmr` are deliberately same-day only on the server.
 */
export const fetchLatestCheckInMeasurementsOnOrBefore = async (
  date: string
): Promise<CheckInMeasurement | null> => {
  const result = await apiFetch<CheckInMeasurement | null>({
    endpoint: `/api/measurements/check-in/latest-on-or-before-date?date=${encodeURIComponent(date)}`,
    serviceName: 'Measurements API',
    operation: 'fetch latest check-in measurements on or before date',
  });
  if (!result || Object.keys(result).length === 0) return null;
  return result;
};

/**
 * Page size for the legacy list fallback. The bulk endpoint needs no bound, so
 * this only applies to a server that predates it.
 */
const CUSTOM_ENTRY_HINT_FALLBACK_LIMIT = 1000;

/**
 * Latest manual value per custom category on or before the given day.
 *
 * The preferred path is one bulk request that resolves every category
 * server-side. A server that predates that endpoint cannot serve it, and the
 * failure mode is deceptive: `/custom-entries/:date` also matches this literal
 * path, accepts `latest-manual-on-or-before-date` as its date parameter, and
 * only fails once Postgres rejects the value — so the client sees a 500, not a
 * 404. Rather than surface that as "no history", fall back to the long-standing
 * list endpoint and narrow it here.
 *
 * The legacy endpoint cannot express this query: it accepts `limit` but no
 * offset and no date bound, and the per-category range endpoint does not return
 * `source`, so it cannot separate a manual value from a health-sync sample.
 * Paging is therefore impossible, so the fallback asks for the newest page and
 * reasons about what that page can prove.
 *
 * The page is ordered newest-first, so an entry left outside it is always older
 * than every entry inside it. That makes the reduction sound for anything it
 * returns: for a category with an entry on or before `date` inside the page,
 * that entry is the newest such entry overall, because anything older sits
 * further back still. The one case it cannot speak for is a page holding no
 * entry on or before `date` at all — the reduction would then be empty and claim
 * "no previous values" while older history may exist unfetched. That case fails
 * loudly instead, so the screen asks for a server update rather than showing an
 * empty field as though it were the answer.
 *
 * Both consequences only affect servers without the bulk endpoint.
 */
export const fetchLatestManualCustomEntriesOnOrBefore = async (
  date: string
): Promise<LatestManualCustomEntry[]> => {
  try {
    return await apiFetch<LatestManualCustomEntry[]>({
      endpoint: `/api/measurements/custom-entries/latest-manual-on-or-before-date?date=${encodeURIComponent(date)}`,
      serviceName: 'Measurements API',
      operation: 'fetch latest manual custom entries on or before date',
    });
  } catch (error) {
    // Only the two shapes an older server can produce warrant a second request.
    // A 401 already triggered `notifySessionExpired` inside `apiFetch`, so
    // retrying would notify the user twice; a network failure or timeout would
    // just spend a second request on a connection that is already struggling.
    const status = error instanceof ApiError ? error.statusCode : undefined;
    if (status !== 404 && status !== 500) throw error;

    // Kept outside the request's own try/catch so a truncation failure
    // propagates as-is instead of being replaced by the bulk error.
    let entries: CustomMeasurementEntry[];
    try {
      entries = await apiFetch<CustomMeasurementEntry[]>({
        endpoint: `/api/measurements/custom-entries?limit=${CUSTOM_ENTRY_HINT_FALLBACK_LIMIT}&orderBy=entry_timestamp.desc`,
        serviceName: 'Measurements API',
        operation: 'fetch custom entries for previous-value hints',
      });
    } catch {
      // Both paths failed: report the original failure, which describes the
      // preferred request rather than the fallback.
      throw error;
    }

    // Reduce first, then decide whether the page could prove anything. Deriving
    // the guard from the reduction instead of a parallel predicate is the point:
    // an earlier version asked only "does the page hold an entry on or before
    // the day?", which a health-sync sample satisfies while the reduction
    // discards it. The page then looked usable, produced no hints, and the screen
    // showed empty fields with nothing to explain them. Reusing the reduction
    // makes that class of drift impossible.
    const hints = reduceLatestManualEntries(entries, date, isManualSource);

    // A full page means more entries exist beyond it. When the reduction is also
    // empty, nothing usable was found and the answer may sit in the unfetched
    // part, so fail loudly rather than report "no previous values".
    //
    // A non-empty reduction is sound and is returned as-is. Entries beyond the
    // page are older by `entry_timestamp`, and for the `Daily` categories this
    // editor renders the server stores a timestamp on the entry's own day, so
    // the unfetched tail cannot outrank a fetched on-or-before entry. A category
    // whose entire history is older than the page is simply absent, which shows
    // no suggestion rather than a wrong one.
    if (
      hints.length === 0 &&
      entries.length >= CUSTOM_ENTRY_HINT_FALLBACK_LIMIT
    ) {
      throw new Error(
        `Custom measurement history exceeds ${CUSTOM_ENTRY_HINT_FALLBACK_LIMIT} entries and none on or before ${date} are usable, so previous values cannot be resolved on this server version.`
      );
    }

    return hints;
  }
};

/**
 * Upserts a check-in measurement record for a given date.
 *
 * `undefined` fields are stripped by `JSON.stringify` and left unchanged
 * server-side. Pass `null` to explicitly clear a previously-saved value.
 */
export const upsertCheckIn = async (params: {
  entryDate: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  bodyFatPercentage?: number | null;
  muscleMassKg?: number | null;
  boneMassKg?: number | null;
  bodyWaterPercentage?: number | null;
  bmr?: number | null;
}): Promise<CheckInMeasurement> => {
  return apiFetch<CheckInMeasurement>({
    endpoint: '/api/measurements/check-in',
    serviceName: 'Measurements API',
    operation: 'upsert check-in',
    method: 'POST',
    body: {
      entry_date: params.entryDate,
      weight: params.weight,
      neck: params.neck,
      waist: params.waist,
      hips: params.hips,
      steps: params.steps,
      height: params.height,
      body_fat_percentage: params.bodyFatPercentage,
      muscle_mass_kg: params.muscleMassKg,
      bone_mass_kg: params.boneMassKg,
      body_water_percentage: params.bodyWaterPercentage,
      bmr: params.bmr,
    },
  });
};

export const fetchCustomCategories = async (): Promise<CustomCategory[]> => {
  return apiFetch<CustomCategory[]>({
    endpoint: '/api/measurements/custom-categories',
    serviceName: 'Measurements API',
    operation: 'fetch custom categories',
  });
};

export const fetchCustomMeasurementsByDate = async (
  date: string
): Promise<CustomMeasurementEntry[]> => {
  return apiFetch<CustomMeasurementEntry[]>({
    endpoint: `/api/measurements/custom-entries/${date}`,
    serviceName: 'Measurements API',
    operation: 'fetch custom measurements by date',
  });
};

export const saveCustomMeasurement = async (
  payload: SaveCustomMeasurementPayload
): Promise<CustomMeasurementEntry> => {
  return apiFetch<CustomMeasurementEntry>({
    endpoint: '/api/measurements/custom-entries',
    serviceName: 'Measurements API',
    operation: 'save custom measurement',
    method: 'POST',
    body: {
      category_id: payload.category_id,
      value: payload.value,
      entry_date: payload.entry_date,
      entry_hour: payload.entry_hour,
      entry_timestamp: payload.entry_timestamp,
      notes: payload.notes,
      source: payload.source,
    },
  });
};

export const deleteCustomMeasurement = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/measurements/custom-entries/${id}`,
    serviceName: 'Measurements API',
    operation: 'delete custom measurement',
    method: 'DELETE',
  });
};

/**
 * Changes water intake by adding or removing a drink.
 */
/**
 * Fetches the day's itemized water ledger (#1939): one row per logged drink,
 * each carrying its real `logged_at` timestamp and `source`. Used by
 * per-entry health writeback so each drink exports at the time it was
 * actually logged instead of one noon-anchored day total.
 */
export const fetchWaterIntakeLog = async (
  date: string
): Promise<WaterIntakeLogEntry[]> => {
  return apiFetch<WaterIntakeLogEntry[]>({
    endpoint: `/api/v2/measurements/water-intake/${date}/log`,
    serviceName: 'Measurements API',
    operation: 'fetch water intake log',
  });
};

export const changeWaterIntake = async (params: {
  entryDate: string;
  changeDrinks: number;
  containerId: number;
}): Promise<WaterIntakeResponse> => {
  return apiFetch<WaterIntakeResponse>({
    endpoint: '/api/measurements/water-intake',
    serviceName: 'Measurements API',
    operation: 'change water intake',
    method: 'POST',
    body: {
      entry_date: params.entryDate,
      change_drinks: params.changeDrinks,
      container_id: params.containerId,
    },
  });
};
