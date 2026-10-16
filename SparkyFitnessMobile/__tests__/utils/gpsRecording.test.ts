import {
  acceptFix,
  computeLaps,
  computeSplits,
  cumulativeDistances,
  currentPaceSecondsPerUnit,
  elevationGainLoss,
  formatClock,
  formatPace,
  gpsSignalLevel,
  haversineMeters,
  METERS_PER_KM,
  paceSecondsPerUnit,
  splitBars,
  splitsToLapWindows,
  summarizeRecording,
  toWorkoutGpsPoints,
  type RecordedPoint,
} from '../../src/utils/gpsRecording';

// One degree of latitude is ~111.19 km, so this many degrees is ~1 m north.
const DEG_PER_METER = 1 / 111_194.9;

function point(
  seconds: number,
  metersNorth: number,
  overrides: Partial<RecordedPoint> = {}
): RecordedPoint {
  return {
    t: Date.UTC(2026, 9, 6, 10, 0, 0) + seconds * 1000,
    lat: 51.5 + metersNorth * DEG_PER_METER,
    lon: -0.12,
    alt: null,
    hacc: 5,
    vacc: null,
    speed: null,
    course: null,
    seg: 0,
    ...overrides,
  };
}

/** A steady track: one fix every `stepSeconds`, moving at `mps`. */
function steadyTrack(totalSeconds: number, mps: number, stepSeconds = 5) {
  const out: RecordedPoint[] = [];
  for (let s = 0; s <= totalSeconds; s += stepSeconds)
    out.push(point(s, s * mps));
  return out;
}

describe('haversineMeters', () => {
  it('measures a known distance', () => {
    expect(
      haversineMeters({ lat: 51.5, lon: -0.12 }, { lat: 51.51, lon: -0.12 })
    ).toBeCloseTo(1111.95, 0);
  });
});

describe('acceptFix', () => {
  const raw = (seconds: number, metersNorth: number, extra = {}) => ({
    t: Date.UTC(2026, 9, 6, 10, 0, 0) + seconds * 1000,
    lat: 51.5 + metersNorth * DEG_PER_METER,
    lon: -0.12,
    hacc: 5,
    ...extra,
  });

  it('keeps the first usable fix', () => {
    expect(acceptFix(undefined, raw(0, 0), 0, 'run')).not.toBeNull();
  });

  it('drops fixes with a poor accuracy radius', () => {
    expect(acceptFix(undefined, raw(0, 0, { hacc: 120 }), 0, 'run')).toBeNull();
  });

  it('waits for a tighter fix to open the track', () => {
    // Fine for the middle of a track, too loose to start one.
    expect(acceptFix(undefined, raw(0, 0, { hacc: 40 }), 0, 'walk')).toBeNull();
    expect(
      acceptFix(undefined, raw(0, 0, { hacc: 20 }), 0, 'walk')
    ).not.toBeNull();
  });

  it('holds the first fix after a resume to the same bar', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'walk')!;
    expect(acceptFix(prev, raw(60, 80, { hacc: 40 }), 1, 'walk')).toBeNull();
    expect(
      acceptFix(prev, raw(60, 80, { hacc: 20 }), 1, 'walk')
    ).not.toBeNull();
  });

  it('keeps a looser fix once the stretch is under way', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'walk')!;
    expect(
      acceptFix(prev, raw(20, 30, { hacc: 40 }), 0, 'walk')
    ).not.toBeNull();
  });

  it('drops out-of-range coordinates and non-finite times', () => {
    expect(
      acceptFix(undefined, { t: 1, lat: 91, lon: 0 }, 0, 'run')
    ).toBeNull();
    expect(
      acceptFix(undefined, { t: NaN, lat: 1, lon: 0 }, 0, 'run')
    ).toBeNull();
  });

  it('drops a jump that implies an impossible speed', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'run')!;
    // 500 m in 5 s is 100 m/s.
    expect(acceptFix(prev, raw(5, 500), 0, 'run')).toBeNull();
  });

  it('lets a ride go faster than a run', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'ride')!;
    // 100 m in 5 s is 20 m/s.
    expect(acceptFix(prev, raw(5, 100), 0, 'ride')).not.toBeNull();
    const runPrev = acceptFix(undefined, raw(0, 0), 0, 'run')!;
    expect(acceptFix(runPrev, raw(5, 100), 0, 'run')).toBeNull();
  });

  it('drops standing-still jitter but keeps a heartbeat fix', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'walk')!;
    expect(acceptFix(prev, raw(3, 1), 0, 'walk')).toBeNull();
    expect(acceptFix(prev, raw(20, 1), 0, 'walk')).not.toBeNull();
  });

  it('drops a fix that is not newer than the last', () => {
    const prev = acceptFix(undefined, raw(10, 0), 0, 'walk')!;
    expect(acceptFix(prev, raw(10, 20), 0, 'walk')).toBeNull();
    expect(acceptFix(prev, raw(5, 20), 0, 'walk')).toBeNull();
  });

  it('always keeps the first fix after a resume', () => {
    const prev = acceptFix(undefined, raw(0, 0), 0, 'run')!;
    // Far away after a pause: a jump, but a new segment, so not a glitch.
    expect(acceptFix(prev, raw(600, 5000), 1, 'run')).not.toBeNull();
  });

  it('treats a negative speed as unknown', () => {
    expect(
      acceptFix(undefined, raw(0, 0, { speed: -1 }), 0, 'run')!.speed
    ).toBeNull();
  });
});

