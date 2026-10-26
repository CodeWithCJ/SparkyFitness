import { describe, expect, it } from 'vitest';
import {
  applyIncline,
  comparePaces,
  cooperToFiveKSeconds,
  evaluateFitnessTest,
  inclineSpeedFactor,
  levelFromFiveK,
  programIdForFiveK,
  racePaceFromFiveK,
  retestStatus,
  thirtyMinuteThresholdPace,
  thresholdPaceFromEffort,
  weeksSinceTest,
  buildRacePlan,
  findProgram,
  type FitnessTestPaces,
} from '@workspace/shared';

describe('cooperToFiveKSeconds', () => {
  it('turns 12 minutes of running into a 5K time with Riegel', () => {
    // 3000 m in 12 min is 4:00/km; Riegel carries that to about 20:53 for 5K.
    const seconds = cooperToFiveKSeconds(3000)!;
    expect(seconds).toBeCloseTo(720 * (5000 / 3000) ** 1.06, 6);
    expect(seconds).toBeGreaterThan(1200);
    expect(seconds).toBeLessThan(1300);
  });

  it('gives a slower 5K for a shorter distance', () => {
    expect(cooperToFiveKSeconds(2000)!).toBeGreaterThan(
      cooperToFiveKSeconds(2500)!
    );
  });

  it('rejects distances that cannot be a 12-minute run', () => {
    expect(cooperToFiveKSeconds(500)).toBeNull();
    expect(cooperToFiveKSeconds(6000)).toBeNull();
    expect(cooperToFiveKSeconds(Number.NaN)).toBeNull();
  });
});

describe('thirtyMinuteThresholdPace', () => {
  it('is the average pace of the last 20 minutes', () => {
    // 6600 m in 30 min with 2000 m in the first 10: 4600 m in the last 20.
    expect(thirtyMinuteThresholdPace(6600, 2000)).toBeCloseTo(1200 / 4.6, 6);
  });

  it('needs a split inside the run', () => {
    expect(thirtyMinuteThresholdPace(6000, null)).toBeNull();
    expect(thirtyMinuteThresholdPace(6000, undefined)).toBeNull();
    expect(thirtyMinuteThresholdPace(6000, 0)).toBeNull();
    expect(thirtyMinuteThresholdPace(6000, 6000)).toBeNull();
    expect(thirtyMinuteThresholdPace(6000, 7000)).toBeNull();
  });

  it('rejects a last 20 minutes that is too slow or too fast to be real', () => {
    expect(thirtyMinuteThresholdPace(1500, 500)).toBeNull();
    expect(thirtyMinuteThresholdPace(20000, 2000)).toBeNull();
  });
});

