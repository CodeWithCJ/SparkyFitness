import { evaluateFitnessTest } from '@workspace/shared';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import {
  activeSecondsAtDistance,
  distanceAtActiveSeconds,
  fitnessTestName,
  fitnessTestProgress,
  fitnessTestResultText,
  fitnessTestSurfaceName,
  fitnessTestSurfaceText,
  inclineAdjustmentText,
  measureFitnessTest,
  measureIndoorTest,
  parseClockText,
  paceChangeText,
  paceInUnit,
  paceRangeText,
  paceText,
} from '../../src/utils/fitnessTest';
import { fitnessTest } from '../helpers/fitnessTestFixture';

const DEG_PER_METER = 1 / 111_194.9;
const START = Date.UTC(2026, 9, 6, 10, 0, 0);

/** A fix every 10 s moving north at a steady `metersPerSecond`. */
function steadyRun(
  seconds: number,
  metersPerSecond: number,
  overrides: Partial<RecordedPoint> = {}
): RecordedPoint[] {
  const points: RecordedPoint[] = [];
  for (let s = 0; s <= seconds; s += 10) {
    points.push({
      t: START + s * 1000,
      lat: 51.5 + s * metersPerSecond * DEG_PER_METER,
      lon: -0.12,
      alt: null,
      hacc: 5,
      vacc: null,
      speed: null,
      course: null,
      seg: 0,
      ...overrides,
    });
  }
  return points;
}

describe('reading a recording at a mark', () => {
  it('finds the distance after some active time, between fixes', () => {
    const points = steadyRun(100, 4);
    expect(distanceAtActiveSeconds(points, 0)).toBe(0);
    expect(distanceAtActiveSeconds(points, 50)).toBeCloseTo(200, 0);
    expect(distanceAtActiveSeconds(points, 55)).toBeCloseTo(220, 0);
    expect(distanceAtActiveSeconds(points, 100)).toBeCloseTo(400, 0);
  });

  it('returns null when the recording is shorter than the mark', () => {
    expect(distanceAtActiveSeconds(steadyRun(100, 4), 101)).toBeNull();
    expect(distanceAtActiveSeconds([], 10)).toBeNull();
  });

  it('finds the time taken to reach a distance, between fixes', () => {
    const points = steadyRun(100, 4);
    expect(activeSecondsAtDistance(points, 200)).toBeCloseTo(50, 0);
    expect(activeSecondsAtDistance(points, 222)).toBeCloseTo(55.5, 0);
    expect(activeSecondsAtDistance(points, 401)).toBeNull();
  });

  it('does not count time or distance across a pause', () => {
    const before = steadyRun(100, 4);
    // Resumed 10 minutes later, 1 km further on, in a new stretch.
    const after = steadyRun(100, 4, { seg: 1 }).map((p, i) => ({
      ...p,
      t: p.t + 700_000,
      lat: p.lat + 1000 * DEG_PER_METER + (i > 0 ? 0 : 0),
    }));
    const points = [...before, ...after];
    expect(distanceAtActiveSeconds(points, 150)).toBeCloseTo(600, 0);
    expect(activeSecondsAtDistance(points, 600)).toBeCloseTo(150, 0);
  });
});

describe('measureFitnessTest', () => {
  it('takes the time to 5 km, whatever happens afterwards', () => {
    // 5 m/s: 5 km in 1000 s, then 200 s of jogging on.
    const points = steadyRun(1200, 5);
    const m = measureFitnessTest('5k', points)!;
    expect(m).toEqual({
      type: '5k',
      distanceMeters: 5000,
      durationSeconds: 1000,
    });
    expect(evaluateFitnessTest(m)).not.toBeNull();
  });

  it('is not a 5K test when 5 km was not reached', () => {
    expect(measureFitnessTest('5k', steadyRun(900, 5))).toBeNull();
  });

  it('takes the distance at exactly 12 minutes for a Cooper test', () => {
    const points = steadyRun(800, 4);
    expect(measureFitnessTest('cooper', points)).toEqual({
      type: 'cooper',
      distanceMeters: 2880,
      durationSeconds: 720,
    });
    expect(measureFitnessTest('cooper', steadyRun(700, 4))).toBeNull();
  });

  it('takes the distance at 10 and 30 minutes for the 30-minute run', () => {
    const points = steadyRun(1900, 4);
    expect(measureFitnessTest('30min', points)).toEqual({
      type: '30min',
      distanceMeters: 7200,
      splitDistanceMeters: 2400,
      durationSeconds: 1800,
    });
    expect(measureFitnessTest('30min', steadyRun(1700, 4))).toBeNull();
  });

  it('gives a threshold pace from the last 20 minutes', () => {
    const m = measureFitnessTest('30min', steadyRun(1800, 4))!;
    const outcome = evaluateFitnessTest(m)!;
    // 4 m/s is 250 s/km.
    expect(outcome.paces.thresholdSecondsPerKm).toBe(250);
  });
});

