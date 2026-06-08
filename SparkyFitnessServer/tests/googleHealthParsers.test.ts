import { describe, it, expect } from 'vitest';
import { googleTimeToIso, parseDurationToSeconds } from '../integrations/googlehealth/googleHealthService.js';

describe('googleTimeToIso', () => {
  it('converts a structured date+time object', () => {
    const t = { date: { year: 2026, month: 5, day: 1 }, time: { hours: 22, minutes: 30, seconds: 0 } };
    expect(googleTimeToIso(t)).toBe('2026-05-01T22:30:00.000Z');
  });

  it('defaults missing time fields to midnight UTC', () => {
    expect(googleTimeToIso({ date: { year: 2026, month: 5, day: 1 } })).toBe('2026-05-01T00:00:00.000Z');
  });

  it('converts a raw ISO string', () => {
    expect(googleTimeToIso('2026-05-01T22:30:00Z')).toBe('2026-05-01T22:30:00.000Z');
  });

  it('returns null for null', () => {
    expect(googleTimeToIso(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(googleTimeToIso(undefined)).toBeNull();
  });

  it('returns null for an invalid date string instead of throwing', () => {
    expect(googleTimeToIso('not-a-date')).toBeNull();
  });

  it('returns null for an unrecognised shape', () => {
    expect(googleTimeToIso(42)).toBeNull();
  });
});

describe('parseDurationToSeconds', () => {
  it('parses plain seconds format', () => {
    expect(parseDurationToSeconds('1829s')).toBe(1829);
  });

  it('rounds fractional plain seconds', () => {
    expect(parseDurationToSeconds('90.6s')).toBe(91);
  });

  it('is case-insensitive for the s suffix', () => {
    expect(parseDurationToSeconds('60S')).toBe(60);
  });

  it('parses ISO 8601 hours + minutes + seconds', () => {
    expect(parseDurationToSeconds('PT1H30M45S')).toBe(5445);
  });

  it('parses ISO 8601 hours only', () => {
    expect(parseDurationToSeconds('PT2H')).toBe(7200);
  });

  it('parses ISO 8601 minutes only', () => {
    expect(parseDurationToSeconds('PT45M')).toBe(2700);
  });

  it('returns null for null', () => {
    expect(parseDurationToSeconds(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseDurationToSeconds(undefined)).toBeNull();
  });

  it('returns null for unrecognised format', () => {
    expect(parseDurationToSeconds('banana')).toBeNull();
  });
});