describe('distance, time and pace', () => {
  it('sums path length and does not count a pause as distance', () => {
    const points = [
      point(0, 0),
      point(10, 20),
      // Paused, then resumed 1 km further on.
      point(500, 1020, { seg: 1 }),
      point(510, 1040, { seg: 1 }),
    ];
    const d = cumulativeDistances(points);
    expect(d[3]).toBeCloseTo(40, 0);
    const summary = summarizeRecording(points);
    expect(summary.distanceMeters).toBeCloseTo(40, 0);
    expect(summary.activeSeconds).toBeCloseTo(20, 5);
  });

  it('computes pace per km and per mile', () => {
    expect(paceSecondsPerUnit(1000, 300, METERS_PER_KM)).toBe(300);
    expect(paceSecondsPerUnit(1609.344, 480, 1609.344)).toBeCloseTo(480);
    expect(paceSecondsPerUnit(0, 100, 1000)).toBeNull();
  });

  it('reports current pace over the recent stretch only', () => {
    // 4 m/s for 100 s, then 2 m/s for 100 s.
    const points: RecordedPoint[] = [];
    let meters = 0;
    for (let s = 0; s <= 200; s += 5) {
      points.push(point(s, meters));
      meters += s < 100 ? 20 : 10;
    }
    const pace = currentPaceSecondsPerUnit(points, 1000, 100)!;
    expect(pace).toBeCloseTo(500, -1); // 2 m/s => 500 s/km
  });

  it('excludes standing still from moving time', () => {
    const points = [point(0, 0), point(10, 20), point(70, 20.1), point(80, 40)];
    const summary = summarizeRecording(points);
    expect(summary.activeSeconds).toBe(80);
    expect(summary.movingSeconds).toBeCloseTo(20, 0);
  });
});

describe('elevationGainLoss', () => {
  const withAlt = (alts: number[]) =>
    alts.map((alt, i) => point(i * 5, i * 10, { alt }));

  it('ignores jitter on a flat route', () => {
    const jitter = withAlt([10, 11, 9.5, 10.5, 9, 10.2, 9.8, 10.4, 9.6, 10]);
    const { gain, loss } = elevationGainLoss(jitter);
    expect(gain).toBe(0);
    expect(loss).toBe(0);
  });

  it('counts a real climb and descent', () => {
    const climb = withAlt([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 20, 18, 14, 10, 6, 2, 0, 0,
    ]);
    const { gain, loss } = elevationGainLoss(climb);
    expect(gain).toBeGreaterThan(14);
    expect(gain).toBeLessThan(22);
    expect(loss).toBeGreaterThan(14);
  });

  it('reports nothing without altitude', () => {
    expect(elevationGainLoss(steadyTrack(60, 3))).toEqual({ gain: 0, loss: 0 });
  });
});