describe('evaluateFitnessTest', () => {
  it('works out a 5K time trial from the shared effort maths', () => {
    const outcome = evaluateFitnessTest({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1500,
    })!;
    expect(outcome.resultValue).toBe(1500);
    expect(outcome.paces.equivalent5kSeconds).toBe(1500);
    expect(outcome.paces.thresholdSecondsPerKm).toBe(
      Math.round(thresholdPaceFromEffort(5000, 1500)!)
    );
    expect(outcome.paces.zones.map((zone) => zone.id)).toEqual([
      'easy',
      'steady',
      'threshold',
      'interval',
      'repetition',
    ]);
    // 25:00 5K is 5:00/km; the interval range sits around it.
    expect(outcome.paces.raceZones.interval).toEqual({
      minSecondsPerKm: 290,
      maxSecondsPerKm: 310,
    });
  });

  it('only accepts a 5K at exactly 5000 m', () => {
    expect(
      evaluateFitnessTest({
        type: '5k',
        distanceMeters: 4800,
        durationSeconds: 1500,
      })
    ).toBeNull();
    expect(
      evaluateFitnessTest({
        type: '5k',
        distanceMeters: 5000,
        durationSeconds: 100,
      })
    ).toBeNull();
  });

  it('turns a Cooper distance into a 5K equivalent and threshold', () => {
    const outcome = evaluateFitnessTest({
      type: 'cooper',
      distanceMeters: 3000,
      durationSeconds: 720,
    })!;
    expect(outcome.resultValue).toBe(3000);
    expect(outcome.paces.equivalent5kSeconds).toBe(
      Math.round(cooperToFiveKSeconds(3000)!)
    );
    expect(outcome.paces.thresholdSecondsPerKm).toBe(
      Math.round(thresholdPaceFromEffort(5000, cooperToFiveKSeconds(3000)!)!)
    );
  });

  it('only accepts a Cooper test that lasted 12 minutes', () => {
    expect(
      evaluateFitnessTest({
        type: 'cooper',
        distanceMeters: 3000,
        durationSeconds: 600,
      })
    ).toBeNull();
  });

  it('uses the last 20 minutes of the 30-minute run as the threshold', () => {
    const outcome = evaluateFitnessTest({
      type: '30min',
      distanceMeters: 6600,
      splitDistanceMeters: 2000,
      durationSeconds: 1800,
    })!;
    expect(outcome.paces.thresholdSecondsPerKm).toBe(261);
    expect(outcome.resultValue).toBe(261);
    expect(outcome.paces.equivalent5kSeconds).toBeGreaterThan(1000);
    expect(outcome.paces.equivalent5kSeconds).toBeLessThan(1400);
  });

  it('needs the 10-minute split for the 30-minute run', () => {
    expect(
      evaluateFitnessTest({
        type: '30min',
        distanceMeters: 6600,
        durationSeconds: 1800,
      })
    ).toBeNull();
    expect(
      evaluateFitnessTest({
        type: '30min',
        distanceMeters: 6600,
        splitDistanceMeters: 2000,
        durationSeconds: 1500,
      })
    ).toBeNull();
  });

  it('rejects an unknown test and numbers that are not finite', () => {
    expect(
      evaluateFitnessTest({
        type: 'mile' as never,
        distanceMeters: 1609,
        durationSeconds: 360,
      })
    ).toBeNull();
    expect(
      evaluateFitnessTest({
        type: '5k',
        distanceMeters: 5000,
        durationSeconds: Number.NaN,
      })
    ).toBeNull();
  });
});

describe('comparePaces', () => {
  const paces = (seconds: number): FitnessTestPaces =>
    evaluateFitnessTest({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: seconds,
    })!.paces;

  it('reports faster paces as negative changes', () => {
    const change = comparePaces(paces(1500), paces(1440));
    expect(change.thresholdChangeSeconds).toBeLessThan(0);
    expect(change.equivalent5kChangeSeconds).toBe(-60);
    expect(change.zones).toHaveLength(5);
    for (const zone of change.zones) {
      expect(zone.minChangeSeconds).toBeLessThanOrEqual(0);
      expect(zone.maxChangeSeconds).toBeLessThanOrEqual(0);
    }
  });

  it('reports no change for the same test', () => {
    const change = comparePaces(paces(1500), paces(1500));
    expect(change.thresholdChangeSeconds).toBe(0);
    expect(change.zones.every((zone) => zone.minChangeSeconds === 0)).toBe(
      true
    );
  });
});

describe('retestStatus', () => {
  it('is recent before six weeks', () => {
    expect(retestStatus('2026-09-01', '2026-10-12')).toBe('recent');
  });

  it('is due from six weeks to eight weeks', () => {
    expect(retestStatus('2026-09-01', '2026-10-13')).toBe('due');
    expect(retestStatus('2026-09-01', '2026-10-27')).toBe('due');
  });

  it('is overdue after eight weeks', () => {
    expect(retestStatus('2026-09-01', '2026-10-28')).toBe('overdue');
  });

  it('counts whole weeks', () => {
    expect(weeksSinceTest('2026-09-01', '2026-10-13')).toBe(6);
    expect(weeksSinceTest('2026-09-01', '2026-09-03')).toBe(0);
  });
});

