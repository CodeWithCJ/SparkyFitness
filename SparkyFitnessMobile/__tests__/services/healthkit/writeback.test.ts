import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveCorrelationSample,
  saveQuantitySample,
  deleteObjects,
  authorizationStatusFor,
} from '@kingstinct/react-native-healthkit';
import { fetchDailySummary } from '../../../src/services/api/dailySummaryApi';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';
import {
  writebackPhase,
  runWriteback,
  removeWrittenData,
} from '../../../src/services/healthkit/writeback';

jest.mock('../../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));
jest.mock('../../../src/utils/loggedMealCollapse', () => ({
  resolveCollapsedFoodEntries: jest.fn((_date: string, entries: unknown) => Promise.resolve(entries)),
}));
jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
  HEALTH_PREFERENCE_PREFIX: '@HealthKit',
}));
jest.mock('../../../src/services/storage', () => ({
  loadLastWritebackTime: jest.fn().mockResolvedValue(null),
  saveLastWritebackTime: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

// HealthKit save/delete/auth come from the global jest.setup mock; grab handles to
// configure deterministic returns per test.
const mockSaveCorrelation = saveCorrelationSample as jest.Mock;
const mockSaveQuantity = saveQuantitySample as jest.Mock;
const mockDeleteObjects = deleteObjects as jest.Mock;
const mockAuthStatus = authorizationStatusFor as jest.Mock;
const mockSummary = fetchDailySummary as jest.Mock;
const mockLoadPref = loadHealthPreference as jest.Mock;
const mockSavePref = saveHealthPreference as jest.Mock;

const ENERGY = 'HKQuantityTypeIdentifierDietaryEnergyConsumed';
const PROTEIN = 'HKQuantityTypeIdentifierDietaryProtein';
const SODIUM = 'HKQuantityTypeIdentifierDietarySodium';
const WATER = 'HKQuantityTypeIdentifierDietaryWater';
const FOOD_CORRELATION = 'HKCorrelationTypeIdentifierFood';
const SHARING_AUTHORIZED = 2;
const SHARING_DENIED = 1;

const foodEntry = {
  id: 'fe1',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-06-01',
  serving_size: 1,
  food_name: 'Eggs',
  calories: 150,
  protein: 12,
};

// Stateful preference store so saveHealthPreference writes are visible to a later
// loadHealthPreference — this is what lets us verify the signature-skip + replace logic.
let store: Record<string, unknown> = {};
const prefs = (initial: Record<string, unknown>) => {
  store = { ...initial };
  mockLoadPref.mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null),
  );
  mockSavePref.mockImplementation((key: string, value: unknown) => {
    store[key] = value;
    return Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  mockAuthStatus.mockReturnValue(SHARING_AUTHORIZED);
  mockDeleteObjects.mockResolvedValue(1);
  mockSaveQuantity.mockResolvedValue({ uuid: 'water-1' });
  mockSaveCorrelation.mockResolvedValue({
    uuid: 'corr-1',
    objects: [
      { uuid: 'obj-energy', quantityType: ENERGY },
      { uuid: 'obj-protein', quantityType: PROTEIN },
    ],
  });
  mockSummary.mockResolvedValue({ foodEntries: [foodEntry], waterIntake: 500 });
});

describe('writebackPhase', () => {
  it('does nothing when both metrics are disabled', async () => {
    prefs({ writebackNutritionEnabled: false, writebackHydrationEnabled: false });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).not.toHaveBeenCalled();
    expect(mockSaveQuantity).not.toHaveBeenCalled();
  });

  it('skips a metric whose write permission is not granted', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockAuthStatus.mockReturnValue(SHARING_DENIED); // energy not authorized
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).not.toHaveBeenCalled();
  });

  it('skips entries imported from a provider (source set)', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockSummary.mockResolvedValue({
      foodEntries: [{ ...foodEntry, source: 'apple_health' }],
      waterIntake: 0,
    });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).not.toHaveBeenCalled(); // nothing originated in Sparky
  });

  it('writes nutrition as a Food correlation and tracks UUIDs grouped by type', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(1);
    expect(mockSaveCorrelation.mock.calls[0][0]).toBe(FOOD_CORRELATION);
    // Contained-sample UUIDs grouped by quantityType, plus the correlation UUID.
    expect(store['writebackNutritionUuids:2026-06-01']).toEqual({
      [ENERGY]: ['obj-energy'],
      [PROTEIN]: ['obj-protein'],
      [FOOD_CORRELATION]: ['corr-1'],
    });
  });

  it('attaches the food name and capitalized meal label as correlation metadata', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-01']);
    // metadata is the 5th arg to saveCorrelationSample(type, samples, start, end, metadata)
    expect(mockSaveCorrelation.mock.calls[0][4]).toMatchObject({
      HKFoodType: 'Eggs',
      Meal: 'Breakfast', // meal_type 'breakfast' → canonical label (HealthKit has no meal field)
    });
  });

  it('stamps the food name and meal label onto each contained sample (Apple Health reads sample metadata, not the correlation)', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-01']);
    // samples are the 2nd arg to saveCorrelationSample(type, samples, start, end, metadata)
    const samples = mockSaveCorrelation.mock.calls[0][1] as { metadata?: Record<string, unknown> }[];
    expect(samples.length).toBeGreaterThan(0);
    samples.forEach((s) => {
      expect(s.metadata).toMatchObject({ HKFoodType: 'Eggs', Meal: 'Breakfast' });
    });
  });

  it("deletes the previous run's records grouped by type before saving", async () => {
    prefs({
      writebackNutritionEnabled: true,
      'writebackNutritionUuids:2026-06-01': {
        [ENERGY]: ['old-energy'],
        [FOOD_CORRELATION]: ['old-corr'],
      },
    });
    await writebackPhase(['2026-06-01']);
    expect(mockDeleteObjects).toHaveBeenCalledWith(ENERGY, { uuids: ['old-energy'] });
    expect(mockDeleteObjects).toHaveBeenCalledWith(FOOD_CORRELATION, { uuids: ['old-corr'] });
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(1);
  });

  it('filters a denied nutrient out of the correlation but still writes the food', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockAuthStatus.mockImplementation((t: string) => (t === SODIUM ? SHARING_DENIED : SHARING_AUTHORIZED));
    mockSummary.mockResolvedValue({ foodEntries: [{ ...foodEntry, sodium: 500 }], waterIntake: 0 });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(1);
    const samples = mockSaveCorrelation.mock.calls[0][1] as { quantityType: string }[];
    const types = samples.map((s) => s.quantityType);
    expect(types).toContain(ENERGY);
    expect(types).not.toContain(SODIUM); // denied nutrient dropped, food still written
  });

  it('does not advance the signature when a save fails (retries next run)', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockSaveCorrelation.mockResolvedValueOnce(undefined); // save failed this run
    await writebackPhase(['2026-06-01']);
    // UUID map persisted (empty), but signature withheld so the next run retries.
    expect(store['writebackNutritionUuids:2026-06-01']).toEqual({});
    expect(store['writebackNutritionSig:2026-06-01']).toBeUndefined();

    await writebackPhase(['2026-06-01']); // unchanged data, but signature never advanced
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(2);
  });

  it('carries forward undeleted nutrition UUIDs and withholds the signature when a delete fails', async () => {
    prefs({
      writebackNutritionEnabled: true,
      'writebackNutritionUuids:2026-06-01': {
        [ENERGY]: ['old-energy'],
        [FOOD_CORRELATION]: ['old-corr'],
      },
    });
    mockDeleteObjects.mockRejectedValue(new Error('permission revoked'));
    await writebackPhase(['2026-06-01']);

    // Old UUIDs we couldn't delete are kept alongside the freshly-written ones, so a later
    // run retries the delete rather than orphaning them in HealthKit.
    const map = store['writebackNutritionUuids:2026-06-01'] as Record<string, string[]>;
    expect(map[ENERGY]).toEqual(expect.arrayContaining(['obj-energy', 'old-energy']));
    expect(map[FOOD_CORRELATION]).toEqual(expect.arrayContaining(['corr-1', 'old-corr']));
    // Signature withheld so the next run re-enters and retries the delete.
    expect(store['writebackNutritionSig:2026-06-01']).toBeUndefined();
  });

  it('carries forward undeleted water UUIDs and withholds the signature when its delete fails', async () => {
    prefs({
      writebackHydrationEnabled: true,
      'writebackHydrationUuids:2026-06-01': ['old-water'],
    });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 500 });
    mockDeleteObjects.mockRejectedValue(new Error('boom'));
    await writebackPhase(['2026-06-01']);

    expect(store['writebackHydrationUuids:2026-06-01']).toEqual(
      expect.arrayContaining(['water-1', 'old-water']),
    );
    expect(store['writebackHydrationSig:2026-06-01']).toBeUndefined();
  });

  it('makes no HealthKit writes on an unchanged second run', async () => {
    prefs({ writebackNutritionEnabled: true });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(1);
    const deletesAfterFirst = mockDeleteObjects.mock.calls.length;

    // Version differs (Date.now changed) but the day's content is identical → skip.
    nowSpy.mockReturnValue(2000);
    await writebackPhase(['2026-06-01']);
    expect(mockSaveCorrelation).toHaveBeenCalledTimes(1); // no new save
    expect(mockDeleteObjects.mock.calls.length).toBe(deletesAfterFirst); // no new delete
    nowSpy.mockRestore();
  });

  it('writes a hydration sample and tracks its UUID', async () => {
    prefs({ writebackHydrationEnabled: true });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 500 });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveQuantity).toHaveBeenCalledWith(
      WATER, 'mL', 500, expect.any(Date), expect.any(Date), expect.anything(),
    );
    expect(store['writebackHydrationUuids:2026-06-01']).toEqual(['water-1']);
  });

  it('deletes the previous water record when water drops to 0', async () => {
    prefs({
      writebackHydrationEnabled: true,
      'writebackHydrationUuids:2026-06-01': ['old-water'],
    });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 0 });
    await writebackPhase(['2026-06-01']);
    expect(mockSaveQuantity).not.toHaveBeenCalled(); // ml<=0 → no record
    expect(mockDeleteObjects).toHaveBeenCalledWith(WATER, { uuids: ['old-water'] });
  });

  it('returns true once all dates are attempted (no quota concept)', async () => {
    prefs({ writebackNutritionEnabled: true });
    await expect(writebackPhase(['2026-06-01'])).resolves.toBe(true);
  });
});

