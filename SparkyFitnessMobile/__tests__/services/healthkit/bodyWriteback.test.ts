import {
  saveQuantitySample,
  deleteObjects,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';
import {
  bodyQuantityFor,
  writeBodyMetricForDate,
} from '../../../src/services/healthkit/bodyWriteback';
import { isOwnWrittenBodySample } from '../../../src/services/healthkit/dataTransformation';
import type { CheckInMeasurementRange } from '../../../src/types/measurements';

jest.mock('@kingstinct/react-native-healthkit', () => ({
  saveQuantitySample: jest.fn(),
  deleteObjects: jest.fn().mockResolvedValue(1),
  queryQuantitySamples: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockSave = saveQuantitySample as jest.Mock;
const mockDelete = deleteObjects as jest.Mock;
const mockQuery = queryQuantitySamples as jest.Mock;

let store: Record<string, unknown> = {};
let uuid = 0;
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  uuid = 0;
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
  mockSave.mockImplementation(() => Promise.resolve({ uuid: `u${++uuid}` }));
  mockQuery.mockResolvedValue([]);
  mockDelete.mockResolvedValue(1);
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

describe('bodyQuantityFor', () => {
  it('gives HealthKit kg, cm and body fat as a fraction', () => {
    expect(bodyQuantityFor('weight', 80)).toEqual({ unit: 'kg', quantity: 80 });
    expect(bodyQuantityFor('height', 180)).toEqual({
      unit: 'cm',
      quantity: 180,
    });
    expect(bodyQuantityFor('waistCircumference', 85)).toEqual({
      unit: 'cm',
      quantity: 85,
    });
    expect(bodyQuantityFor('bodyFat', 22.5)).toEqual({
      unit: '%',
      quantity: 0.225,
    });
  });
});

describe('writeBodyMetricForDate', () => {
  it('saves body fat at noon with the write-back metadata key', async () => {
    await writeBodyMetricForDate(
      'bodyFat',
      DATE,
      row({ body_fat_percentage: 22.5 }),
      7,
      AFTER
    );
    expect(mockSave).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBodyFatPercentage',
      '%',
      0.225,
      NOON,
      NOON,
      { SparkyBodyWriteback: `bodyFat-${DATE}-7` }
    );
    expect(store[`writebackBodyBodyFatUuids:${DATE}`]).toEqual(['u1']);
  });

  it('skips an unchanged day and replaces a changed one', async () => {
    await writeBodyMetricForDate('weight', DATE, row({ weight: 80 }), 1, AFTER);
    await writeBodyMetricForDate('weight', DATE, row({ weight: 80 }), 2, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);

    await writeBodyMetricForDate('weight', DATE, row({ weight: 79 }), 3, AFTER);
    expect(mockDelete).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierBodyMass',
      {
        uuids: ['u1'],
      }
    );
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(store[`writebackBodyWeightUuids:${DATE}`]).toEqual(['u2']);
  });

  it('skips a day another app already has with the same value', async () => {
    mockQuery.mockResolvedValue([{ quantity: 0.226, metadata: {} }]);
    await writeBodyMetricForDate(
      'bodyFat',
      DATE,
      row({ body_fat_percentage: 22.5 }),
      1,
      AFTER
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('ignores its own earlier samples when checking other apps', async () => {
    mockQuery.mockResolvedValue([
      { quantity: 80, metadata: { SparkyBodyWriteback: 'weight-x' } },
    ]);
    await writeBodyMetricForDate('weight', DATE, row({ weight: 80 }), 1, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the old UUIDs and retries when the delete fails', async () => {
    await writeBodyMetricForDate('weight', DATE, row({ weight: 80 }), 1, AFTER);
    mockDelete.mockRejectedValueOnce(new Error('denied'));
    await writeBodyMetricForDate('weight', DATE, row({ weight: 79 }), 2, AFTER);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(store[`writebackBodyWeightUuids:${DATE}`]).toEqual(['u1']);
  });
});

it('recognises samples body write-back saved', () => {
  expect(
    isOwnWrittenBodySample({ metadata: { SparkyBodyWriteback: 'weight-x' } })
  ).toBe(true);
  expect(isOwnWrittenBodySample({ metadata: {} })).toBe(false);
  expect(isOwnWrittenBodySample({})).toBe(false);
});
