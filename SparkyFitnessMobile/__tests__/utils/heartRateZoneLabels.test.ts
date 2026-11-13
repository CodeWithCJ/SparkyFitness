import type { TFunction } from 'i18next';
import {
  maxHrSourceLabel,
  methodName,
  zoneMethodLabel,
} from '../../src/utils/heartRateZoneLabels';

// Resolves the English default, filling {{placeholders}}.
const t = ((
  _key: string,
  options: { defaultValue: string } & Record<string, unknown>
) =>
  options.defaultValue.replace(/{{(\w+)}}/g, (_m, name) =>
    String(options[name])
  )) as unknown as TFunction;

describe('heart rate zone labels', () => {
  it('names each method', () => {
    expect(methodName(t, 'percent_max')).toBe('% of max heart rate');
    expect(methodName(t, 'heart_rate_reserve')).toBe('Heart rate reserve');
    expect(methodName(t, 'custom')).toBe('Custom zones');
  });

  it('tells a chart which method stored zones were worked out with', () => {
    expect(zoneMethodLabel(t, 'heart_rate_reserve')).toBe(
      'Zones: Heart rate reserve. Changing your zone settings does not change past workouts.'
    );
    expect(zoneMethodLabel(t, 'device')).toBe(
      'Zones set by your watch or device'
    );
    expect(zoneMethodLabel(t, 'mixed')).toContain('more than one method');
  });

  it('says nothing for a workout stored before methods were recorded', () => {
    expect(zoneMethodLabel(t, null)).toBeNull();
  });

  it('says where the max heart rate came from', () => {
    expect(maxHrSourceLabel(t, 'user')).toBe('You set it');
    expect(maxHrSourceLabel(t, 'age')).toBe('From your date of birth');
  });
});
