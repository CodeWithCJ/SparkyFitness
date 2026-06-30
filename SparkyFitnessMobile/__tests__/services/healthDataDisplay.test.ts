import { fetchHealthDisplayData, NO_DATA_DISPLAY } from '../../src/services/healthDataDisplay';
import {
  readHealthRecords,
  getSyncStartDate,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
  getAggregatedBasalEnergyByDate,
} from '../../src/services/healthConnectService';
import { addLog } from '../../src/services/LogService';
import type { TimeRange } from '../../src/services/storage';

// A single, controllable metric list — the real HEALTH_METRICS is platform
// filtered and huge. We mutate this array per test so we can drive one record
// type through `fetchHealthDisplayData` and assert the formatter output.
const mockHealthMetrics: { id: string; label: string; recordType: string }[] = [];

jest.mock('../../src/HealthMetrics', () => ({
  get HEALTH_METRICS() {
    return mockHealthMetrics;
  },
}));

jest.mock('../../src/services/healthConnectService', () => ({
  getSyncStartDate: jest.fn(),
  readHealthRecords: jest.fn(),
  getAggregatedStepsByDate: jest.fn(),
  getAggregatedActiveCaloriesByDate: jest.fn(),
  getAggregatedTotalCaloriesByDate: jest.fn(),
  getAggregatedDistanceByDate: jest.fn(),
  getAggregatedFloorsClimbedByDate: jest.fn(),
  getAggregatedBasalEnergyByDate: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockReadHealthRecords = readHealthRecords as jest.MockedFunction<typeof readHealthRecords>;
const mockGetSyncStartDate = getSyncStartDate as jest.MockedFunction<typeof getSyncStartDate>;
const mockSteps = getAggregatedStepsByDate as jest.MockedFunction<typeof getAggregatedStepsByDate>;
const mockActiveCals = getAggregatedActiveCaloriesByDate as jest.MockedFunction<
  typeof getAggregatedActiveCaloriesByDate
>;
const mockTotalCals = getAggregatedTotalCaloriesByDate as jest.MockedFunction<
  typeof getAggregatedTotalCaloriesByDate
>;
const mockDistance = getAggregatedDistanceByDate as jest.MockedFunction<
  typeof getAggregatedDistanceByDate
>;
const mockFloors = getAggregatedFloorsClimbedByDate as jest.MockedFunction<
  typeof getAggregatedFloorsClimbedByDate
>;
const mockBasalEnergy = getAggregatedBasalEnergyByDate as jest.MockedFunction<
  typeof getAggregatedBasalEnergyByDate
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

function setMetric(recordType: string): void {
  mockHealthMetrics.length = 0;
  mockHealthMetrics.push({ id: 'metric', label: recordType, recordType });
}

const TIME_RANGE: TimeRange = '7d';

/** Drive one record type through the orchestrator and return its display string. */
async function displayFor(recordType: string): Promise<string> {
  setMetric(recordType);
  const result = await fetchHealthDisplayData(TIME_RANGE);
  return result.metric;
}

describe('fetchHealthDisplayData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSyncStartDate.mockReturnValue(new Date('2026-06-01T00:00:00Z'));
    mockReadHealthRecords.mockResolvedValue([]);
    mockSteps.mockResolvedValue([]);
    mockActiveCals.mockResolvedValue([]);
    mockTotalCals.mockResolvedValue([]);
    mockDistance.mockResolvedValue([]);
    mockFloors.mockResolvedValue([]);
    mockBasalEnergy.mockResolvedValue([]);
  });

  describe('aggregated formatters', () => {
    it('formats steps as a localized total', async () => {
      mockSteps.mockResolvedValue([{ value: 5000 }, { value: 432 }]);
      expect(await displayFor('Steps')).toBe((5432).toLocaleString());
      // Aggregated metrics never read raw records.
      expect(mockReadHealthRecords).not.toHaveBeenCalled();
    });

    it('formats active calories as a localized total', async () => {
      mockActiveCals.mockResolvedValue([{ value: 300 }, { value: 200 }]);
      expect(await displayFor('ActiveCaloriesBurned')).toBe((500).toLocaleString());
    });

    it('formats total calories as a localized total', async () => {
      mockTotalCals.mockResolvedValue([{ value: 1500 }, { value: 500 }]);
      expect(await displayFor('TotalCaloriesBurned')).toBe((2000).toLocaleString());
    });

    it('converts distance from metres to kilometres', async () => {
      mockDistance.mockResolvedValue([{ value: 3500 }, { value: 1500 }]);
      expect(await displayFor('Distance')).toBe('5.00 km');
    });

    it('rounds floors climbed before localizing', async () => {
      mockFloors.mockResolvedValue([{ value: 10.4 }, { value: 2.4 }]);
      expect(await displayFor('FloorsClimbed')).toBe((13).toLocaleString());
    });

    it('passes the resolved start/end window to the fetcher', async () => {
      mockSteps.mockResolvedValue([{ value: 1 }]);
      await displayFor('Steps');
      expect(mockSteps).toHaveBeenCalledWith(
        new Date('2026-06-01T00:00:00Z'),
        expect.any(Date),
      );
    });

    it('formats an empty aggregate as "0" rather than no-data', async () => {
      // Unlike raw formatters, aggregated metrics skip the no-records short-circuit,
      // so an empty result sums to 0 and is localized.
      mockSteps.mockResolvedValue([]);
      expect(await displayFor('Steps')).toBe((0).toLocaleString());
    });
  });

  describe('basal metabolic rate', () => {
    it('averages the aggregated resting-energy values when present', async () => {
      mockBasalEnergy.mockResolvedValue([{ value: 1500 }, { value: 1600 }]);
      expect(await displayFor('BasalMetabolicRate')).toBe('1550 kcal');
      expect(mockReadHealthRecords).not.toHaveBeenCalled();
    });

    it('falls back to raw records and averages bucketed BMR when no aggregate exists', async () => {
      mockBasalEnergy.mockResolvedValue([]);
      // Records are bucketed by their timestamp: the two sharing a timestamp are
      // summed/counted into one bucket (avg 1550), the third is its own (1700).
      mockReadHealthRecords.mockResolvedValue([
        { time: '2026-06-01T10:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 1500 } },
        { time: '2026-06-01T10:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 1600 } },
        { time: '2026-06-02T10:00:00Z', basalMetabolicRate: { inKilocaloriesPerDay: 1700 } },
      ] as unknown[]);
      // Bucket avgs = [1550, 1700], overall avg = 1625.
      expect(await displayFor('BasalMetabolicRate')).toBe('1625 kcal');
    });

    it('shows no-data when neither aggregate nor raw records exist', async () => {
      mockBasalEnergy.mockResolvedValue([]);
      mockReadHealthRecords.mockResolvedValue([]);
      expect(await displayFor('BasalMetabolicRate')).toBe(NO_DATA_DISPLAY);
    });

    // The raw fallback's value extractor absorbs several divergent payload shapes
    // (Health Connect quantity objects vs aggregated iOS records).
    it.each([
      { label: 'inKilocaloriesPerDay', record: { time: 't', basalMetabolicRate: { inKilocaloriesPerDay: 1500 } } },
      { label: 'inCalories', record: { time: 't', basalMetabolicRate: { inCalories: 1500 } } },
      { label: 'inKilocalories', record: { time: 't', basalMetabolicRate: { inKilocalories: 1500 } } },
      { label: 'energy.inCalories', record: { time: 't', energy: { inCalories: 1500 } } },
      { label: 'aggregated value', record: { date: 't', value: 1500 } },
    ])('extracts a raw BMR value from a $label payload', async ({ record }) => {
      mockBasalEnergy.mockResolvedValue([]);
      mockReadHealthRecords.mockResolvedValue([record] as unknown[]);
      expect(await displayFor('BasalMetabolicRate')).toBe('1500 kcal');
    });
  });

  describe('raw record formatters', () => {
    const cases: { recordType: string; records: unknown[]; expected: string }[] = [
      {
        recordType: 'HeartRate',
        records: [{ samples: [{ beatsPerMinute: 60 }, { beatsPerMinute: 80 }] }],
        expected: '70 bpm',
      },
      {
        recordType: 'Weight',
        records: [
          { time: '2026-06-01T00:00:00Z', weight: { inKilograms: 70.2 } },
          { time: '2026-06-02T00:00:00Z', weight: { inKilograms: 80.5 } },
        ],
        expected: '80.5 kg',
      },
      {
        recordType: 'BodyFat',
        records: [
          { time: '2026-06-01T00:00:00Z', percentage: { inPercent: 18 } },
          { time: '2026-06-02T00:00:00Z', percentage: { inPercent: 21.4 } },
        ],
        expected: '21.4%',
      },
      {
        recordType: 'BloodPressure',
        records: [
          {
            time: '2026-06-02T00:00:00Z',
            systolic: { inMillimetersOfMercury: 120 },
            diastolic: { inMillimetersOfMercury: 80 },
          },
        ],
        expected: '120/80 mmHg',
      },
      {
        recordType: 'SleepSession',
        records: [{ startTime: '2026-06-01T22:00:00Z', endTime: '2026-06-02T05:30:00Z' }],
        expected: '7h 30m',
      },
      {
        recordType: 'Hydration',
        records: [{ volume: { inLiters: 1.5 } }, { volume: { inLiters: 0.5 } }],
        expected: '2.00 L',
      },
      {
        recordType: 'Height',
        records: [{ time: '2026-06-01T00:00:00Z', height: { inMeters: 1.8 } }],
        expected: '180.0 cm',
      },
      {
        recordType: 'BodyTemperature',
        records: [{ time: '2026-06-01T00:00:00Z', temperature: { inCelsius: 36.6 } }],
        expected: '36.6°C',
      },
      {
        recordType: 'BloodGlucose',
        records: [{ time: '2026-06-01T00:00:00Z', level: { inMillimolesPerLiter: 5.4 } }],
        expected: '5.4 mmol/L',
      },
      {
        recordType: 'BloodGlucose',
        records: [{ time: '2026-06-01T00:00:00Z', level: { inMilligramsPerDeciliter: 90 } }],
        expected: '5.0 mmol/L',
      },
      {
        recordType: 'OxygenSaturation',
        records: [
          { time: '2026-06-01T00:00:00Z', percentage: { inPercent: 95 } },
          { time: '2026-06-02T00:00:00Z', percentage: { inPercent: 97 } },
        ],
        expected: '97.0%',
      },
      {
        recordType: 'RestingHeartRate',
        records: [{ beatsPerMinute: 58 }, { beatsPerMinute: 62 }],
        expected: '60 bpm',
      },
      {
        recordType: 'HeartRateVariabilitySDNN',
        records: [
          { time: '2026-06-01T08:00:00Z', value: 30 },
          { time: '2026-06-02T08:00:00Z', value: 48 },
        ],
        expected: '48 ms',
      },
      {
        recordType: 'HeartRateVariabilityRmssd',
        records: [
          { time: '2026-06-01T08:00:00Z', heartRateVariabilityMillis: 30 },
          { time: '2026-06-02T08:00:00Z', heartRateVariabilityMillis: 48 },
        ],
        expected: '48 ms',
      },
      {
        recordType: 'Vo2Max',
        records: [{ time: '2026-06-01T00:00:00Z', vo2Max: 42 }],
        expected: '42.0 ml/min/kg',
      },
      {
        recordType: 'LeanBodyMass',
        records: [{ time: '2026-06-01T00:00:00Z', mass: { inKilograms: 65 } }],
        expected: '65.0 kg',
      },
      {
        recordType: 'WheelchairPushes',
        records: [{ count: 1200 }, { count: 300 }],
        expected: (1500).toLocaleString(),
      },
      {
        recordType: 'ExerciseSession',
        records: [{ startTime: '2026-06-01T10:00:00Z', endTime: '2026-06-01T10:45:00Z' }],
        expected: '45 min',
      },
      {
        recordType: 'ElevationGained',
        records: [{ elevation: { inMeters: 10 } }, { elevation: { inMeters: 5 } }],
        expected: '15 m',
      },
      {
        recordType: 'Power',
        records: [{ power: { inWatts: 200 } }, { power: { inWatts: 100 } }],
        expected: '150 W',
      },
      {
        recordType: 'Speed',
        records: [{ speed: { inMetersPerSecond: 2 } }, { speed: { inMetersPerSecond: 3 } }],
        expected: '2.50 m/s',
      },
      {
        recordType: 'RespiratoryRate',
        records: [{ rate: 14 }, { rate: 16 }],
        expected: '15 br/min',
      },
      {
        recordType: 'Nutrition',
        records: [{ energy: { inCalories: 1500000 } }, { energy: { inCalories: 500000 } }],
        expected: '2000 kcal',
      },
      {
        recordType: 'Workout',
        records: [{}, {}, {}],
        expected: '3 workouts',
      },
    ];

    it.each(cases)('formats $recordType records', async ({ recordType, records, expected }) => {
      mockReadHealthRecords.mockResolvedValue(records);
      expect(await displayFor(recordType)).toBe(expected);
    });

    it('ignores oxygen-saturation readings outside the 0–100 range', async () => {
      // The latest reading (0%) is invalid, so the earlier valid 96% wins.
      mockReadHealthRecords.mockResolvedValue([
        { time: '2026-06-01T00:00:00Z', percentage: { inPercent: 96 } },
        { time: '2026-06-02T00:00:00Z', percentage: { inPercent: 0 } },
      ]);
      expect(await displayFor('OxygenSaturation')).toBe('96.0%');
    });

    // Body-fat readings arrive in several shapes across platforms.
    it.each([
      { label: 'bodyFatPercentage.inPercent', record: { time: 't', bodyFatPercentage: { inPercent: 22 } } },
      { label: 'percentage.value', record: { time: 't', percentage: { value: 22 } } },
      { label: 'numeric percentage', record: { time: 't', percentage: 22 } },
      { label: 'value', record: { time: 't', value: 22 } },
      { label: 'bodyFat', record: { time: 't', bodyFat: 22 } },
    ])('formats body fat from a $label payload', async ({ record }) => {
      mockReadHealthRecords.mockResolvedValue([record] as unknown[]);
      expect(await displayFor('BodyFat')).toBe('22.0%');
    });

    it.each([
      { label: 'numeric percentage', record: { time: 't', percentage: 98 } },
      { label: 'value', record: { time: 't', value: 98 } },
      { label: 'oxygenSaturation', record: { time: 't', oxygenSaturation: 98 } },
      { label: 'spo2', record: { time: 't', spo2: 98 } },
    ])('formats oxygen saturation from a $label payload', async ({ record }) => {
      mockReadHealthRecords.mockResolvedValue([record] as unknown[]);
      expect(await displayFor('OxygenSaturation')).toBe('98.0%');
    });

    it('reads blood glucose from the bloodGlucose.* field path', async () => {
      mockReadHealthRecords.mockResolvedValue([
        { time: 't', bloodGlucose: { inMillimolesPerLiter: 6.1 } },
      ]);
      expect(await displayFor('BloodGlucose')).toBe('6.1 mmol/L');
    });

    it('converts blood glucose from mg/dL on the bloodGlucose.* field path', async () => {
      mockReadHealthRecords.mockResolvedValue([
        { time: 't', bloodGlucose: { inMilligramsPerDeciliter: 108 } },
      ]);
      // 108 / 18.018 ≈ 5.99 → 6.0 mmol/L
      expect(await displayFor('BloodGlucose')).toBe('6.0 mmol/L');
    });

    it('drops Vo2Max readings at or above the 100 upper bound', async () => {
      mockReadHealthRecords.mockResolvedValue([{ time: 't', vo2Max: 100 }]);
      expect(await displayFor('Vo2Max')).toBe(NO_DATA_DISPLAY);
    });
  });

  describe('orchestration fallbacks', () => {
    it('returns no-data when a raw metric has no records', async () => {
      mockReadHealthRecords.mockResolvedValue([]);
      expect(await displayFor('Weight')).toBe(NO_DATA_DISPLAY);
    });

    it('uses a generic record count for record types with no dedicated formatter', async () => {
      mockReadHealthRecords.mockResolvedValue([{}, {}]);
      expect(await displayFor('Stress')).toBe('2 records');
    });

    it('uses the singular form for a single generic record', async () => {
      mockReadHealthRecords.mockResolvedValue([{}]);
      expect(await displayFor('Stress')).toBe('1 record');
    });

    it('returns "Error" and logs when a metric fetch throws', async () => {
      mockReadHealthRecords.mockRejectedValue(new Error('HealthKit unavailable'));
      expect(await displayFor('Weight')).toBe('Error');
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('HealthKit unavailable'),
        'ERROR',
      );
    });

    it('isolates failures so one bad metric does not sink the others', async () => {
      mockHealthMetrics.length = 0;
      mockHealthMetrics.push(
        { id: 'good', label: 'Weight', recordType: 'Weight' },
        { id: 'bad', label: 'Heart Rate', recordType: 'HeartRate' },
      );
      mockReadHealthRecords.mockImplementation(async (recordType: string) => {
        if (recordType === 'HeartRate') throw new Error('boom');
        return [{ time: '2026-06-01T00:00:00Z', weight: { inKilograms: 75 } }];
      });

      const result = await fetchHealthDisplayData(TIME_RANGE);
      expect(result.good).toBe('75.0 kg');
      expect(result.bad).toBe('Error');
    });
  });
});