describe('fitnessTestProgress', () => {
  it('counts down the distance to the 5K mark', () => {
    const p = fitnessTestProgress('5k', 600, 3000);
    expect(p).toMatchObject({
      complete: false,
      remainingMeters: 2000,
      remainingSeconds: null,
    });
    expect(p.fraction).toBeCloseTo(0.6, 6);
    expect(fitnessTestProgress('5k', 1000, 5010).complete).toBe(true);
  });

  it('counts down the Cooper test', () => {
    expect(fitnessTestProgress('cooper', 300, 1000)).toMatchObject({
      complete: false,
      remainingSeconds: 420,
    });
    expect(fitnessTestProgress('cooper', 720, 3000).complete).toBe(true);
  });

  it('says when the last 20 minutes of the 30-minute run begin', () => {
    expect(fitnessTestProgress('30min', 599, 2000).inThresholdPhase).toBe(
      false
    );
    expect(fitnessTestProgress('30min', 600, 2000).inThresholdPhase).toBe(true);
    expect(fitnessTestProgress('30min', 1800, 7000).complete).toBe(true);
  });
});

describe('words and units', () => {
  const t = ((key: string, options?: Record<string, unknown>) => {
    let text = String(options?.defaultValue ?? key);
    for (const [name, value] of Object.entries(options ?? {})) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
    return text;
  }) as never;

  it('names the tests', () => {
    expect(fitnessTestName(t, '5k')).toBe('5K time trial');
    expect(fitnessTestName(t, '30min')).toBe('30-minute all-out run');
    expect(fitnessTestName(t, 'cooper')).toBe('12-minute Cooper test');
  });

  it('shows paces per kilometre or per mile', () => {
    expect(paceInUnit(300, 'km')).toBe(300);
    expect(paceInUnit(300, 'miles')).toBeCloseTo(482.8, 1);
    expect(paceText(t, 300, 'km')).toBe('5:00/km');
    expect(paceText(t, 300, 'miles')).toBe('8:03/mi');
    expect(paceRangeText(t, 290, 310, 'km')).toBe('4:50–5:10/km');
  });

  it('words each result by its test', () => {
    expect(fitnessTestResultText(t, fitnessTest(), 'km')).toBe('5K in 25:00');
    const cooper = fitnessTest({
      measurement: {
        type: 'cooper',
        distanceMeters: 3000,
        durationSeconds: 720,
      },
    });
    expect(fitnessTestResultText(t, cooper, 'km')).toBe(
      '3,000 m in 12 minutes'
    );
    expect(fitnessTestResultText(t, cooper, 'miles')).toBe(
      '1.86 mi in 12 minutes'
    );
    const thirty = fitnessTest({
      measurement: {
        type: '30min',
        distanceMeters: 6600,
        splitDistanceMeters: 2000,
        durationSeconds: 1800,
      },
    });
    expect(fitnessTestResultText(t, thirty, 'km')).toBe(
      '4:21/km over the last 20 minutes'
    );
  });

  it('words a change in pace', () => {
    expect(paceChangeText(t, -12, 'km')).toBe('12 s/km faster');
    expect(paceChangeText(t, 8, 'km')).toBe('8 s/km slower');
    expect(paceChangeText(t, 0.2, 'km')).toBe('no change');
    expect(paceChangeText(t, -10, 'miles')).toBe('16 s/mi faster');
  });
});

describe('parseClockText', () => {
  it('reads minutes and seconds, or hours too', () => {
    expect(parseClockText('24:30')).toBe(1470);
    expect(parseClockText(' 5:00 ')).toBe(300);
    expect(parseClockText('1:02:03')).toBe(3723);
    expect(parseClockText('0:45')).toBe(45);
  });

  it('refuses anything that is not a time', () => {
    for (const bad of [
      '',
      '24',
      '24:',
      ':30',
      '24:60',
      '1:75:00',
      'abc',
      '0:00',
      '1:2:3:4',
      '24.30',
      '-5:00',
    ]) {
      expect(parseClockText(bad)).toBeNull();
    }
  });
});

