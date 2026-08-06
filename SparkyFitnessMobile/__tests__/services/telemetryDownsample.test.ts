import {
  MAX_GPS_POINTS,
  MAX_SERIES_POINTS,
  downsampleGpsPoints,
  downsampleHrSamples,
  downsampleSeries,
  mergeSeriesIntoGpsPoints,
  seriesMax,
  seriesMean,
  type SeriesPoint,
} from '../../src/services/shared/telemetryDownsample';
import type {
  WorkoutGpsPoint,
  WorkoutHrSample,
} from '../../src/types/healthRecords';

const BASE_MS = Date.parse('2026-08-04T09:00:00.000Z');
const at = (seconds: number): string =>
  new Date(BASE_MS + seconds * 1000).toISOString();

describe('downsampleGpsPoints', () => {
  it('returns a short track unchanged', () => {
    const points: WorkoutGpsPoint[] = [
      { t: at(0), lat: 1, lon: 1 },
      { t: at(10), lat: 1.001, lon: 1 },
    ];
    expect(downsampleGpsPoints(points)).toHaveLength(2);
  });

  it('enforces the cap on a long track', () => {
    // A winding route stays above the cap at any sane simplify tolerance, so
    // the stride pass is what actually guarantees the ceiling.
    const points: WorkoutGpsPoint[] = Array.from({ length: 9000 }, (_, i) => ({
      t: at(i),
      lat: 37.7 + Math.sin(i / 5) * 0.01,
      lon: -122.4 + Math.cos(i / 5) * 0.01,
    }));
    expect(downsampleGpsPoints(points).length).toBeLessThanOrEqual(
      MAX_GPS_POINTS
    );
  });

  it('keeps the first and last point', () => {
    const points: WorkoutGpsPoint[] = Array.from({ length: 5000 }, (_, i) => ({
      t: at(i),
      lat: 37.7 + i * 0.0001,
      lon: -122.4,
    }));
    const result = downsampleGpsPoints(points);
    expect(result[0].t).toBe(points[0].t);
    expect(result[result.length - 1].t).toBe(points[points.length - 1].t);
  });

  it('sorts out-of-order points', () => {
    const points: WorkoutGpsPoint[] = [
      { t: at(10), lat: 1, lon: 1 },
      { t: at(0), lat: 2, lon: 2 },
    ];
    expect(downsampleGpsPoints(points).map((p) => p.t)).toEqual([
      at(0),
      at(10),
    ]);
  });

  it('handles an empty track', () => {
    expect(downsampleGpsPoints([])).toEqual([]);
  });
});

describe('downsampleSeries', () => {
  it('returns a short series unchanged', () => {
    const series: SeriesPoint[] = [
      { t: at(0), v: 100 },
      { t: at(10), v: 110 },
    ];
    expect(downsampleSeries(series)).toHaveLength(2);
  });

  it('enforces the cap', () => {
    const series: SeriesPoint[] = Array.from({ length: 7200 }, (_, i) => ({
      t: at(i),
      v: 100 + (i % 40),
    }));
    expect(downsampleSeries(series).length).toBeLessThanOrEqual(
      MAX_SERIES_POINTS
    );
  });

  it('averages within a bucket rather than sampling', () => {
    // Sampling every Nth reading would alias a spike in or out depending on
    // where it landed; averaging keeps the curve's shape. A lone spike in the
    // middle of a three-reading bucket surfaces as a partial-weight value:
    // sampling would either drop it (exactly 100) or keep it whole (exactly
    // 200).
    const series: SeriesPoint[] = Array.from({ length: 3000 }, (_, i) => ({
      t: at(i),
      v: i === 1501 ? 200 : 100,
    }));
    const result = downsampleSeries(series);
    const spiked = result.filter((point) => point.v !== 100);
    expect(spiked).toHaveLength(1);
    expect(spiked[0].v).toBeGreaterThan(100);
    expect(spiked[0].v).toBeLessThan(200);
  });

  it('caps the output when a reading lands on the final bucket boundary', () => {
    // 7201 readings across exactly 7200s bucket to 6s each, so the last one
    // falls on the boundary that opens bucket 1200 — one past the cap.
    const series: SeriesPoint[] = Array.from({ length: 7201 }, (_, i) => ({
      t: at(i),
      v: i === 7200 ? 500 : 100,
    }));
    const result = downsampleSeries(series);
    expect(result.length).toBeLessThanOrEqual(MAX_SERIES_POINTS);
    expect(result[0].t).toBe(at(0));
    // The boundary reading is folded into the last bucket rather than emitted
    // on its own, so the final value is a mean, not the raw 500.
    const last = result[result.length - 1];
    expect(last.v).toBeGreaterThan(100);
    expect(last.v).toBeLessThan(500);
  });

  it('drops malformed points', () => {
    const series = [
      { t: at(0), v: 100 },
      { t: 'nope', v: 120 },
      { t: at(10), v: Number.NaN },
    ] as SeriesPoint[];
    expect(downsampleSeries(series)).toEqual([{ t: at(0), v: 100 }]);
  });
});

