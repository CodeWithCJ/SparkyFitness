import { describe, it, expect } from 'vitest';
import { buildCronExpression } from '../services/backupScheduler.js';

describe('buildCronExpression', () => {
  it('builds expression for a single day', () => {
    expect(buildCronExpression('14:30', ['Wednesday'])).toBe('30 14 * * 3');
  });

  it('maps all days of week correctly', () => {
    expect(buildCronExpression('00:00', ['Sunday'])).toBe('0 0 * * 0');
    expect(buildCronExpression('00:00', ['Monday'])).toBe('0 0 * * 1');
    expect(buildCronExpression('00:00', ['Tuesday'])).toBe('0 0 * * 2');
    expect(buildCronExpression('00:00', ['Wednesday'])).toBe('0 0 * * 3');
    expect(buildCronExpression('00:00', ['Thursday'])).toBe('0 0 * * 4');
    expect(buildCronExpression('00:00', ['Friday'])).toBe('0 0 * * 5');
    expect(buildCronExpression('00:00', ['Saturday'])).toBe('0 0 * * 6');
  });

  it('uses * for DOW when backupDays is empty', () => {
    expect(buildCronExpression('02:00', [])).toBe('0 2 * * *');
  });

  it('joins multiple days with comma', () => {
    expect(
      buildCronExpression('08:00', ['Monday', 'Wednesday', 'Friday'])
    ).toBe('0 8 * * 1,3,5');
  });

  it('handles midnight correctly (00:00)', () => {
    expect(buildCronExpression('00:00', ['Monday'])).toBe('0 0 * * 1');
  });

  it('handles times with zero minutes', () => {
    expect(buildCronExpression('01:00', ['Tuesday'])).toBe('0 1 * * 2');
  });

  it('handles end-of-day time (23:59)', () => {
    expect(buildCronExpression('23:59', ['Saturday'])).toBe('59 23 * * 6');
  });

  it('filters out unknown day names', () => {
    expect(buildCronExpression('10:00', ['Monday', 'Funday' as string])).toBe(
      '0 10 * * 1'
    );
  });

  it('uses * for DOW when all day names are unknown', () => {
    expect(buildCronExpression('10:00', ['Funday' as string])).toBe(
      '0 10 * * *'
    );
  });
});
