import { describe, it, expect } from 'vitest';
import {
  activeCaffeineAt,
  caffeineAtBedtime,
  latestSafeDoseTime,
} from '@workspace/shared';
import type { CaffeineDose } from '@workspace/shared';

describe('Caffeine Kinetics Mathematical Model', () => {
  it('calculates 50% decay at 1 half-life and 75% decay at 2 half-lives', () => {
    const t0 = new Date('2026-09-05T08:00:00.000Z');
    const dose: CaffeineDose = {
      at: t0.toISOString(),
      mg: 100,
    };

    // At t0 (immediate) -> 100 mg
    expect(activeCaffeineAt([dose], t0, 5)).toBe(100);

    // At t0 + 5h (1 half-life) -> 50 mg
    const t5 = new Date('2026-09-05T13:00:00.000Z');
    expect(activeCaffeineAt([dose], t5, 5)).toBe(50);

    // At t0 + 10h (2 half-lives) -> 25 mg
    const t10 = new Date('2026-09-05T18:00:00.000Z');
    expect(activeCaffeineAt([dose], t10, 5)).toBe(25);
  });

  it('returns 0 for empty doses or invalid half-life', () => {
    expect(activeCaffeineAt([], new Date(), 5)).toBe(0);
    expect(
      activeCaffeineAt(
        [{ at: new Date().toISOString(), mg: 100 }],
        new Date(),
        0
      )
    ).toBe(0);
  });

  it('ignores future doses (they contribute 0)', () => {
    const now = new Date('2026-09-05T10:00:00.000Z');
    const futureDose: CaffeineDose = {
      at: '2026-09-05T12:00:00.000Z',
      mg: 200,
    };
    const pastDose: CaffeineDose = {
      at: '2026-09-05T05:00:00.000Z', // 5h ago -> 1 half life
      mg: 100,
    };

    const active = activeCaffeineAt([pastDose, futureDose], now, 5);
    expect(active).toBe(50);
  });

  it('sums multiple historical doses correctly', () => {
    const now = new Date('2026-09-05T15:00:00.000Z');
    const dose1: CaffeineDose = {
      at: '2026-09-05T05:00:00.000Z', // 10h ago (2 half lives) -> 100 * 0.25 = 25
      mg: 100,
    };
    const dose2: CaffeineDose = {
      at: '2026-09-05T10:00:00.000Z', // 5h ago (1 half life) -> 100 * 0.5 = 50
      mg: 100,
    };

    const total = activeCaffeineAt([dose1, dose2], now, 5);
    expect(total).toBe(75);
  });

  it('caffeineAtBedtime projects residual caffeine at target bedtime', () => {
    const bedtime = '2026-09-05T22:00:00.000Z';
    const dose: CaffeineDose = {
      at: '2026-09-05T17:00:00.000Z', // 5h before bedtime
      mg: 100,
    };

    expect(caffeineAtBedtime([dose], bedtime, 5)).toBe(50);
  });

  describe('latestSafeDoseTime', () => {
    it('returns null when dose <= threshold (no curfew needed)', () => {
      const bedtime = '2026-09-05T22:30:00.000Z';
      // 95 mg < 100 mg threshold
      expect(latestSafeDoseTime(95, bedtime, 5, 100)).toBeNull();
      // 100 mg === 100 mg threshold
      expect(latestSafeDoseTime(100, bedtime, 5, 100)).toBeNull();
    });

    it('calculates the exact cutoff instant for a dose exceeding threshold', () => {
      const bedtime = new Date('2026-09-05T22:00:00.000Z');
      // For a 200 mg dose with 100 mg threshold and 5h half life:
      // dose * 2^(-Δt/5) = 100 => 2^(-Δt/5) = 0.5 => Δt = 5 hours.
      // Bedtime (22:00) - 5h = 17:00 UTC.
      const cutoff = latestSafeDoseTime(200, bedtime.toISOString(), 5, 100);
      expect(cutoff).toBe('2026-09-05T17:00:00.000Z');
    });

    it('handles custom half-life and threshold', () => {
      const bedtime = new Date('2026-09-05T22:00:00.000Z');
      // 400 mg dose, 100 mg threshold (factor of 4 = 2 half-lives), half-life = 3h
      // Δt = 6 hours => Bedtime 22:00 - 6h = 16:00 UTC
      const cutoff = latestSafeDoseTime(400, bedtime.toISOString(), 3, 100);
      expect(cutoff).toBe('2026-09-05T16:00:00.000Z');
    });
  });
});
