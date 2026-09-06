import { describe, it, expect } from 'vitest';
import {
  activeCaffeineAt,
  bedtimeHeadroomMg,
  caffeineAtBedtime,
  caffeineCurve,
  caffeineCutoff,
  latestSafeDoseTime,
  thresholdCrossingTime,
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

// latestSafeDoseTime answers "when does this dose alone decay to the
// threshold?", which ignores everything already circulating. With a 5 h
// half-life, a 200 mg dose and a 100 mg threshold that is always bedtime minus
// five hours -- the same answer on a dry day as after four coffees.
describe('caffeineCutoff — counts what is already on board', () => {
  const bedtime = '2026-09-05T22:30:00.000Z';
  const morning = '2026-09-05T08:00:00.000Z';

  it('moves earlier as caffeine is logged, where the old cutoff never moved', () => {
    const dry = caffeineCutoff({
      doses: [],
      bedtimeInstant: bedtime,
      nowInstant: morning,
      halfLifeHours: 5,
      thresholdMg: 100,
      doseMg: 200,
    });
    const afterACoffee = caffeineCutoff({
      doses: [{ at: '2026-09-05T15:00:00.000Z', mg: 120 }],
      bedtimeInstant: bedtime,
      nowInstant: morning,
      halfLifeHours: 5,
      thresholdMg: 100,
      doseMg: 200,
    });

    expect(dry.kind).toBe('by');
    expect(afterACoffee.kind).toBe('by');
    // The whole point: the two answers differ.
    expect((afterACoffee as { at: string }).at).not.toBe(
      (dry as { at: string }).at
    );
    expect(
      new Date((afterACoffee as { at: string }).at).getTime()
    ).toBeLessThan(new Date((dry as { at: string }).at).getTime());

    // With no doses the headroom is the whole threshold, so this matches the
    // old isolated-dose formula exactly: bedtime - 5*log2(200/100) = 17:30.
    expect((dry as { at: string }).at).toBe(
      latestSafeDoseTime(200, bedtime, 5, 100)
    );
  });

  it('reports "over" when the threshold is already breached at bedtime', () => {
    const doses = [{ at: '2026-09-05T21:00:00.000Z', mg: 400 }];
    expect(
      caffeineCutoff({
        doses,
        bedtimeInstant: bedtime,
        nowInstant: '2026-09-05T21:30:00.000Z',
        halfLifeHours: 5,
        thresholdMg: 100,
        doseMg: 200,
      })
    ).toEqual({ kind: 'over' });
    expect(bedtimeHeadroomMg(doses, bedtime, 5, 100)).toBeLessThan(0);
  });

  it('reports "passed" once the cutoff instant has gone by', () => {
    const cutoff = caffeineCutoff({
      doses: [],
      bedtimeInstant: bedtime,
      nowInstant: '2026-09-05T20:00:00.000Z',
      halfLifeHours: 5,
      thresholdMg: 100,
      doseMg: 200,
    });
    expect(cutoff.kind).toBe('passed');
  });

  it('reports "anytime" when the dose fits under the remaining headroom', () => {
    expect(
      caffeineCutoff({
        doses: [],
        bedtimeInstant: bedtime,
        nowInstant: morning,
        halfLifeHours: 5,
        thresholdMg: 100,
        doseMg: 60,
      })
    ).toEqual({ kind: 'anytime' });
  });

  it('never claims "anytime" merely because the dose is small, once room has gone', () => {
    // 95 mg is under the 100 mg threshold, so the old formula returned null
    // ("any time") no matter how much was already on board.
    const doses = [{ at: '2026-09-05T20:00:00.000Z', mg: 300 }];
    expect(latestSafeDoseTime(95, bedtime, 5, 100)).toBeNull();
    expect(
      caffeineCutoff({
        doses,
        bedtimeInstant: bedtime,
        nowInstant: morning,
        halfLifeHours: 5,
        thresholdMg: 100,
        doseMg: 95,
      })
    ).toEqual({ kind: 'over' });
  });
});

describe('caffeineCurve and thresholdCrossingTime', () => {
  const from = '2026-09-05T06:00:00.000Z';
  const to = '2026-09-05T23:00:00.000Z';
  const doses = [
    { at: '2026-09-05T08:00:00.000Z', mg: 95 },
    { at: '2026-09-05T13:00:00.000Z', mg: 60 },
  ];

  it('sits at zero before the first dose and steps up on it', () => {
    const curve = caffeineCurve(doses, from, to, 5, 10);
    expect(curve[0]).toEqual({ t: new Date(from).getTime(), mg: 0 });

    const doseMs = new Date(doses[0]!.at).getTime();
    const justBefore = curve.find((p) => p.t === doseMs - 1);
    const atDose = curve.find((p) => p.t === doseMs);
    // The dose instant is sampled explicitly, so the rise is vertical rather
    // than sloping up from whichever grid point happened to precede it.
    expect(justBefore?.mg).toBe(0);
    expect(atDose?.mg).toBe(95);
  });

  it('decays monotonically after the last dose', () => {
    const lastMs = new Date(doses[1]!.at).getTime();
    const tail = caffeineCurve(doses, from, to, 5, 10).filter(
      (p) => p.t > lastMs
    );
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i]!.mg).toBeLessThanOrEqual(tail[i - 1]!.mg);
    }
  });

  it('returns nothing for an inverted or empty window', () => {
    expect(caffeineCurve(doses, to, from, 5, 10)).toEqual([]);
    expect(caffeineCurve(doses, from, from, 5, 10)).toEqual([]);
  });

  it('solves the threshold crossing exactly, matching a scan', () => {
    const crossing = thresholdCrossingTime(doses, 5, 100);
    expect(crossing).not.toBeNull();

    const crossMs = new Date(crossing!).getTime();
    expect(activeCaffeineAt(doses, crossMs, 5)).toBeCloseTo(100, 1);
    // Above just before, at or under just after.
    expect(activeCaffeineAt(doses, crossMs - 60_000, 5)).toBeGreaterThan(100);
    expect(activeCaffeineAt(doses, crossMs + 60_000, 5)).toBeLessThan(100);
  });

  it('has no crossing when the total never reaches the threshold', () => {
    expect(thresholdCrossingTime([{ at: from, mg: 40 }], 5, 100)).toBeNull();
    expect(thresholdCrossingTime([], 5, 100)).toBeNull();
  });
});
