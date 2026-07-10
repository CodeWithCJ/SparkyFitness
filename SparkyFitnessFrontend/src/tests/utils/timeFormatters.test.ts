import type { TFunction } from 'i18next';
import { formatLocalizedMinutes } from '@/utils/timeFormatters';

const t = ((key: string, options?: Record<string, number | string>) => {
  if (key === 'units.minuteValue') return `${options?.['value']} د`;
  if (key === 'units.hourMinuteValue') {
    return `${options?.['hours']} س ${options?.['minutes']} د`;
  }
  return key;
}) as unknown as TFunction;

describe('formatLocalizedMinutes', () => {
  it('formats durations under an hour with the localized minute unit', () => {
    expect(formatLocalizedMinutes(45, t)).toBe('45 د');
  });

  it('formats hours and minutes with localized short units', () => {
    expect(formatLocalizedMinutes(90, t)).toBe('1 س 30 د');
  });
});
