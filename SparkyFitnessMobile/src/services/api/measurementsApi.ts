import { apiFetch } from './apiClient';
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
 * Latest manual value per custom category on or before the given day.
 *
 * One request resolves every category, so the Daily editor's previous-value
 * hints do not fan out per category. The server filters to manual sources, so
 * health-sync samples are never returned as suggestions.
 */
export const fetchLatestManualCustomEntriesOnOrBefore = async (
  date: string
): Promise<LatestManualCustomEntry[]> => {
  return apiFetch<LatestManualCustomEntry[]>({
    endpoint: `/api/measurements/custom-entries/latest-manual-on-or-before-date?date=${encodeURIComponent(date)}`,
    serviceName: 'Measurements API',
    operation: 'fetch latest manual custom entries on or before date',
  });
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