describe('plans from a test', () => {
  it('turns a 5K time into a pace for a longer race', () => {
    expect(racePaceFromFiveK(1500, 5)).toBeCloseTo(300, 6);
    expect(racePaceFromFiveK(1500, 10)!).toBeGreaterThan(300);
    expect(racePaceFromFiveK(0, 10)).toBeNull();
  });

  it('picks a starting level from the 5K time', () => {
    expect(levelFromFiveK(40 * 60)).toBe('new');
    expect(levelFromFiveK(32 * 60)).toBe('some');
    expect(levelFromFiveK(25 * 60)).toBe('regular');
    expect(levelFromFiveK(20 * 60)).toBe('experienced');
  });

  it('suggests a program that exists', () => {
    for (const seconds of [2400, 1800, 1300]) {
      expect(findProgram(programIdForFiveK(seconds))).not.toBeNull();
    }
  });

  it('plans race day at the pace from the test', () => {
    const titles = {
      easy: 'Easy',
      long: 'Long',
      tempo: 'Tempo',
      intervals: 'Intervals',
      shakeout: 'Shake-out',
      race: 'Race',
    };
    const base = {
      distance: '10k' as const,
      level: 'some' as const,
      raceDay: '2026-12-27',
      today: '2026-10-18',
      runDays: [2, 4, 0],
      titles,
    };
    const guessed = buildRacePlan(base);
    const fromTest = buildRacePlan({ ...base, racePaceSecondsPerKm: 300 });
    expect(fromTest.raceMinutes).toBe(50);
    expect(fromTest.raceMinutes).not.toBe(guessed.raceMinutes);
    // A pace that cannot be right is ignored.
    expect(
      buildRacePlan({ ...base, racePaceSecondsPerKm: 20 }).raceMinutes
    ).toBe(guessed.raceMinutes);
  });
});

describe('inclineSpeedFactor', () => {
  it('is exactly 1 at 1%, which stands in for a flat outdoor run', () => {
    expect(inclineSpeedFactor(1)).toBe(1);
  });

  it('counts a 0% treadmill for a little less than the same speed outdoors', () => {
    // ACSM running cost per metre: 0.2 at 0%, 0.209 at 1%.
    expect(inclineSpeedFactor(0)).toBeCloseTo(0.2 / 0.209, 6);
    expect(inclineSpeedFactor(0)!).toBeLessThan(1);
  });

  it('counts a steeper treadmill for more, about 4% per percent of incline', () => {
    expect(inclineSpeedFactor(2)).toBeCloseTo(0.218 / 0.209, 6);
    expect(inclineSpeedFactor(5)).toBeCloseTo(0.245 / 0.209, 6);
    expect(inclineSpeedFactor(15)).toBeCloseTo(0.335 / 0.209, 6);
    expect(inclineSpeedFactor(5)!).toBeGreaterThan(inclineSpeedFactor(2)!);
  });

  it('refuses an incline that is not between 0 and 15 percent', () => {
    expect(inclineSpeedFactor(-0.5)).toBeNull();
    expect(inclineSpeedFactor(15.1)).toBeNull();
    expect(inclineSpeedFactor(Number.NaN)).toBeNull();
  });
});

