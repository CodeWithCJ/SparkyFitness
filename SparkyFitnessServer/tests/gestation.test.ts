import { describe, expect, it } from 'vitest';
import {
  gestationalAge,
  eddFromLmp,
  eddFromConception,
  contractionStats,
  weightGainRange,
  babyWeek,
  checklistForWeek,
  lookupSafety,
  matchMedSafety,
  FOOD_SAFETY,
  MED_SAFETY,
  type SharedContraction,
} from '@workspace/shared';

describe('eddFromLmp / eddFromConception', () => {
  it('adds 280 days to LMP', () => {
    expect(eddFromLmp('2026-01-01')).toBe('2026-10-08');
  });
  it('adds 266 days to conception', () => {
    expect(eddFromConception('2026-01-15')).toBe('2026-10-08');
  });
});

describe('gestationalAge', () => {
  const due = '2026-10-08'; // LMP 2026-01-01
  it('is week 0 at LMP', () => {
    const g = gestationalAge(due, '2026-01-01');
    expect(g.week).toBe(0);
    expect(g.trimester).toBe(1);
  });
  it('reports week 24 + trimester 2 correctly', () => {
    // LMP + 24w2d = 2026-01-01 + 170 days
    const g = gestationalAge(due, '2026-06-20');
    expect(g.week).toBe(24);
    expect(g.trimester).toBe(2);
    expect(g.daysRemaining).toBeGreaterThan(0);
  });
  it('crosses into trimester 3 at week 27', () => {
    const g = gestationalAge(due, '2026-07-16'); // ~week 28
    expect(g.trimester).toBe(3);
  });
  it('is full progress at the due date', () => {
    const g = gestationalAge(due, due);
    expect(g.week).toBe(40);
    expect(g.progress).toBe(1);
    expect(g.daysRemaining).toBe(0);
  });
});

describe('contractionStats 5-1-1', () => {
  it('detects a 5-1-1 pattern', () => {
    const now = Date.parse('2026-07-01T12:00:00Z');
    const contractions: SharedContraction[] = [];
    // 12 contractions, 5 min apart, each 60s long, spanning ~55 min (the "1 hour" leg).
    for (let i = 11; i >= 0; i--) {
      const start = now - i * 5 * 60 * 1000 - 60 * 1000;
      contractions.push({
        pregnancy_id: 'p',
        started_at: new Date(start).toISOString(),
        ended_at: new Date(start + 60 * 1000).toISOString(),
      });
    }
    const stats = contractionStats(contractions, now);
    expect(stats.count).toBe(12);
    expect(stats.isFiveOneOne).toBe(true);
  });
  it('does not flag sparse contractions', () => {
    const now = Date.parse('2026-07-01T12:00:00Z');
    const contractions: SharedContraction[] = [
      {
        pregnancy_id: 'p',
        started_at: new Date(now - 40 * 60 * 1000).toISOString(),
        ended_at: new Date(now - 40 * 60 * 1000 + 30 * 1000).toISOString(),
      },
    ];
    expect(contractionStats(contractions, now).isFiveOneOne).toBe(false);
  });
});

describe('weightGainRange', () => {
  it('returns null before week 1', () => {
    expect(weightGainRange(22, 0)).toBeNull();
  });
  it('classifies BMI and gives a widening range', () => {
    const normal = weightGainRange(22, 40, 1);
    expect(normal?.category).toBe('normal');
    expect(normal!.highKg).toBeGreaterThan(normal!.lowKg);
    const twins = weightGainRange(22, 40, 2);
    expect(twins!.highKg).toBeGreaterThan(normal!.highKg);
  });
});

describe('content tables', () => {
  it('has baby data for weeks 4-40', () => {
    expect(babyWeek(8)?.comparison).toBe('A raspberry');
    expect(babyWeek(24)?.comparison).toBe('An ear of corn');
    expect(babyWeek(40)).not.toBeNull();
  });
  it('surfaces checklist items for the current week', () => {
    const items = checklistForWeek(24);
    expect(items.some((i) => i.key === 'glucose_test')).toBe(true);
  });
  it('food safety lookup finds items and flags avoids', () => {
    const results = lookupSafety('tuna', FOOD_SAFETY);
    expect(results.length).toBeGreaterThan(0);
    expect(lookupSafety('sushi', FOOD_SAFETY)[0]?.status).toBe('avoid');
  });
  it('med safety matches a cabinet drug name', () => {
    expect(matchMedSafety('Advil 200mg')?.status).toBe('caution');
    expect(matchMedSafety('Prenatal vitamin')).toBeNull(); // safe => no badge
    void MED_SAFETY;
  });
});
