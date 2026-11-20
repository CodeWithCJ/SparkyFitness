import {
  insertRecords,
  deleteRecordsByUuids,
  readRecords,
} from 'react-native-health-connect';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthconnect/preferences';
import {
  bodyValueFromRecord,
  bodyValueToRecord,
  writeBodyMetricForDate,
} from '../../../src/services/healthconnect/bodyWriteback';
import type { CheckInMeasurementRange } from '../../../src/types/measurements';

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn().mockResolvedValue([]),
  deleteRecordsByUuids: jest.fn().mockResolvedValue(undefined),
  readRecords: jest.fn().mockResolvedValue({ records: [] }),
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
}));
jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockInsert = insertRecords as jest.Mock;
const mockDelete = deleteRecordsByUuids as jest.Mock;
const mockRead = readRecords as jest.Mock;

let store: Record<string, unknown> = {};
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
  mockRead.mockResolvedValue({ records: [] });
});

const DATE = '2026-06-01';
const AFTER = new Date(2026, 5, 2, 9);
const NOON = new Date(2026, 5, 1, 12);
const row = (
  fields: Partial<CheckInMeasurementRange>
): CheckInMeasurementRange => ({
  id: 'r1',
  user_id: 'u1',
  entry_date: DATE,
  updated_at: '2026-06-01T08:00:00Z',
  ...fields,
});

describe('bodyValueToRecord', () => {
  it('writes each type in Health Connect units', () => {
    expect(bodyValueToRecord('weight', DATE, 80, NOON, 1)).toMatchObject({
      recordType: 'Weight',
      time: NOON.toISOString(),
      weight: { value: 80, unit: 'kilograms' },
      metadata: { clientRecordId: `sparky-body-weight-${DATE}-1` },
    });
    expect(bodyValueToRecord('bodyFat', DATE, 22.5, NOON, 1)).toMatchObject({
      recordType: 'BodyFat',
      percentage: 22.5,
    });
    expect(bodyValueToRecord('height', DATE, 180, NOON, 1)).toMatchObject({
      recordType: 'Height',
      height: { value: 1.8, unit: 'meters' },
    });
    expect(bodyValueToRecord('boneMass', DATE, 3.1, NOON, 1)).toMatchObject({
      recordType: 'BoneMass',
      mass: { value: 3.1, unit: 'kilograms' },
    });
    expect(bodyValueToRecord('bodyWaterMass', DATE, 44, NOON, 1)).toMatchObject(
      { recordType: 'BodyWaterMass', mass: { value: 44, unit: 'kilograms' } }
    );
  });

  it('reads values back in check-in units', () => {
    expect(
      bodyValueFromRecord('height', { height: { inMeters: 1.8 } })
    ).toBeCloseTo(180);
    expect(bodyValueFromRecord('bodyFat', { percentage: 22.5 })).toBe(22.5);
    expect(bodyValueFromRecord('weight', { weight: { inKilograms: 80 } })).toBe(
      80
    );
  });
});

describe('writeBodyMetricForDate', () => {
  it('writes the day value once and skips an unchanged day', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(store[`writebackBodyWeightIds:${DATE}`]).toEqual([
      `sparky-body-weight-${DATE}-1`,
    ]);

    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      2,
      true,
      AFTER
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('replaces the earlier record when the value changes', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 79.5 }),
      2,
      true,
      AFTER
    );
    expect(mockDelete).toHaveBeenCalledWith(
      'Weight',
      [],
      [`sparky-body-weight-${DATE}-1`]
    );
    expect(mockInsert).toHaveBeenLastCalledWith([
      expect.objectContaining({ weight: { value: 79.5, unit: 'kilograms' } }),
    ]);
  });

  it('writes again when a value is restored after a replacement failed', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    mockInsert.mockRejectedValueOnce(new Error('insert failed'));
    await expect(
      writeBodyMetricForDate(
        'weight',
        DATE,
        row({ weight: 81 }),
        2,
        true,
        AFTER
      )
    ).rejects.toThrow('insert failed');
    // The 80 record was deleted and 81 never landed; restoring 80 must not be
    // taken for an unchanged day.
    mockInsert.mockClear();
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      3,
      true,
      AFTER
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('removes the earlier record when the value is cleared', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: null }),
      2,
      true,
      AFTER
    );
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(store[`writebackBodyWeightIds:${DATE}`]).toEqual([]);
  });

  it('skips a day another app already recorded with the same value', async () => {
    mockRead.mockResolvedValue({
      records: [{ weight: { inKilograms: 80.02 }, metadata: {} }],
    });
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not count its own records as another app', async () => {
    mockRead.mockResolvedValue({
      records: [
        {
          weight: { inKilograms: 80 },
          metadata: { clientRecordId: `sparky-body-weight-${DATE}-0` },
        },
      ],
    });
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      AFTER
    );
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('writes without reading other apps when it has no read access', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      false,
      AFTER
    );
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('waits until noon for today', async () => {
    await writeBodyMetricForDate(
      'weight',
      DATE,
      row({ weight: 80 }),
      1,
      true,
      new Date(2026, 5, 1, 9)
    );
    expect(mockInsert).not.toHaveBeenCalled();
    expect(store[`writebackBodyWeightSig:${DATE}`]).toBeUndefined();
  });
});
