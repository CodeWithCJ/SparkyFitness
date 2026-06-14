import {
  insertRecords,
  deleteRecordsByUuids,
  getGrantedPermissions,
} from 'react-native-health-connect';
import { fetchDailySummary } from '../../../src/services/api/dailySummaryApi';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthconnect/preferences';
// Jest resolves './writeback' to the iOS no-op stub by default; require the .ts
// explicitly to test the real Android implementation (see SparkyFitnessMobile CLAUDE.md).
const { writebackPhase } = require('../../../src/services/healthconnect/writeback.ts');

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn().mockResolvedValue([]),
  deleteRecordsByUuids: jest.fn().mockResolvedValue(undefined),
  getGrantedPermissions: jest.fn(),
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));
jest.mock('../../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));
jest.mock('../../../src/utils/loggedMealCollapse', () => ({
  resolveCollapsedFoodEntries: jest.fn((_date: string, entries: unknown) => Promise.resolve(entries)),
}));
jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));
jest.mock('../../../src/services/healthconnect/index', () => ({
  isQuotaExceededError: jest.fn(() => false),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockInsert = insertRecords as jest.Mock;
const mockDelete = deleteRecordsByUuids as jest.Mock;
const mockGranted = getGrantedPermissions as jest.Mock;
const mockSummary = fetchDailySummary as jest.Mock;
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
  mockGranted.mockResolvedValue([
    { recordType: 'Nutrition', accessType: 'write' },
    { recordType: 'Hydration', accessType: 'write' },
  ]);
  mockSummary.mockResolvedValue({ foodEntries: [foodEntry], waterIntake: 500 });
});

describe('writebackPhase', () => {
  it('does nothing when both metrics are disabled', async () => {
    prefs({ writebackNutritionEnabled: false, writebackHydrationEnabled: false });
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
    expect(records[0].metadata.clientRecordId).toMatch(/^sparky-nutrition-fe1-\d+$/);
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
    expect(mockDelete).toHaveBeenCalledWith('Nutrition', [], [
      'sparky-nutrition-fe1-1',
      'sparky-nutrition-gone-1',
    ]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('writes water and deletes the day record when water drops to 0', async () => {
    prefs({
      writebackHydrationEnabled: true,
      'writebackHydrationIds:2026-06-01': ['sparky-water-2026-06-01-1'],
    });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 0 });
    await writebackPhase(['2026-06-01']);
    expect(mockInsert).not.toHaveBeenCalled(); // ml<=0 → no record
    expect(mockDelete).toHaveBeenCalledWith('Hydration', [], ['sparky-water-2026-06-01-1']);
  });

  it('is idempotent — a second run deletes the first run\'s record', async () => {
    prefs({ writebackNutritionEnabled: true });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
    await writebackPhase(['2026-06-01']);
    const firstId = mockInsert.mock.calls[0][0][0].metadata.clientRecordId;
    expect(firstId).toBe('sparky-nutrition-fe1-1000');

    nowSpy.mockReturnValue(2000);
    await writebackPhase(['2026-06-01']);
    // Second run deletes exactly what the first run wrote, then inserts fresh.
    expect(mockDelete).toHaveBeenLastCalledWith('Nutrition', [], ['sparky-nutrition-fe1-1000']);
    expect(mockInsert.mock.calls[1][0][0].metadata.clientRecordId).toBe('sparky-nutrition-fe1-2000');
    nowSpy.mockRestore();
  });

  it('swallows a Health Connect quota error', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockInsert.mockRejectedValueOnce(new Error('quota'));
    const { isQuotaExceededError } = jest.requireMock('../../../src/services/healthconnect/index');
    (isQuotaExceededError as jest.Mock).mockReturnValue(true);
    await expect(writebackPhase(['2026-06-01'])).resolves.toBeUndefined();
  });
});
