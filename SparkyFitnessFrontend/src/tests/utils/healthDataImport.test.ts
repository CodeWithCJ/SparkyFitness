import {
  mapRowsToHealthItems,
  parseHealthCSV,
  HealthImportRow,
} from '@/utils/healthDataImport';

const row = (fields: Record<string, string>): HealthImportRow => ({
  id: 't1',
  ...fields,
});

describe('mapRowsToHealthItems', () => {
  describe('measurements (wide -> tall fan-out)', () => {
    it('emits one item per populated column and omits blanks', () => {
      const { items, errors } = mapRowsToHealthItems('measurements', [
        row({
          date: '2026-01-02',
          weight: '73.5',
          weight_unit: 'kg',
          body_fat: '18',
          height: '178',
          neck: '',
          waist: '82',
          hips: '',
          length_unit: 'cm',
        }),
      ]);

      expect(errors).toEqual([]);
      const types = items.map((i) => i.type).sort();
      expect(types).toEqual(['body_fat', 'height', 'waist', 'weight']);
      // No blank column produced a 0-valued item.
      expect(items.find((i) => i.type === 'neck')).toBeUndefined();
      expect(items.find((i) => i.type === 'hips')).toBeUndefined();
    });

    it('converts lb -> kg and in -> cm', () => {
      const { items } = mapRowsToHealthItems('measurements', [
        row({
          date: '2026-01-02',
          weight: '160',
          weight_unit: 'lb',
          body_fat: '',
          height: '70',
          neck: '',
          waist: '',
          hips: '',
          length_unit: 'in',
        }),
      ]);
      const weight = items.find((i) => i.type === 'weight');
      const height = items.find((i) => i.type === 'height');
      expect(weight?.value).toBeCloseTo(72.575, 2);
      expect(weight?.unit).toBe('kg');
      expect(height?.value).toBeCloseTo(177.8, 1);
      expect(height?.unit).toBe('cm');
    });

    it('flags an unrecognized weight unit as an error and drops the row', () => {
      const { items, errors } = mapRowsToHealthItems('measurements', [
        row({
          date: '2026-01-02',
          weight: '73',
          weight_unit: 'stone',
          body_fat: '',
          height: '',
          neck: '',
          waist: '',
          hips: '',
          length_unit: '',
        }),
      ]);
      expect(items).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.error).toContain('weight unit');
    });
  });

  it('maps hydration L -> ml as an integer water item', () => {
    const { items } = mapRowsToHealthItems('hydration', [
      row({ date: '2026-01-02', value: '2.5', unit: 'L', source: '' }),
    ]);
    expect(items).toEqual([
      { date: '2026-01-02', type: 'water', value: 2500, unit: 'ml' },
    ]);
  });

  it('flags an unrecognized hydration unit as an error', () => {
    const { items, errors } = mapRowsToHealthItems('hydration', [
      row({ date: '2026-01-02', value: '2', unit: 'gallons', source: '' }),
    ]);
    expect(items).toEqual([]);
    expect(errors[0]!.error).toContain('volume unit');
  });

  it('passes vitals through with source and notes preserved', () => {
    const { items } = mapRowsToHealthItems('vitals', [
      row({
        date: '2026-01-02',
        type: 'resting_heart_rate',
        value: '54',
        unit: 'bpm',
        source: 'Garmin',
        notes: 'am',
      }),
    ]);
    expect(items[0]).toEqual({
      date: '2026-01-02',
      type: 'resting_heart_rate',
      value: 54,
      unit: 'bpm',
      source: 'Garmin',
      notes: 'am',
    });
  });

  it('imports a custom category name as a vitals-style item', () => {
    const { items } = mapRowsToHealthItems('vitals', [
      row({
        date: '2026-01-02',
        type: 'My Custom Metric',
        value: '12',
        unit: 'units',
        source: 'CSV_Import',
        notes: '',
      }),
    ]);
    expect(items[0]).toMatchObject({
      type: 'My Custom Metric',
      value: 12,
      unit: 'units',
    });
  });

  it('drops vitals rows with a missing value', () => {
    const { items } = mapRowsToHealthItems('vitals', [
      row({
        date: '2026-01-02',
        type: 'heart_rate',
        value: '',
        unit: 'bpm',
        source: '',
        notes: '',
      }),
    ]);
    expect(items).toEqual([]);
  });

  it('normalizes activity distance km -> m and keeps steps as-is', () => {
    const { items } = mapRowsToHealthItems('activity', [
      row({
        date: '2026-01-02',
        type: 'distance',
        value: '5',
        unit: 'km',
        source: '',
      }),
      row({
        date: '2026-01-02',
        type: 'steps',
        value: '9450',
        unit: 'steps',
        source: '',
      }),
    ]);
    expect(items[0]).toMatchObject({
      type: 'distance',
      value: 5000,
      unit: 'm',
    });
    expect(items[1]).toMatchObject({ type: 'steps', value: 9450 });
  });

  it('builds a single SleepSession item with numeric durations', () => {
    const { items } = mapRowsToHealthItems('sleep', [
      row({
        date: '2026-01-02',
        bedtime: '2026-01-02T23:00:00',
        wake_time: '2026-01-03T07:00:00',
        duration_in_seconds: '28800',
        time_asleep_in_seconds: '',
        deep_sleep_seconds: '5400',
        light_sleep_seconds: '',
        rem_sleep_seconds: '',
        awake_sleep_seconds: '',
        sleep_score: '82',
        source: '',
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'SleepSession',
      bedtime: '2026-01-02T23:00:00',
      wake_time: '2026-01-03T07:00:00',
      duration_in_seconds: 28800,
      deep_sleep_seconds: 5400,
      sleep_score: 82,
    });
    // Blank numeric fields are omitted rather than sent as 0.
    expect(items[0]!['time_asleep_in_seconds']).toBeUndefined();
  });

  it('parses an optional stage_events JSON array into the sleep item', () => {
    const stages =
      '[{"stage_type":"deep","start_time":"2026-01-02T23:20:00Z","end_time":"2026-01-02T23:50:00Z"}]';
    const { items, errors } = mapRowsToHealthItems('sleep', [
      row({
        date: '2026-01-02',
        bedtime: '2026-01-02T23:00:00',
        wake_time: '2026-01-03T07:00:00',
        duration_in_seconds: '28800',
        sleep_score: '80',
        stage_events: stages,
        source: '',
      }),
    ]);
    expect(errors).toEqual([]);
    expect(items[0]!['stage_events']).toEqual([
      {
        stage_type: 'deep',
        start_time: '2026-01-02T23:20:00Z',
        end_time: '2026-01-02T23:50:00Z',
      },
    ]);
  });

  it('flags invalid stage_events JSON as an error', () => {
    const { items, errors } = mapRowsToHealthItems('sleep', [
      row({
        date: '2026-01-02',
        bedtime: '2026-01-02T23:00:00',
        wake_time: '2026-01-03T07:00:00',
        stage_events: 'not json',
        source: '',
      }),
    ]);
    expect(items).toEqual([]);
    expect(errors[0]!.error).toContain('stage_events');
  });
});

describe('parseHealthCSV', () => {
  it('parses rows keyed by header with a generated id', () => {
    const csv = 'date,value,unit,source\n2026-01-02,2.5,L,CSV_Import';
    const rows = parseHealthCSV(csv, 'hydration');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-01-02',
      value: '2.5',
      unit: 'L',
      source: 'CSV_Import',
    });
    expect(rows[0]!.id).toMatch(/^temp_/);
  });

  it('applies a header mapping when file columns differ from the template', () => {
    const csv = 'day,amount,units\n2026-01-02,2.5,L';
    const rows = parseHealthCSV(csv, 'hydration', {
      date: 'day',
      value: 'amount',
      unit: 'units',
    });
    expect(rows[0]).toMatchObject({
      date: '2026-01-02',
      value: '2.5',
      unit: 'L',
    });
  });
});
