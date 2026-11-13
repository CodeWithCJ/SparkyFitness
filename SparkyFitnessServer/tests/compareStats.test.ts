import { describe, expect, test } from 'vitest';
import {
  autocorrelation,
  biasCorrectedEffectiveNForMean,
  cautiousEffectiveN,
  correlationTest,
  cautiousEffectiveNForMean,
  effectiveNMultiLag,
  olsSlope,
  pearson,
  percentile,
  spearman,
  tCritical95,
  tTwoSidedP,
  welch,
} from '@workspace/shared';
import { normal } from './helpers/seededRandom.js';

const noiseAt = (i: number) => {
  const v = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return v - Math.floor(v) - 0.5;
};

describe('compare stats', () => {
  const x = [
    7.1, 6.2, 8.0, 5.5, 7.4, 6.8, 7.9, 6.0, 7.2, 6.5, 8.1, 5.9, 7.0, 6.6,
  ];
  const y = [
    3.4, 2.9, 4.1, 2.5, 3.6, 3.1, 4.0, 3.0, 3.2, 3.3, 4.2, 2.7, 3.5, 2.8,
  ];

  test('pearson matches scipy', () =>
    expect(pearson(x, y)).toBeCloseTo(0.9448529633, 9));

  test('spearman uses average ranks for ties (matches scipy)', () =>
    expect(
      spearman(
        [3, 4, 2, 5, 3, 4, 1, 2, 5, 3, 4, 2],
        [2, 4, 2, 5, 3, 3, 1, 1, 4, 3, 5, 2]
      )
    ).toBeCloseTo(0.9087651764, 9));

  test('pearson is null for constant or too-short input', () => {
    expect(pearson([3, 3, 3, 3], [1, 2, 3, 4])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  test.each([
    [2.228138851986, 10, 0.05],
    [2.0, 7.5, 0.0828969952982],
    [0.5, 3.2, 0.649450178013],
    [4.0, 25, 0.000495443670532],
  ])('two-sided t p-value t=%s df=%s', (t, df, p) =>
    expect(tTwoSidedP(t, df)).toBeCloseTo(p, 8)
  );

  test('tCritical95 inverts the p-value', () =>
    expect(tCritical95(10)).toBeCloseTo(2.228138851986, 6));

  test('Fisher range with an effective n', () => {
    const r1 = correlationTest(0.41, 41);
    expect(r1.low).toBeCloseTo(0.1171230711, 8);
    expect(r1.high).toBeCloseTo(0.6372676211, 8);
    const r2 = correlationTest(0.6, 10.5);
    expect(r2.low).toBeCloseTo(-0.0225266654, 8);
    expect(r2.high).toBeCloseTo(0.8872443219, 8);
  });

  test('correlationTest collapses at a perfect correlation', () => {
    expect(correlationTest(1, 20)).toEqual({ p: 0, low: 1, high: 1 });
  });

  test('welch with nEff equal to n matches scipy', () => {
    const g1 = [7.2, 6.8, 7.5, 8.0, 6.9, 7.7, 7.1];
    const g2 = [6.1, 6.5, 5.9, 6.8, 6.0, 6.4, 5.8, 6.3];
    const w = welch(g1, g2, 7, 8);
    expect(w.diff).toBeCloseTo(1.0892857143, 9);
    expect(w.se).toBeCloseTo(0.203821901, 9);
    expect(w.df).toBeCloseTo(11.2481870759, 8);
    expect(w.p).toBeCloseTo(0.0002185646084, 10);
  });

  test('welch widens the error when days resemble each other', () => {
    const g1 = [7.2, 6.8, 7.5, 8.0, 6.9, 7.7, 7.1];
    const g2 = [6.1, 6.5, 5.9, 6.8, 6.0, 6.4, 5.8, 6.3];
    const w = welch(g1, g2, 3.5, 4);
    expect(w.se).toBeCloseTo(0.203821901 * Math.SQRT2, 9);
    expect(w.p).toBeGreaterThan(0.0002185646084);
  });

  test('lag-k autocorrelation (standard estimator)', () => {
    const series = [1, 2, 2.5, 2, 3, 3.5, 3, 4];
    expect(autocorrelation(series, 1)).toBeCloseTo(0.3308823529, 9);
    expect(autocorrelation(series, 2)).toBeCloseTo(0.2107843137, 9);
    expect(autocorrelation(series, 3)).toBeCloseTo(0.1495098039, 9);
    // Too short for the lag, or never varying.
    expect(autocorrelation([1, 2], 1)).toBe(0);
    expect(autocorrelation(series, 7)).toBe(0);
    expect(autocorrelation([3, 3, 3, 3], 1)).toBe(0);
  });

  describe('effective n over several lags', () => {
    // Two slow waves that move together; their lag-3 and lag-4 autocorrelations are negative
    // in both, so those products still add to the carry-over.
    const a = [
      1.0, 1.4, 1.9, 1.7, 1.2, 0.8, 0.5, 0.9, 1.3, 1.8, 2.1, 1.6, 1.1, 0.7, 0.6,
      1.0,
    ];
    const b = [
      3.0, 3.3, 3.9, 3.6, 3.1, 2.7, 2.5, 2.8, 3.4, 3.7, 4.0, 3.5, 3.2, 2.6, 2.7,
      3.1,
    ];

    test('n / (1 + 2 Σ ρa(k)·ρb(k)) up to min(maxLag, n/4) lags', () => {
      // 16 values: 4 lags; Σ = 1.3200103275.
      expect(effectiveNMultiLag(a, b, 14)).toBeCloseTo(4.3955794531, 9);
      // maxLag 2 stops at lag 2; Σ = 0.3957854271.
      expect(effectiveNMultiLag(a, b, 2)).toBeCloseTo(8.9307101436, 9);
    });

    test('unrelated day-to-day noise keeps nearly every day', () => {
      // A fixed scramble: no carry-over from one value to the next.
      const noise = (seed: number) =>
        Array.from({ length: 200 }, (_, i) => {
          const x = Math.sin((i + 1) * seed * 12.9898) * 43758.5453;
          return x - Math.floor(x) - 0.5;
        });
      const n = effectiveNMultiLag(noise(1), noise(2), 14);
      expect(n).toBeGreaterThan(180);
      expect(n).toBeLessThanOrEqual(200);
    });

    test('a negative sum never raises it above n', () => {
      // ρa(1) = −0.875 and ρb(1) = 0.625: 1 + 2Σ is below 0.
      expect(
        effectiveNMultiLag(
          [1, -1, 1, -1, 1, -1, 1, -1],
          [1, 2, 3, 4, 5, 6, 7, 8],
          1
        )
      ).toBe(8);
    });

    test('floors at 4', () => {
      // Five values, one lag: ρ(1) = 0.4 in both, 5 / 1.32 = 3.79.
      expect(effectiveNMultiLag([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 14)).toBe(4);
    });

    test('the cautious count is the smaller of the lag-1 and the multi-lag counts', () => {
      // Lag 1 alone: ρa(1) = 0.6420774648, ρb(1) = 0.6097206193, n(1 − ρaρb)/(1 + ρaρb) = 6.9969665574.
      // Four lags carry over more (4.3955794531); two lags carry over less (8.9307101436).
      expect(cautiousEffectiveN(a, b, 14)).toBeCloseTo(4.3955794531, 9);
      expect(cautiousEffectiveN(a, b, 2)).toBeCloseTo(6.9969665574, 9);
      // Both are n when the carry-over is negative, and both floor at 4.
      expect(
        cautiousEffectiveN(
          [1, -1, 1, -1, 1, -1, 1, -1],
          [1, 2, 3, 4, 5, 6, 7, 8],
          1
        )
      ).toBe(8);
      expect(cautiousEffectiveN([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 14)).toBe(4);
    });
  });
});

describe('single-series statistics', () => {
  describe('percentile', () => {
    const oneToTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    test('interpolates linearly between closest ranks, like numpy', () => {
      // numpy.percentile(range(1, 11), [10, 90]) = [1.9, 9.1]
      expect(percentile(oneToTen, 0.1)).toBeCloseTo(1.9, 12);
      expect(percentile(oneToTen, 0.9)).toBeCloseTo(9.1, 12);
      expect(percentile(oneToTen, 0)).toBe(1);
      expect(percentile(oneToTen, 1)).toBe(10);
    });

    test('sorts a copy and leaves the input alone', () => {
      const xs = [3, 1, 2];
      expect(percentile(xs, 0.5)).toBe(2);
      expect(xs).toEqual([3, 1, 2]);
    });

    test('null for an empty array', () => {
      expect(percentile([], 0.5)).toBeNull();
    });
  });

  describe('biasCorrectedEffectiveNForMean', () => {
    const alternating = Array.from({ length: 40 }, (_, i) =>
      i % 2 === 0 ? 1 : -1
    );
    const ramp = Array.from({ length: 40 }, (_, i) => i);
    const white = Array.from({ length: 120 }, (_, i) => noiseAt(i * 7919));

    test.each([
      ['alternating', alternating],
      ['a linear ramp', ramp],
      ['white noise', white],
    ])('is never above the cautious estimate: %s', (_name, xs) => {
      expect(biasCorrectedEffectiveNForMean(xs, 14)).toBeLessThanOrEqual(
        cautiousEffectiveNForMean(xs, 14)
      );
    });

    // Calibration: over 2000 AR(0.98) series of 120 on other seeds (10001 to 12000) the corrected
    // count was never above the cautious one, and the mean of corrected over cautious was 0.708
    // (means of 100 series ranged 0.680 to 0.737). The bound of 0.8 sits above that range.
    test('is smaller on average for a near-unit-root series', () => {
      let total = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const z = normal(seed);
        let level = 0;
        const ar = Array.from({ length: 120 }, () => {
          level = 0.98 * level + z();
          return level;
        });
        const cautious = cautiousEffectiveNForMean(ar, 14);
        const corrected = biasCorrectedEffectiveNForMean(ar, 14);
        expect(corrected).toBeLessThanOrEqual(cautious);
        total += corrected / cautious;
      }
      expect(total / 100).toBeLessThan(0.8);
    });

    // By hand, for [1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7] (n = 12, mean 43/12). Times 12 the deviations
    // are -31, -19, -31, -7, -19, 5, -7, 17, 5, 29, 17, 41: their squares sum to 5892 and their
    // neighbouring products to 2699, so the lag-1 autocorrelation is 2699/5892 = 0.45808. The bias
    // correction gives rho = 0.45808 + (1 + 3 x 0.45808)/12 = 0.65593, so n(1 - rho)/(1 + rho) =
    // 12 x 0.34407/1.65593 = 2.4934, which is below both 12 and the cautious count (3.6415).
    test('matches the closed form on a small series', () => {
      const xs = [1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7];
      const rhoHat = 2699 / 5892;
      const rho = rhoHat + (1 + 3 * rhoHat) / 12;
      const expected = (12 * (1 - rho)) / (1 + rho);
      expect(expected).toBeCloseTo(2.4934, 4);
      expect(biasCorrectedEffectiveNForMean(xs, 14)).toBeCloseTo(expected, 9);
    });

    test('is the series length for a single value and 2 for two values', () => {
      expect(biasCorrectedEffectiveNForMean([5], 3)).toBe(1);
      expect(biasCorrectedEffectiveNForMean([1, 2], 3)).toBe(2);
    });

    test('is finite for a constant series', () => {
      const n = biasCorrectedEffectiveNForMean([4, 4, 4, 4, 4, 4], 3);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    });
  });

  describe('cautiousEffectiveNForMean', () => {
    // A seeded AR(0.7) series: x[t] = 0.7·x[t−1] + noise.
    const ar = Array.from({ length: 120 }, (_, i) => i).reduce<number[]>(
      (acc, i) => {
        acc.push(0.7 * (acc[i - 1] ?? 0) + noiseAt(i));
        return acc;
      },
      []
    );

    test('iid-like noise keeps nearly every day', () => {
      const noise = Array.from({ length: 200 }, (_, i) => noiseAt(i * 7919));
      const n = cautiousEffectiveNForMean(noise, 14);
      expect(n).toBeGreaterThan(150);
      expect(n).toBeLessThanOrEqual(200);
    });

    test('a carried-over series is the smaller of the lag-1 and multi-lag counts', () => {
      const n = ar.length;
      const rho1 = Math.min(Math.max(autocorrelation(ar, 1), 0), 1 - 1e-9);
      const lag1 = (n * (1 - rho1)) / (1 + rho1);
      const lags = Math.max(1, Math.min(14, Math.floor(n / 4)));
      let sum = 0;
      for (let k = 1; k <= lags; k++) sum += autocorrelation(ar, k);
      const multi = n / Math.max(1, 1 + 2 * sum);
      const got = cautiousEffectiveNForMean(ar, 14);
      expect(got).toBeLessThan(n);
      expect(got).toBeCloseTo(Math.min(lag1, multi), 9);
    });

    test('stays between 2 and n', () => {
      const ramp = Array.from({ length: 30 }, (_, i) => i);
      expect(cautiousEffectiveNForMean(ramp, 14)).toBe(2);
      expect(cautiousEffectiveNForMean([1, -1, 1, -1, 1, -1, 1, -1], 3)).toBe(
        8
      );
      expect(cautiousEffectiveNForMean([5], 3)).toBe(1);
    });
  });

  describe('olsSlope', () => {
    test('an exact line has slope 2 and no standard error', () => {
      const fit = olsSlope([1, 2, 3, 4], [3, 5, 7, 9]);
      expect(fit?.slope).toBeCloseTo(2, 12);
      expect(fit?.se).toBeCloseTo(0, 12);
      expect(fit?.n).toBe(4);
    });

    test('matches scipy.stats.linregress on a noisy line', () => {
      // linregress(1..8, [2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.2, 15.8])
      const fit = olsSlope(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.2, 15.8]
      );
      expect(fit?.slope).toBeCloseTo(1.9880952380952381, 12);
      expect(fit?.se).toBeCloseTo(0.03267490293688715, 12);
      expect(fit?.n).toBe(8);
    });

    test('null with fewer than 3 points or no spread in x', () => {
      expect(olsSlope([1, 2], [1, 2])).toBeNull();
      expect(olsSlope([4, 4, 4], [1, 2, 3])).toBeNull();
    });
  });
});
