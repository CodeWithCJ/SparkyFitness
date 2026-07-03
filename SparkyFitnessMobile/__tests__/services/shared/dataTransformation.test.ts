import {
  createTransformHealthRecords,
  createHydrationTransformer,
  createBloodPressureTransformer,
  extractDirectValue,
  type TransformHealthRecordsConfig,
  type ValueTransformer,
} from '../../../src/services/shared/dataTransformation';
import { addLog } from '../../../src/services/LogService';

import type { MetricConfig, TransformOutput } from '../../../src/types/healthRecords';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAddLog = addLog as jest.Mock;

const METRIC: MetricConfig = { recordType: 'Widget', unit: 'count', type: 'widget' };

const baseConfig = (overrides: Partial<TransformHealthRecordsConfig> = {}): TransformHealthRecordsConfig => ({
  source: 'Test Source',
  logTag: '[TestService]',
  valueTransformers: {},
  directTransformers: {},
  extractTimezoneMetadata: () => ({}),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createTransformHealthRecords', () => {
  describe('skipTypes', () => {
    const records = [{ value: 5, date: '2024-01-15' }];

    test('drops configured skip types wholesale and logs', () => {
      const transform = createTransformHealthRecords(baseConfig({ skipTypes: new Set(['Widget']) }));
      expect(transform(records, METRIC)).toEqual([]);
      expect(mockAddLog).toHaveBeenCalledWith('[TestService] Skipping qualitative Widget records');
    });

    test('is honored only when provided — same records transform without skipTypes', () => {
      const transform = createTransformHealthRecords(baseConfig());
      expect(transform(records, METRIC)).toHaveLength(1);
    });

    test('non-listed record types are unaffected by skipTypes', () => {
      const transform = createTransformHealthRecords(baseConfig({ skipTypes: new Set(['Other']) }));
      expect(transform(records, METRIC)).toHaveLength(1);
    });
  });

  describe('source stamping', () => {
    test('stamps config source on pre-aggregated records', () => {
      const transform = createTransformHealthRecords(baseConfig({ source: 'Health Connect' }));
      const result = transform([{ value: 5, date: '2024-01-15' }], METRIC);
      expect(result[0]).toMatchObject({ value: 5, date: '2024-01-15', source: 'Health Connect' });
    });

    test('stamps config source on value-transformed records', () => {
      const transform = createTransformHealthRecords(baseConfig({
        source: 'HealthKit',
        valueTransformers: { Widget: () => ({ value: 7, date: '2024-01-15' }) },
      }));
      const result = transform([{ raw: true }], METRIC);
      expect(result[0]).toMatchObject({ value: 7, source: 'HealthKit' });
    });
  });

  describe('injected timezone extractor', () => {
    test('spreads the platform extractor result onto value-transformed records', () => {
      const transform = createTransformHealthRecords(baseConfig({
        valueTransformers: { Widget: () => ({ value: 7, date: '2024-01-15' }) },
        extractTimezoneMetadata: (rec) => ({ record_timezone: rec.tz as string }),
      }));
      const result = transform([{ tz: 'America/New_York' }], METRIC);
      expect(result[0]).toMatchObject({ record_timezone: 'America/New_York' });
    });

    test('pre-aggregated records forward their own tz fields, not the extractor', () => {
      const extractTimezoneMetadata = jest.fn(() => ({ record_timezone: 'Wrong/Zone' }));
      const transform = createTransformHealthRecords(baseConfig({ extractTimezoneMetadata }));
      const result = transform(
        [{ value: 5, date: '2024-01-15', record_utc_offset_minutes: -300 }],
        METRIC,
      );
      expect(result[0]).toMatchObject({ record_utc_offset_minutes: -300 });
      expect(result[0]).not.toHaveProperty('record_timezone');
      expect(extractTimezoneMetadata).not.toHaveBeenCalled();
    });
  });

  describe('index forwarding', () => {
    test('value transformers receive the record index as third argument', () => {
      const valueTransformer: jest.MockedFunction<ValueTransformer> =
        jest.fn(() => ({ value: 1, date: '2024-01-15' }));
      const transform = createTransformHealthRecords(baseConfig({
        valueTransformers: { Widget: valueTransformer },
      }));
      transform([{ a: 1 }, { a: 2 }, { a: 3 }], METRIC);
      expect(valueTransformer).toHaveBeenNthCalledWith(1, { a: 1 }, METRIC, 0);
      expect(valueTransformer).toHaveBeenNthCalledWith(2, { a: 2 }, METRIC, 1);
      expect(valueTransformer).toHaveBeenNthCalledWith(3, { a: 3 }, METRIC, 2);
    });
  });

  describe('direct-transformer counting', () => {
    test('counts pushed records as successes in the summary log', () => {
      const transform = createTransformHealthRecords(baseConfig({
        directTransformers: {
          Widget: (_rec, _record, _metricConfig, output: TransformOutput[]) => {
            output.push(
              { value: 1, type: 'widget_systolic', date: '2024-01-15', unit: 'count', source: 'Test Source' },
              { value: 2, type: 'widget_diastolic', date: '2024-01-15', unit: 'count', source: 'Test Source' },
            );
          },
        },
      }));
      // The raw record fans out to 2 outputs via the direct transformer; the NaN
      // pre-aggregated record trips the skip counter so the summary is emitted.
      const result = transform([{ raw: true }, { value: NaN, date: '2024-01-15' }], METRIC);
      expect(result).toHaveLength(2);
      expect(mockAddLog).toHaveBeenCalledWith(
        '[TestService] Widget transformation: 2 succeeded, 1 skipped (of 2 total)',
        'DEBUG',
      );
    });
  });

  describe('driver guards', () => {
    test('warns and returns [] for non-array input', () => {
      const transform = createTransformHealthRecords(baseConfig());
      expect(transform(null as unknown as unknown[], METRIC)).toEqual([]);
      expect(mockAddLog).toHaveBeenCalledWith(
        '[TestService] transformHealthRecords received non-array records for Widget',
        'WARNING',
      );
    });

    test('warns once for unhandled record types and skips them', () => {
      const transform = createTransformHealthRecords(baseConfig());
      const result = transform([{ raw: 1 }, { raw: 2 }], METRIC);
      expect(result).toEqual([]);
      const unhandledWarnings = mockAddLog.mock.calls.filter(
        ([message]) => message === '[TestService] No transformer found for record type: Widget',
      );
      expect(unhandledWarnings).toHaveLength(1);
    });

    test('continues past a throwing record and logs type and index', () => {
      const bad = { value: { toString: () => { throw new Error('boom'); } }, date: '2024-01-15' };
      const good = { value: 5, date: '2024-01-16' };
      const transform = createTransformHealthRecords(baseConfig());
      const result = transform([bad, good], METRIC);
      expect(result).toHaveLength(1);
      expect(mockAddLog).toHaveBeenCalledWith(
        '[TestService] Error transforming Widget record at index 0: boom',
        'WARNING',
      );
    });
  });
});