describe('applyIncline', () => {
  const cooper = {
    type: 'cooper' as const,
    distanceMeters: 3000,
    durationSeconds: 720,
  };

  it('changes nothing without an incline, at 1%, or with the correction off', () => {
    expect(applyIncline(cooper)).toEqual(cooper);
    expect(applyIncline({ ...cooper, inclinePercent: null })).toMatchObject(
      cooper
    );
    const flat = { ...cooper, inclinePercent: 1 };
    expect(applyIncline(flat)).toEqual(flat);
    const off = { ...cooper, inclinePercent: 6, adjustForIncline: false };
    expect(applyIncline(off)).toEqual(off);
  });

  it('credits more distance for a steeper treadmill, and less for 0%', () => {
    expect(
      applyIncline({ ...cooper, inclinePercent: 3 }).distanceMeters
    ).toBeCloseTo((3000 * 0.227) / 0.209, 6);
    expect(
      applyIncline({ ...cooper, inclinePercent: 0 }).distanceMeters
    ).toBeCloseTo((3000 * 0.2) / 0.209, 6);
    expect(applyIncline({ ...cooper, inclinePercent: 3 }).durationSeconds).toBe(
      720
    );
  });

  it('shortens the time of a 5K, which has a fixed distance', () => {
    const fiveK = {
      type: '5k' as const,
      distanceMeters: 5000,
      durationSeconds: 1500,
    };
    const steeper = applyIncline({ ...fiveK, inclinePercent: 3 });
    expect(steeper.durationSeconds).toBeCloseTo((1500 * 0.209) / 0.227, 6);
    expect(steeper.distanceMeters).toBe(5000);
    expect(
      applyIncline({ ...fiveK, inclinePercent: 0 }).durationSeconds
    ).toBeGreaterThan(1500);
  });

  it('scales the total and the 10-minute split of the 30-minute run alike', () => {
    const thirty = {
      type: '30min' as const,
      distanceMeters: 6600,
      splitDistanceMeters: 2000,
      durationSeconds: 1800,
      inclinePercent: 3,
    };
    const factor = 0.227 / 0.209;
    const adjusted = applyIncline(thirty);
    expect(adjusted.distanceMeters).toBeCloseTo(6600 * factor, 6);
    expect(adjusted.splitDistanceMeters).toBeCloseTo(2000 * factor, 6);
  });

  it('leaves a missing split missing', () => {
    expect(
      applyIncline({
        type: '30min',
        distanceMeters: 6600,
        durationSeconds: 1800,
        inclinePercent: 3,
      }).splitDistanceMeters
    ).toBeUndefined();
  });
});

describe('evaluateFitnessTest on a treadmill', () => {
  const cooper = {
    type: 'cooper' as const,
    distanceMeters: 3000,
    durationSeconds: 720,
  };

  it('reports the adjusted result and faster paces for a steeper treadmill', () => {
    const raw = evaluateFitnessTest({
      ...cooper,
      inclinePercent: 3,
      adjustForIncline: false,
    })!;
    const adjusted = evaluateFitnessTest({ ...cooper, inclinePercent: 3 })!;
    expect(raw.resultValue).toBe(3000);
    expect(adjusted.resultValue).toBe(Math.round((3000 * 0.227) / 0.209));
    expect(adjusted.paces.thresholdSecondsPerKm).toBeLessThan(
      raw.paces.thresholdSecondsPerKm
    );
  });

  it('gives the same result at 1% as with no incline entered', () => {
    expect(evaluateFitnessTest({ ...cooper, inclinePercent: 1 })).toEqual(
      evaluateFitnessTest(cooper)
    );
  });

  it('slows the paces for a 0% treadmill', () => {
    expect(
      evaluateFitnessTest({ ...cooper, inclinePercent: 0 })!.paces
        .thresholdSecondsPerKm
    ).toBeGreaterThan(evaluateFitnessTest(cooper)!.paces.thresholdSecondsPerKm);
  });

  it('adjusts a 5K time and a 30-minute run too', () => {
    const fiveK = evaluateFitnessTest({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1500,
      inclinePercent: 4,
    })!;
    expect(fiveK.resultValue).toBe(Math.round((1500 * 0.209) / 0.236));
    const thirty = evaluateFitnessTest({
      type: '30min',
      distanceMeters: 6600,
      splitDistanceMeters: 2000,
      durationSeconds: 1800,
      inclinePercent: 4,
    })!;
    // The last 20 minutes are 4600 m raw; the pace is that over the factor.
    expect(thirty.resultValue).toBe(Math.round(261.0 / (0.236 / 0.209)));
  });

  it('refuses an incline outside 0 to 15 percent, adjusted or not', () => {
    expect(evaluateFitnessTest({ ...cooper, inclinePercent: 16 })).toBeNull();
    expect(
      evaluateFitnessTest({
        ...cooper,
        inclinePercent: -1,
        adjustForIncline: false,
      })
    ).toBeNull();
  });
});
