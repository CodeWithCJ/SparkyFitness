import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  insertRecords,
  deleteRecordsByUuids,
  deleteRecordsByTimeRange,
  getGrantedPermissions,
} from 'react-native-health-connect';
import { fetchDailySummary } from '../../../src/services/api/dailySummaryApi';
import { fetchWaterIntakeLog } from '../../../src/services/api/measurementsApi';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthconnect/preferences';
// Jest resolves './writeback' to the iOS no-op stub by default; require the .ts
// explicitly to test the real Android implementation (see SparkyFitnessMobile CLAUDE.md).
const {
  writebackPhase,
  runWriteback,
  removeWrittenData,
} = require('../../../src/services/healthconnect/writeback.ts');

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn().mockResolvedValue([]),
  deleteRecordsByUuids: jest.fn().mockResolvedValue(undefined),
  deleteRecordsByTimeRange: jest.fn().mockResolvedValue(undefined),
  getGrantedPermissions: jest.fn(),
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));
jest.mock('../../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));
jest.mock('../../../src/services/api/measurementsApi', () => ({
  fetchWaterIntakeLog: jest.fn(),
}));
jest.mock('../../../src/utils/loggedMealCollapse', () => ({
  resolveCollapsedFoodEntries: jest.fn((_date: string, entries: unknown) =>
    Promise.resolve(entries)
  ),
}));
jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
  HEALTH_PREFERENCE_PREFIX: '@HealthConnect',
}));
jest.mock('../../../src/services/healthconnect/index', () => ({
  isQuotaExceededError: jest.fn(() => false),
}));
jest.mock('../../../src/services/storage', () => ({
  loadLastWritebackTime: jest.fn().mockResolvedValue(null),
  saveLastWritebackTime: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockInsert = insertRecords as jest.Mock;
const mockDelete = deleteRecordsByUuids as jest.Mock;
const mockDeleteByRange = deleteRecordsByTimeRange as jest.Mock;
const mockGranted = getGrantedPermissions as jest.Mock;
const mockSummary = fetchDailySummary as jest.Mock;
const mockWaterLog = fetchWaterIntakeLog as jest.Mock;
const mockLoadPref = loadHealthPreference as jest.Mock;
const mockSavePref = saveHealthPreference as jest.Mock;

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
// loadHealthPreference — this is what lets us verify the delete-previous behaviour.
let store: Record<string, unknown> = {};
const prefs = (initial: Record<string, unknown>) => {
  store = { ...initial };
  mockLoadPref.mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  mockSavePref.mockImplementation((key: string, value: unknown) => {
    store[key] = value;
    return Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  mockGranted.mockResolvedValue([
    { recordType: 'Nutrition', accessType: 'write' },
    { recordType: 'Hydration', accessType: 'write' },
  ]);
  mockSummary.mockResolvedValue({ foodEntries: [foodEntry], waterIntake: 500 });
  mockWaterLog.mockResolvedValue([]);
});

// One manually-logged drink at a real timestamp (#1939) — the default shape
// a hydration test builds on top of.
const manualLogEntry = (
  waterMl = 500,
  loggedAt = '2026-06-01T09:00:00.000Z'
) => ({
  id: 'log-1',
  user_id: 'user-1',
  entry_date: '2026-06-01',
  water_ml: waterMl,
  container_id: null,
  container_name: null,
  source: 'manual',
  created_at: loggedAt,
  logged_at: loggedAt,
});

describe('writebackPhase', () => {
  it('does nothing when both metrics are disabled', async () => {
    prefs({
      writebackNutritionEnabled: false,
      writebackHydrationEnabled: false,
    });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('writes nutrition records when enabled and permission granted', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const records = mockInsert.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe('Nutrition');
    // clientRecordId is version-suffixed (fresh per run) but stable in shape.
    expect(records[0].metadata.clientRecordId).toMatch(
      /^sparky-nutrition-fe1-\d+$/
    );
  });

  it('skips a metric when its write permission is not granted', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockGranted.mockResolvedValue([]); // nothing granted
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips entries imported from a provider (source set)', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockSummary.mockResolvedValue({
      foodEntries: [{ ...foodEntry, source: 'health_connect' }],
      waterIntake: 0,
    });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).not.toHaveBeenCalled(); // nothing originated in Sparky
  });

  it("deletes the previous run's records before inserting", async () => {
    prefs({
      writebackNutritionEnabled: true,
      'writebackNutritionIds:2026-06-01': [
        'sparky-nutrition-fe1-1',
        'sparky-nutrition-gone-1',
      ],
    });
    await writebackPhase(['2026-06-01']);
    expect(mockDelete).toHaveBeenCalledWith(
      'Nutrition',
      [],
      ['sparky-nutrition-fe1-1', 'sparky-nutrition-gone-1']
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('writes one Hydration record per manually-logged drink at its real timestamp (#1939)', async () => {
    prefs({ writebackHydrationEnabled: true });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 500 });
    mockWaterLog.mockResolvedValue([manualLogEntry(500)]);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const record = mockInsert.mock.calls[0][0][0];
    expect(record.recordType).toBe('Hydration');
    expect(record.volume).toEqual({ value: 500, unit: 'milliliters' });
  });

  it('writes one record per ledger row and never re-exports a provider-synced row', async () => {
    prefs({ writebackHydrationEnabled: true });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 750 });
    mockWaterLog.mockResolvedValue([
      manualLogEntry(500, '2026-06-01T09:00:00.000Z'),
      { ...manualLogEntry(250, '2026-06-01T15:00:00.000Z'), id: 'log-2' },
      {
        ...manualLogEntry(1000, '2026-06-01T08:00:00.000Z'),
        id: 'log-3',
        source: 'health_connect', // imported -- must not be re-exported
      },
    ]);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const records = mockInsert.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(
      records.map((r: { volume: { value: number } }) => r.volume.value)
    ).toEqual(expect.arrayContaining([500, 250]));
  });

  it('folds food-derived water into one synthetic noon-anchored record (#1557, #1629)', async () => {
    prefs({ writebackHydrationEnabled: true });
    mockSummary.mockResolvedValue({
      foodEntries: [],
      waterIntake: 300,
      waterIntakeBreakdown: {
        water_ml: 300,
        manual_ml: 0,
        ledger_ml: 0,
        food_ml: 300,
      },
    });
    mockWaterLog.mockResolvedValue([]);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const records = mockInsert.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].volume).toEqual({ value: 300, unit: 'milliliters' });
  });

  it('writes water and deletes the day record when there is nothing left to write', async () => {
    prefs({
      writebackHydrationEnabled: true,
      'writebackHydrationIds:2026-06-01': ['sparky-water-2026-06-01-1'],
    });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 0 });
    mockWaterLog.mockResolvedValue([]);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).not.toHaveBeenCalled(); // nothing to write
    expect(mockDelete).toHaveBeenCalledWith(
      'Hydration',
      [],
      ['sparky-water-2026-06-01-1']
    );
  });

  // Regression: a pre-noon run used to store the empty signature, making every
  // later run that day report "unchanged — skipped" regardless of the total.
  // Real ledger rows carry a concrete logged_at and never defer; only the
  // synthetic food-water remainder still anchors to noon and can defer.
  it('defers only the food-water remainder without storing a signature while the noon anchor is in the future', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // local tomorrow: noon anchor guaranteed future
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    prefs({ writebackHydrationEnabled: true });
    mockSummary.mockResolvedValue({
      foodEntries: [],
      waterIntake: 750,
      waterIntakeBreakdown: {
        water_ml: 750,
        manual_ml: 0,
        ledger_ml: 0,
        food_ml: 750,
      },
    });
    mockWaterLog.mockResolvedValue([]);
    await writebackPhase([tomorrow]);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(store[`writebackHydrationSig:${tomorrow}`]).toBeUndefined();
  });

  it('makes no Health Connect writes on an unchanged second run', async () => {
    prefs({ writebackNutritionEnabled: true });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const deletesAfterFirst = mockDelete.mock.calls.length;

    // Version differs (Date.now changed) but the day's content is identical → skip.
    nowSpy.mockReturnValue(2000);
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1); // no new insert
    expect(mockDelete.mock.calls.length).toBe(deletesAfterFirst); // no new delete
    nowSpy.mockRestore();
  });

  it("rewrites when the day's data changed", async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(1);

    // Diary changed (different calories) → different signature → re-write.
    mockSummary.mockResolvedValue({
      foodEntries: [{ ...foodEntry, calories: 999 }],
      waterIntake: 500,
    });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('returns false (does not throw) on a Health Connect quota error', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockInsert.mockRejectedValueOnce(new Error('quota'));
    const { isQuotaExceededError } = jest.requireMock(
      '../../../src/services/healthconnect/index'
    );
    (isQuotaExceededError as jest.Mock).mockReturnValue(true);
    await expect(writebackPhase(['2026-06-01'])).resolves.toBe(false);
  });
});

