import { formatRest } from '../../src/components/RestPeriodChip';
import { clampRestSeconds, MIN_REST_SEC, MAX_REST_SEC } from '../../src/components/RestPeriodSheet';

describe('formatRest', () => {
  it('formats values under a minute with Arabic numerals and a seconds unit', () => {
    expect(formatRest(15)).toBe('١٥ ث');
    expect(formatRest(45)).toBe('٤٥ ث');
    expect(formatRest(59)).toBe('٥٩ ث');
  });

  it('formats one minute with Arabic numerals', () => {
    expect(formatRest(60)).toBe('١:٠٠');
  });

  it('formats 90 seconds with Arabic numerals', () => {
    expect(formatRest(90)).toBe('١:٣٠');
  });

  it('zero-pads the seconds portion', () => {
    expect(formatRest(65)).toBe('١:٠٥');
    expect(formatRest(120)).toBe('٢:٠٠');
    expect(formatRest(305)).toBe('٥:٠٥');
  });

  it('falls back to the localized default for null', () => {
    expect(formatRest(null)).toBe('١:٣٠');
  });

  it('falls back to the localized default for undefined', () => {
    expect(formatRest(undefined)).toBe('١:٣٠');
  });
});

describe('clampRestSeconds', () => {
  it('clamps values below the minimum up to MIN_REST_SEC', () => {
    expect(clampRestSeconds(0)).toBe(MIN_REST_SEC);
    expect(clampRestSeconds(-10)).toBe(MIN_REST_SEC);
    expect(clampRestSeconds(5)).toBe(MIN_REST_SEC);
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

  it('handles NaN by returning MIN_REST_SEC', () => {
    expect(clampRestSeconds(NaN)).toBe(MIN_REST_SEC);
  });
});
