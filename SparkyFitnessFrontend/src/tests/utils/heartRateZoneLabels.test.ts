import type { TFunction } from 'i18next';
import {
  maxHrSourceLabel,
  storedZoneMethodOf,
  zoneChartMethodLabel,
  zoneMethodName,
} from '@/utils/heartRateZoneLabels';

const t = ((
  _key: string,
  options?: string | ({ defaultValue?: string } & Record<string, unknown>)
) =>
  typeof options === 'string'
    ? options
    : (options?.defaultValue ?? '').replace(/{{(\w+)}}/g, (_m, name) =>
        String(options?.[name])
      )) as unknown as TFunction;

describe('heart rate zone labels', () => {
  it('names the methods and sources', () => {
    expect(zoneMethodName(t, 'percent_max')).toBe('% of max heart rate');
    expect(zoneMethodName(t, 'custom')).toBe('Custom zones');
    expect(maxHrSourceLabel(t, 'user')).toBe('You set it');
    expect(maxHrSourceLabel(t, 'age')).toBe('From your date of birth');
  });

  it('labels a stored method for a chart, and nothing when unknown', () => {
    expect(zoneChartMethodLabel(t, 'percent_max')).toContain(
      '% of max heart rate'
    );
    expect(zoneChartMethodLabel(t, 'device')).toBe(
      'Zones set by your watch or device.'
    );
    expect(zoneChartMethodLabel(t, null)).toBeNull();
    expect(zoneChartMethodLabel(t, undefined)).toBeNull();
  });

  it('finds the one method shared by a workout’s zone rows', () => {
    expect(
      storedZoneMethodOf([{ zone_method: 'custom' }, { zone_method: 'custom' }])
    ).toBe('custom');
    expect(
      storedZoneMethodOf([
        { zone_method: 'custom' },
        { zone_method: 'percent_max' },
      ])
    ).toBe('mixed');
    expect(storedZoneMethodOf([{ zone_method: null }, {}])).toBeNull();
    expect(storedZoneMethodOf([])).toBeNull();
  });
});