describe('runWriteback (cursor)', () => {
  const { saveLastWritebackTime } = jest.requireMock(
    '../../../src/services/storage'
  );
  const mockSaveCursor = saveLastWritebackTime as jest.Mock;

  it('advances the cursor after a completed run', async () => {
    prefs({ writebackNutritionEnabled: true });
    await runWriteback();
    expect(mockSaveCursor).toHaveBeenCalled();
  });

  it('holds the cursor when a quota error stops the run early', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockInsert.mockRejectedValue(new Error('quota'));
    const { isQuotaExceededError } = jest.requireMock(
      '../../../src/services/healthconnect/index'
    );
    (isQuotaExceededError as jest.Mock).mockReturnValue(true);
    await runWriteback();
    expect(mockSaveCursor).not.toHaveBeenCalled();
  });
});

describe('removeWrittenData (cleanup)', () => {
  it('full purge: deletes all-time, clears all tracking, disables writeback', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(
      '@HealthConnect:writebackNutritionIds:2026-06-01',
      JSON.stringify(['x'])
    );
    await AsyncStorage.setItem(
      '@HealthConnect:writebackHydrationSig:2026-06-15',
      '"sig"'
    );
    await AsyncStorage.setItem('@HealthConnect:syncDuration', '"daily"'); // unrelated — must survive

    const result = await removeWrittenData(null);
    expect(result).toEqual({ ok: true });

    // All-time = "before now" per record type.
    expect(mockDeleteByRange).toHaveBeenCalledWith(
      'Nutrition',
      expect.objectContaining({ operator: 'before' })
    );
    expect(mockDeleteByRange).toHaveBeenCalledWith(
      'Hydration',
      expect.objectContaining({ operator: 'before' })
    );

    const remaining = await AsyncStorage.getAllKeys();
    expect(remaining).not.toContain(
      '@HealthConnect:writebackNutritionIds:2026-06-01'
    );
    expect(remaining).not.toContain(
      '@HealthConnect:writebackHydrationSig:2026-06-15'
    );
    expect(remaining).toContain('@HealthConnect:syncDuration');

    expect(mockSavePref).toHaveBeenCalledWith(
      'writebackNutritionEnabled',
      false
    );
    expect(mockSavePref).toHaveBeenCalledWith(
      'writebackHydrationEnabled',
      false
    );
  });

  it('date range: deletes "between", clears only in-range tracking, keeps writeback on', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(
      '@HealthConnect:writebackNutritionIds:2026-06-10',
      JSON.stringify(['in'])
    );
    await AsyncStorage.setItem(
      '@HealthConnect:writebackNutritionIds:2026-06-20',
      JSON.stringify(['out'])
    );

    const result = await removeWrittenData({
      from: '2026-06-08',
      to: '2026-06-12',
    });
    expect(result).toEqual({ ok: true });
    expect(mockDeleteByRange).toHaveBeenCalledWith(
      'Nutrition',
      expect.objectContaining({ operator: 'between' })
    );

    const remaining = await AsyncStorage.getAllKeys();
    expect(remaining).not.toContain(
      '@HealthConnect:writebackNutritionIds:2026-06-10'
    ); // in range → cleared
    expect(remaining).toContain(
      '@HealthConnect:writebackNutritionIds:2026-06-20'
    ); // out of range → kept
    expect(mockSavePref).not.toHaveBeenCalledWith(
      'writebackNutritionEnabled',
      false
    ); // toggles untouched
  });

  it('reports partial failure (ok=false) when a delete throws', async () => {
    await AsyncStorage.clear();
    mockDeleteByRange.mockRejectedValueOnce(new Error('permission revoked'));
    const result = await removeWrittenData(null);
    expect(result).toEqual({ ok: false });
  });
});
