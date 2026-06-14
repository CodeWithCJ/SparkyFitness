import {
  insertRecords,
  deleteRecordsByUuids,
  getGrantedPermissions,
} from 'react-native-health-connect';
import { fetchDailySummary } from '../../../src/services/api/dailySummaryApi';
import { loadHealthPreference } from '../../../src/services/healthconnect/preferences';
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
  saveHealthPreference: jest.fn().mockResolvedValue(undefined),
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

const foodEntry = {
  id: 'fe1',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'serving',
  entry_date: '2026-06-14',
  serving_size: 1,
  food_name: 'Eggs',
  calories: 150,
  protein: 12,
};

// loadHealthPreference is used both for the enable flags and the written-id sets.
const prefs = (overrides: Record<string, unknown>) => {
  mockLoadPref.mockImplementation((key: string) =>
    Promise.resolve(key in overrides ? overrides[key] : null),
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted.mockResolvedValue([
    { recordType: 'Nutrition', accessType: 'write' },
    { recordType: 'Hydration', accessType: 'write' },
  ]);
  mockSummary.mockResolvedValue({ foodEntries: [foodEntry], waterIntake: 500 });
});

describe('writebackPhase', () => {
  it('does nothing when both metrics are disabled', async () => {
    prefs({ writebackNutritionEnabled: false, writebackWaterEnabled: false });
    await writebackPhase(['2026-06-14']);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('writes nutrition records when enabled and permission granted', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-14']);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const records = mockInsert.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].recordType).toBe('Nutrition');
    expect(records[0].metadata.clientRecordId).toBe('sparky-nutrition-fe1');
  });

  it('skips a metric when its write permission is not granted', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockGranted.mockResolvedValue([]); // nothing granted
    await writebackPhase(['2026-06-14']);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('deletes stale records that are no longer present', async () => {
    // Previously wrote two ids; only fe1 remains this run → the other is stale.
    prefs({
      writebackNutritionEnabled: true,
      'writebackNutritionIds:2026-06-14': ['sparky-nutrition-fe1', 'sparky-nutrition-gone'],
    });
    await writebackPhase(['2026-06-14']);
    expect(mockDelete).toHaveBeenCalledWith('Nutrition', [], ['sparky-nutrition-gone']);
  });

  it('writes water and deletes the day record when water drops to 0', async () => {
    prefs({
      writebackHydrationEnabled: true,
      'writebackHydrationIds:2026-06-14': ['sparky-water-2026-06-14'],
    });
    mockSummary.mockResolvedValue({ foodEntries: [], waterIntake: 0 });
    await writebackPhase(['2026-06-14']);
    expect(mockInsert).not.toHaveBeenCalled(); // ml<=0 → no record
    expect(mockDelete).toHaveBeenCalledWith('Hydration', [], ['sparky-water-2026-06-14']);
  });

  it('is idempotent — same input yields the same clientRecordIds', async () => {
    prefs({ writebackNutritionEnabled: true });
    await writebackPhase(['2026-06-14']);
    await writebackPhase(['2026-06-14']);
    const first = mockInsert.mock.calls[0][0][0].metadata.clientRecordId;
    const second = mockInsert.mock.calls[1][0][0].metadata.clientRecordId;
    expect(first).toBe(second);
  });

  it('swallows a Health Connect quota error', async () => {
    prefs({ writebackNutritionEnabled: true });
    mockInsert.mockRejectedValueOnce(new Error('quota'));
    const { isQuotaExceededError } = jest.requireMock('../../../src/services/healthconnect/index');
    (isQuotaExceededError as jest.Mock).mockReturnValue(true);
    await expect(writebackPhase(['2026-06-14'])).resolves.toBeUndefined();
  });
});