describe('computeSplits', () => {
  it('cuts exact kilometres, interpolating between fixes', () => {
    // 4 m/s for 1100 s => 4.4 km.
    const splits = computeSplits(steadyTrack(1100, 4, 7), METERS_PER_KM);
    expect(splits).toHaveLength(5);
    expect(splits.slice(0, 4).every((s) => !s.partial)).toBe(true);
    for (const split of splits.slice(0, 4)) {
      expect(split.durationSeconds).toBeCloseTo(250, 0);
    }
    expect(splits[4].partial).toBe(true);
    expect(splits[4].distanceMeters).toBeCloseTo(400, -1);
  });

  it('drops a trailing sliver', () => {
    // 1020 m: 20 m remainder is under 5% of a km.
    const splits = computeSplits(steadyTrack(255, 4, 5), METERS_PER_KM);
    expect(splits).toHaveLength(1);
  });

  it('leaves a paused stretch out of a split duration', () => {
    const points: RecordedPoint[] = [];
    for (let s = 0; s <= 100; s += 5) points.push(point(s, s * 5));
    // 500 m so far; pause for 10 minutes, resume and carry on to ~1 km.
    for (let s = 0; s <= 100; s += 5) {
      points.push(point(700 + s, 500 + s * 5, { seg: 1 }));
    }
    const [first] = computeSplits(points, METERS_PER_KM);
    expect(first.durationSeconds).toBeCloseTo(200, 0);
  });

  it('returns nothing for a track too short to split', () => {
    expect(computeSplits([point(0, 0)], 1000)).toEqual([]);
  });

  it('exports splits as lap windows', () => {
    const laps = splitsToLapWindows(
      computeSplits(steadyTrack(600, 4, 5), 1000)
    );
    expect(laps).toHaveLength(3); // 2.4 km: two full km and a partial
    expect(laps[0].lap_index).toBe(1);
    expect(Date.parse(laps[0].end_time)).toBeLessThanOrEqual(
      Date.parse(laps[1].start_time) + 1
    );
  });
});

describe('toWorkoutGpsPoints', () => {
  it('writes ISO times, cumulative distance and only the sensors present', () => {
    const wire = toWorkoutGpsPoints([
      point(0, 0, { alt: 10, speed: 2 }),
      point(10, 20),
    ]);
    expect(wire[0]).toMatchObject({ lat: 51.5, alt: 10, speed: 2, dist: 0 });
    expect(wire[0].t).toBe('2026-10-06T10:00:00.000Z');
    expect(wire[1].dist).toBeCloseTo(20, 0);
    expect('alt' in wire[1]).toBe(false);
  });
});

describe('toWorkoutGpsPoints thinning', () => {
  it('thins a long track but keeps both ends and the full-path distance', () => {
    const track = steadyTrack(1000, 3, 1);
    const wire = toWorkoutGpsPoints(track, 100);
    expect(wire.length).toBeLessThanOrEqual(101);
    expect(wire.length).toBeGreaterThan(90);
    expect(wire[0].t).toBe(new Date(track[0].t).toISOString());
    expect(wire[wire.length - 1].t).toBe(
      new Date(track[track.length - 1].t).toISOString()
    );
    expect(wire[wire.length - 1].dist).toBeCloseTo(3000, -1);
  });
});

