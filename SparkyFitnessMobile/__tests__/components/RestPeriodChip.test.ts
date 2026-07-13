import { formatRest, formatRestLabel } from '../../src/components/RestPeriodChip';
import { clampRestSeconds, MIN_REST_SEC, MAX_REST_SEC } from '../../src/components/RestPeriodSheet';
import { DEFAULT_REST_SEC } from '../../src/utils/workoutSession';

describe('formatRest', () => {
  it('formats values under a minute as Ns', () => {
    expect(formatRest(15)).toBe('15s');
    expect(formatRest(45)).toBe('45s');
    expect(formatRest(59)).toBe('59s');
  });

  it('formats one minute as 1:00', () => {
    expect(formatRest(60)).toBe('1:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatRest(90)).toBe('1:30');
  });

  it('zero-pads the seconds portion', () => {
    expect(formatRest(65)).toBe('1:05');
    expect(formatRest(120)).toBe('2:00');
    expect(formatRest(305)).toBe('5:05');
  });

  it('falls back to 1:30 for null', () => {
    expect(formatRest(null)).toBe('1:30');
  });

  it('falls back to 1:30 for undefined', () => {
    expect(formatRest(undefined)).toBe('1:30');
  });
});

describe('formatRestLabel', () => {
  it('labels 0 as Off', () => {
    expect(formatRestLabel(0)).toBe('Off');
  });

  it('passes non-zero durations through to formatRest', () => {
    expect(formatRestLabel(5)).toBe('5s');
    expect(formatRestLabel(45)).toBe('45s');
    expect(formatRestLabel(90)).toBe('1:30');
  });

  it('falls back to the default rest for null', () => {
    expect(formatRestLabel(null)).toBe('1:30');
  });
});

describe('clampRestSeconds', () => {
  it('allows no rest (0) and clamps negatives up to MIN_REST_SEC', () => {
    expect(clampRestSeconds(0)).toBe(0);
    expect(clampRestSeconds(-10)).toBe(MIN_REST_SEC);
  });

  it('allows short rests down to 5 seconds', () => {
    expect(clampRestSeconds(5)).toBe(5);
  });

  it('clamps values above the maximum down to MAX_REST_SEC', () => {
    expect(clampRestSeconds(1200)).toBe(MAX_REST_SEC);
    expect(clampRestSeconds(9999)).toBe(MAX_REST_SEC);
  });

  it('rounds to the nearest 5 seconds', () => {
    expect(clampRestSeconds(47)).toBe(45);
    expect(clampRestSeconds(48)).toBe(50);
    expect(clampRestSeconds(92)).toBe(90);
  });

  it('leaves multiples of 5 unchanged within bounds', () => {
    expect(clampRestSeconds(30)).toBe(30);
    expect(clampRestSeconds(90)).toBe(90);
    expect(clampRestSeconds(300)).toBe(300);
  });

  it('handles NaN by returning the default rest', () => {
    expect(clampRestSeconds(NaN)).toBe(DEFAULT_REST_SEC);
  });
});