describe('downsampleHrSamples', () => {
  it('rounds to whole bpm', () => {
    // Alternating 100/101 across three-reading buckets means every bucket
    // averages to a third of a bpm, so rounding is observable in the output.
    const samples: WorkoutHrSample[] = Array.from({ length: 3000 }, (_, i) => ({
      t: at(i),
      bpm: 100 + (i % 2),
    }));
    const unrounded = downsampleSeries(
      samples.map((s) => ({ t: s.t, v: s.bpm }))
    );
    expect(unrounded.some((point) => !Number.isInteger(point.v))).toBe(true);

    const result = downsampleHrSamples(samples);
    expect(result.length).toBeLessThanOrEqual(MAX_SERIES_POINTS);
    for (const sample of result) {
      expect(Number.isInteger(sample.bpm)).toBe(true);
    }
  });
});

describe('mergeSeriesIntoGpsPoints', () => {
  it('attaches a reading to the nearest point in time', () => {
    const points: WorkoutGpsPoint[] = [
      { t: at(0), lat: 1, lon: 1 },
      { t: at(10), lat: 1, lon: 1 },
    ];
    const merged = mergeSeriesIntoGpsPoints(points, {
      hr: [
        { t: at(1), v: 105 },
        { t: at(9), v: 130 },
      ],
    });
    expect(merged[0].hr).toBe(105);
    expect(merged[1].hr).toBe(130);
  });

  it('ignores a reading outside the merge tolerance', () => {
    const points: WorkoutGpsPoint[] = [{ t: at(0), lat: 1, lon: 1 }];
    const merged = mergeSeriesIntoGpsPoints(points, {
      hr: [{ t: at(60), v: 150 }],
    });
    expect(merged[0].hr).toBeUndefined();
  });

  it('keeps the first reading that lands on a point', () => {
    // A track coarser than the series maps several samples to one point; the
    // last writer would otherwise win arbitrarily.
    const points: WorkoutGpsPoint[] = [{ t: at(0), lat: 1, lon: 1 }];
    const merged = mergeSeriesIntoGpsPoints(points, {
      hr: [
        { t: at(0), v: 100 },
        { t: at(1), v: 180 },
      ],
    });
    expect(merged[0].hr).toBe(100);
  });

  it('does not mutate the input points', () => {
    const points: WorkoutGpsPoint[] = [{ t: at(0), lat: 1, lon: 1 }];
    mergeSeriesIntoGpsPoints(points, { hr: [{ t: at(0), v: 120 }] });
    expect(points[0].hr).toBeUndefined();
  });

  it('rounds heart rate but leaves other series at full precision', () => {
    const points: WorkoutGpsPoint[] = [{ t: at(0), lat: 1, lon: 1 }];
    const merged = mergeSeriesIntoGpsPoints(points, {
      hr: [{ t: at(0), v: 120.6 }],
      speed: [{ t: at(0), v: 1.234 }],
    });
    expect(merged[0].hr).toBe(121);
    expect(merged[0].speed).toBeCloseTo(1.234);
  });

  it('handles an empty track', () => {
    expect(mergeSeriesIntoGpsPoints([], { hr: [{ t: at(0), v: 1 }] })).toEqual(
      []
    );
  });
});

describe('seriesMean / seriesMax', () => {
  it('returns null for an empty series', () => {
    expect(seriesMean([])).toBeNull();
    expect(seriesMax([])).toBeNull();
  });

  it('computes the statistics', () => {
    const series: SeriesPoint[] = [
      { t: at(0), v: 100 },
      { t: at(1), v: 200 },
    ];
    expect(seriesMean(series)).toBe(150);
    expect(seriesMax(series)).toBe(200);
  });
});