describe('measureIndoorTest', () => {
  const base = {
    activeSeconds: 0,
    distanceMeters: null,
    timeSeconds: null,
    splitMeters: null,
    inclinePercent: 1,
    adjustForIncline: true,
  };

  it('takes the 5K time from the clock unless the person typed one', () => {
    const fromClock = measureIndoorTest('5k', {
      ...base,
      activeSeconds: 1503.4,
    });
    expect(fromClock).toEqual({
      ok: true,
      measurement: {
        type: '5k',
        distanceMeters: 5000,
        durationSeconds: 1503,
        inclinePercent: 1,
        adjustForIncline: true,
      },
    });
    const typed = measureIndoorTest('5k', {
      ...base,
      activeSeconds: 1503,
      timeSeconds: 1490,
    });
    expect(typed).toMatchObject({
      ok: true,
      measurement: { durationSeconds: 1490 },
    });
  });

  it('needs a time for the 5K', () => {
    expect(measureIndoorTest('5k', base)).toEqual({
      ok: false,
      reason: 'badTime',
    });
  });

  it('ends the Cooper test on the clock and needs the distance', () => {
    expect(
      measureIndoorTest('cooper', {
        ...base,
        activeSeconds: 600,
        distanceMeters: 2500,
      })
    ).toEqual({ ok: false, reason: 'tooShort' });
    expect(
      measureIndoorTest('cooper', { ...base, activeSeconds: 725 })
    ).toEqual({ ok: false, reason: 'noDistance' });
    expect(
      measureIndoorTest('cooper', {
        ...base,
        activeSeconds: 725,
        distanceMeters: 0,
      })
    ).toEqual({ ok: false, reason: 'noDistance' });
    expect(
      measureIndoorTest('cooper', {
        ...base,
        activeSeconds: 725,
        distanceMeters: 2812.6,
      })
    ).toEqual({
      ok: true,
      measurement: {
        type: 'cooper',
        distanceMeters: 2813,
        durationSeconds: 720,
        inclinePercent: 1,
        adjustForIncline: true,
      },
    });
  });

  it('ends the 30-minute run on the clock and takes the distance at 10:00', () => {
    const run = {
      ...base,
      activeSeconds: 1805,
      distanceMeters: 6600,
      splitMeters: 2000,
    };
    expect(measureIndoorTest('30min', { ...run, activeSeconds: 1700 })).toEqual(
      {
        ok: false,
        reason: 'tooShort',
      }
    );
    expect(measureIndoorTest('30min', run)).toMatchObject({
      ok: true,
      measurement: {
        distanceMeters: 6600,
        splitDistanceMeters: 2000,
        durationSeconds: 1800,
      },
    });
  });

  it('assumes a steady pace when the 10-minute distance is left empty', () => {
    expect(
      measureIndoorTest('30min', {
        ...base,
        activeSeconds: 1800,
        distanceMeters: 6600,
      })
    ).toMatchObject({ ok: true, measurement: { splitDistanceMeters: 2200 } });
  });

  it('refuses a 10-minute distance that is not inside the total', () => {
    for (const splitMeters of [0, 6600, 7000]) {
      expect(
        measureIndoorTest('30min', {
          ...base,
          activeSeconds: 1800,
          distanceMeters: 6600,
          splitMeters,
        })
      ).toEqual({ ok: false, reason: 'badSplit' });
    }
  });

  it('carries the incline and whether to correct for it', () => {
    expect(
      measureIndoorTest('cooper', {
        ...base,
        activeSeconds: 720,
        distanceMeters: 3000,
        inclinePercent: null,
        adjustForIncline: false,
      })
    ).toMatchObject({
      ok: true,
      measurement: { inclinePercent: null, adjustForIncline: false },
    });
  });
});

describe('treadmill words', () => {
  const t = ((key: string, options?: Record<string, unknown>) => {
    let text = String(options?.defaultValue ?? key);
    for (const [name, value] of Object.entries(options ?? {})) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
    return text;
  }) as never;
  const cooper = (extra: object) =>
    fitnessTest({
      measurement: {
        type: 'cooper',
        distanceMeters: 3000,
        durationSeconds: 720,
        ...extra,
      },
    });

  it('names the surface', () => {
    expect(fitnessTestSurfaceName(t, 'outdoor')).toBe('Outdoor');
    expect(fitnessTestSurfaceName(t, 'indoor')).toBe('Treadmill');
  });

  it('says the incline and whether it was applied', () => {
    expect(fitnessTestSurfaceText(t, fitnessTest())).toBe('Outdoor');
    expect(
      fitnessTestSurfaceText(t, {
        surface: 'indoor',
        incline_percent: null,
        incline_adjusted: false,
      })
    ).toBe('Treadmill');
    expect(fitnessTestSurfaceText(t, cooper({ inclinePercent: 3 }))).toBe(
      'Treadmill, 3% incline, adjusted'
    );
    expect(
      fitnessTestSurfaceText(
        t,
        cooper({ inclinePercent: 2.5, adjustForIncline: false })
      )
    ).toBe('Treadmill, 2.5% incline, not adjusted');
  });

  it('shows the raw and adjusted numbers of a corrected test', () => {
    expect(
      inclineAdjustmentText(t, cooper({ inclinePercent: 3 }), 'km')
    ).toEqual({
      raw: '3,000 m in 12 minutes',
      adjusted: '3,258 m in 12 minutes',
    });
  });

  it('shows nothing when nothing was corrected', () => {
    expect(
      inclineAdjustmentText(t, cooper({ inclinePercent: 1 }), 'km')
    ).toBeNull();
    expect(
      inclineAdjustmentText(
        t,
        cooper({ inclinePercent: 3, adjustForIncline: false }),
        'km'
      )
    ).toBeNull();
    expect(inclineAdjustmentText(t, fitnessTest(), 'km')).toBeNull();
  });
});