describe('createHydrationTransformer', () => {
  const getDateString = () => '2024-01-15';

  test('converts liters to whole ml', () => {
    const transformer = createHydrationTransformer(() => false, getDateString);
    expect(transformer({ volume: { inLiters: 0.7501 }, startTime: 'x' }, METRIC, 0))
      .toEqual({ value: 750, date: '2024-01-15' });
  });

  test('skips records matched by the injected ownership predicate', () => {
    const transformer = createHydrationTransformer((rec) => rec.mine === true, getDateString);
    expect(transformer({ mine: true, volume: { inLiters: 1 }, startTime: 'x' }, METRIC, 0)).toBeNull();
    expect(transformer({ mine: false, volume: { inLiters: 1 }, startTime: 'x' }, METRIC, 0))
      .toEqual({ value: 1000, date: '2024-01-15' });
  });
});

describe('createBloodPressureTransformer', () => {
  test('emits systolic/diastolic records stamped with the injected source', () => {
    const transformer = createBloodPressureTransformer('HealthKit', () => '2024-01-15');
    const output: TransformOutput[] = [];
    const rec = {
      time: 'x',
      systolic: { inMillimetersOfMercury: 120.129 },
      diastolic: { inMillimetersOfMercury: 80 },
    };
    transformer(rec, rec, { recordType: 'BloodPressure', unit: 'mmHg', type: 'blood_pressure' }, output);
    expect(output).toEqual([
      { value: 120.13, unit: 'mmHg', date: '2024-01-15', type: 'blood_pressure_systolic', source: 'HealthKit' },
      { value: 80, unit: 'mmHg', date: '2024-01-15', type: 'blood_pressure_diastolic', source: 'HealthKit' },
    ]);
  });
});

describe('extractDirectValue', () => {
  test('parses comma-decimal strings (European locales)', () => {
    expect(extractDirectValue({ rate: '49,51' }, 'rate')).toBe(49.51);
    expect(extractDirectValue({ rate: 12 }, 'rate')).toBe(12);
    expect(extractDirectValue({ rate: 'abc' }, 'rate')).toBeNull();
  });
});