describe('formatting', () => {
  it('formats the clock', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('formats pace and falls back to a dash', () => {
    expect(formatPace(330)).toBe('5:30');
    expect(formatPace(null)).toBe('—');
    expect(formatPace(5000)).toBe('—');
  });
});

describe('computeLaps', () => {
  const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

  it('splits the recording at each mark and ends with a partial lap', () => {
    // 4 m/s for 300 s: marks at 100 s and 250 s.
    const laps = computeLaps(steadyTrack(300, 4, 5), [
      T0 + 100_000,
      T0 + 250_000,
    ]);
    expect(laps).toHaveLength(3);
    expect(laps.map((l) => Math.round(l.distanceMeters))).toEqual([
      400, 600, 200,
    ]);
    expect(laps.map((l) => Math.round(l.durationSeconds))).toEqual([
      100, 150, 50,
    ]);
    expect(laps.map((l) => l.partial)).toEqual([false, false, true]);
    expect(laps[1].startT).toBe(T0 + 100_000);
  });

  it('interpolates a mark that falls between two fixes', () => {
    const [first] = computeLaps(steadyTrack(100, 4, 10), [T0 + 33_000]);
    expect(first.distanceMeters).toBeCloseTo(132, 0);
    expect(first.durationSeconds).toBeCloseTo(33, 5);
  });

  it('does not count a pause into a lap', () => {
    const points = [
      ...steadyTrack(100, 4, 5),
      // Paused for 60 s, resumed 50 m on.
      ...[0, 5, 10].map((s) => point(160 + s, 400 + 50 + s * 4, { seg: 1 })),
    ];
    const [first, second] = computeLaps(points, [T0 + 130_000]);
    // The mark sits inside the pause, so the first lap ends where it began.
    expect(first.distanceMeters).toBeCloseTo(400, 0);
    expect(first.durationSeconds).toBeCloseTo(100, 5);
    expect(second.durationSeconds).toBeCloseTo(10, 5);
  });

  it('keeps a mark after the last fix up to the finish, without extra distance', () => {
    const track = steadyTrack(60, 4, 5);
    const end = track[track.length - 1].t;
    const mark = end + 10_000;
    const [lap] = computeLaps(track, [mark], mark + 5_000);

    expect(lap.endT).toBe(mark);
    expect(lap.distanceMeters).toBeCloseTo(240, 0);
    expect(lap.durationSeconds).toBeCloseTo(60, 0);
    expect(lap.partial).toBe(false);
  });

  it('ignores marks outside the recording and gives nothing for too few fixes', () => {
    expect(computeLaps([point(0, 0)], [T0 + 1000])).toEqual([]);
    const laps = computeLaps(steadyTrack(60, 4, 5), [T0 - 5000, T0 + 999_000]);
    expect(laps).toHaveLength(1);
  });
});

describe('splitBars', () => {
  const split = (
    index: number,
    seconds: number,
    partial = false
  ): Parameters<typeof splitBars>[0][number] => ({
    index,
    distanceMeters: partial ? 100 : 1000,
    durationSeconds: partial ? seconds : seconds,
    startT: 0,
    endT: 0,
    partial,
  });

  it('makes the fastest split full length and marks it', () => {
    const bars = splitBars([split(1, 330), split(2, 300), split(3, 360)], 1000);
    expect(bars[1]).toEqual({ fraction: 1, fastest: true });
    expect(bars[0].fastest).toBe(false);
    expect(bars[0].fraction).toBeCloseTo(300 / 330, 5);
    expect(bars[2].fraction).toBeCloseTo(300 / 360, 5);
  });

  it('never crowns a partial split', () => {
    const bars = splitBars([split(1, 300), split(2, 20, true)], 1000);
    expect(bars[0].fastest).toBe(true);
    expect(bars[1].fastest).toBe(false);
  });

  it('copes with nothing to compare', () => {
    expect(splitBars([], 1000)).toEqual([]);
    expect(splitBars([split(1, 20, true)], 1000)).toEqual([
      { fraction: 0, fastest: false },
    ]);
  });
});

describe('gpsSignalLevel', () => {
  const now = 100_000;
  it('grades the newest fix by its accuracy radius', () => {
    expect(gpsSignalLevel({ hacc: 5, t: now }, now)).toBe('good');
    expect(gpsSignalLevel({ hacc: 18, t: now }, now)).toBe('fair');
    expect(gpsSignalLevel({ hacc: 60, t: now }, now)).toBe('weak');
  });

  it('reads as no signal before a fix, with no accuracy, or when stale', () => {
    expect(gpsSignalLevel(null, now)).toBe('none');
    expect(gpsSignalLevel({ hacc: -1, t: now }, now)).toBe('none');
    expect(gpsSignalLevel({ hacc: 5, t: now - 16_000 }, now)).toBe('none');
  });
});
