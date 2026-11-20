import {
  bodyRecordTime,
  bodyValueForDay,
  bodyWriteSignature,
  checkInRowsByDate,
  keysNamingTrackedRecords,
  matchesOtherAppValue,
} from '../../../src/services/shared/bodyWriteback';
import type { CheckInMeasurementRange } from '../../../src/types/measurements';

const row = (
  fields: Partial<CheckInMeasurementRange>
): CheckInMeasurementRange => ({
  id: 'r1',
  user_id: 'u1',
  entry_date: '2026-06-01',
  updated_at: '2026-06-01T08:00:00Z',
  ...fields,
});

describe('bodyValueForDay', () => {
  it('reads each metric from its check-in field in the stored unit', () => {
    const day = row({
      weight: 80.4,
      body_fat_percentage: 22.5,
      height: 180,
      waist: 85,
      bone_mass_kg: 3.1,
    });
    expect(bodyValueForDay('weight', day)).toBe(80.4);
    expect(bodyValueForDay('bodyFat', day)).toBe(22.5);
    expect(bodyValueForDay('height', day)).toBe(180);
    expect(bodyValueForDay('waistCircumference', day)).toBe(85);
    expect(bodyValueForDay('boneMass', day)).toBe(3.1);
  });

  it('turns body water into a mass using the same day weight', () => {
    expect(
      bodyValueForDay(
        'bodyWaterMass',
        row({ weight: 80, body_water_percentage: 55 })
      )
    ).toBeCloseTo(44);
  });

  it('has no body water without a weight that day', () => {
    expect(
      bodyValueForDay('bodyWaterMass', row({ body_water_percentage: 55 }))
    ).toBeNull();
  });

  it('ignores missing, zero, negative and out-of-range values', () => {
    expect(bodyValueForDay('weight', undefined)).toBeNull();
    expect(bodyValueForDay('weight', row({ weight: null }))).toBeNull();
    expect(bodyValueForDay('weight', row({ weight: 0 }))).toBeNull();
    expect(bodyValueForDay('height', row({ height: -1 }))).toBeNull();
    expect(
      bodyValueForDay('bodyFat', row({ body_fat_percentage: 120 }))
    ).toBeNull();
  });
});

describe('bodyRecordTime', () => {
  it('is local noon on a past day', () => {
    const time = bodyRecordTime('2026-06-01', new Date(2026, 5, 3, 9));
    expect(time).toEqual(new Date(2026, 5, 1, 12, 0, 0, 0));
  });

  it('waits until noon has passed today', () => {
    expect(bodyRecordTime('2026-06-01', new Date(2026, 5, 1, 11, 59))).toBe(
      null
    );
    expect(bodyRecordTime('2026-06-01', new Date(2026, 5, 1, 12, 1))).toEqual(
      new Date(2026, 5, 1, 12)
    );
  });
});

describe('matchesOtherAppValue', () => {
  it('matches within the tolerance for the metric', () => {
    expect(matchesOtherAppValue('weight', 80, [80.05])).toBe(true);
    expect(matchesOtherAppValue('weight', 80, [80.1])).toBe(false);
    expect(matchesOtherAppValue('bodyFat', 22.5, [22.4])).toBe(true);
    expect(matchesOtherAppValue('height', 180, [180.4])).toBe(true);
    expect(matchesOtherAppValue('height', 180, [181])).toBe(false);
  });

  it('does not match with no other values', () => {
    expect(matchesOtherAppValue('weight', 80, [])).toBe(false);
  });
});

describe('bodyWriteSignature', () => {
  it('changes with the value and is fixed for an empty day', () => {
    const noon = new Date(2026, 5, 1, 12);
    expect(bodyWriteSignature(80, noon)).not.toBe(
      bodyWriteSignature(80.1, noon)
    );
    expect(bodyWriteSignature(null, null)).toBe('none');
  });
});

describe('checkInRowsByDate', () => {
  it('keys rows by day and keeps the first (newest) one', () => {
    const map = checkInRowsByDate([
      row({ entry_date: '2026-06-02', weight: 79 }),
      row({ entry_date: '2026-06-01', weight: 80 }),
      row({ entry_date: '2026-06-01', weight: 81 }),
    ]);
    expect(map.get('2026-06-01')?.weight).toBe(80);
    expect(map.get('2026-06-02')?.weight).toBe(79);
  });
});

describe('keysNamingTrackedRecords', () => {
  const values: Record<string, string | null> = {
    full: JSON.stringify(['a']),
    empty: JSON.stringify([]),
    missing: null,
    garbled: '{not json',
  };
  const read = (key: string) => Promise.resolve(values[key] ?? null);

  it('keeps only lists that still name records', async () => {
    await expect(
      keysNamingTrackedRecords(['full', 'empty', 'missing', 'garbled'], read)
    ).resolves.toEqual(['full']);
  });

  it('keeps a key it could not read, since what it names is unknown', async () => {
    await expect(
      keysNamingTrackedRecords(['empty', 'broken'], (key) =>
        key === 'broken' ? Promise.reject(new Error('io')) : read(key)
      )
    ).resolves.toEqual(['broken']);
  });
});