describe('runWriteback (cursor)', () => {
  const { saveLastWritebackTime } = jest.requireMock('../../../src/services/storage');
  const mockSaveCursor = saveLastWritebackTime as jest.Mock;

  it('advances the cursor after a completed run', async () => {
    prefs({ writebackNutritionEnabled: true });
    await runWriteback();
    expect(mockSaveCursor).toHaveBeenCalled();
  });

  it('advances the cursor (without holding it) when a metric is not authorized', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockAuthStatus.mockReturnValue(SHARING_DENIED); // nothing granted
    await runWriteback();
    expect(mockSaveCorrelation).not.toHaveBeenCalled();
    expect(mockSaveCursor).toHaveBeenCalled(); // skipped without holding the cursor
  });
});

describe('removeWrittenData (cleanup)', () => {
  it('full purge: range-deletes each type all-time, clears tracking, disables writeback', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('@HealthKit:writebackNutritionUuids:2026-06-01', JSON.stringify({ [ENERGY]: ['u1'] }));
    await AsyncStorage.setItem('@HealthKit:writebackHydrationSig:2026-06-15', '"sig"');
    await AsyncStorage.setItem('@HealthKit:syncDuration', '"daily"'); // unrelated — must survive

    const result = await removeWrittenData(null);
    expect(result).toEqual({ ok: true });

    // Predicate (range) delete per sample type — catches orphans, not just tracked UUIDs.
    const allTime = { date: expect.objectContaining({ endDate: expect.any(Date) }) };
    expect(mockDeleteObjects).toHaveBeenCalledWith(ENERGY, allTime);
    expect(mockDeleteObjects).toHaveBeenCalledWith(WATER, allTime);
    expect(mockDeleteObjects).toHaveBeenCalledWith(FOOD_CORRELATION, allTime);

    const remaining = await AsyncStorage.getAllKeys();
    expect(remaining).not.toContain('@HealthKit:writebackNutritionUuids:2026-06-01');
    expect(remaining).not.toContain('@HealthKit:writebackHydrationSig:2026-06-15');
    expect(remaining).toContain('@HealthKit:syncDuration');

    expect(mockSavePref).toHaveBeenCalledWith('writebackNutritionEnabled', false);
    expect(mockSavePref).toHaveBeenCalledWith('writebackHydrationEnabled', false);
  });

  it('date range: range-deletes with start+end, clears only in-range tracking, keeps writeback on', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('@HealthKit:writebackNutritionUuids:2026-06-10', JSON.stringify({ [ENERGY]: ['in'] }));
    await AsyncStorage.setItem('@HealthKit:writebackNutritionUuids:2026-06-20', JSON.stringify({ [ENERGY]: ['out'] }));

    const result = await removeWrittenData({ from: '2026-06-08', to: '2026-06-12' });
    expect(result).toEqual({ ok: true });
    expect(mockDeleteObjects).toHaveBeenCalledWith(
      WATER,
      { date: expect.objectContaining({ startDate: expect.any(Date), endDate: expect.any(Date) }) },
    );

    const remaining = await AsyncStorage.getAllKeys();
    expect(remaining).not.toContain('@HealthKit:writebackNutritionUuids:2026-06-10'); // in range → cleared
    expect(remaining).toContain('@HealthKit:writebackNutritionUuids:2026-06-20'); // out of range → kept
    expect(mockSavePref).not.toHaveBeenCalledWith('writebackNutritionEnabled', false);
  });

  it('reports partial failure (ok=false) when a delete throws', async () => {
    await AsyncStorage.clear();
    mockDeleteObjects.mockRejectedValueOnce(new Error('denied'));
    const result = await removeWrittenData(null);
    expect(result).toEqual({ ok: false });
  });
});
