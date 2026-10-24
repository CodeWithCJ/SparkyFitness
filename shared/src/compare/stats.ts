// Statistics for deciding whether two daily series are linked. Pure and dependency-free.

export const Z_95 = 1.959963984540054;
/** The significance level: a finding needs p below it. */
export const ALPHA = 0.05;

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const v of xs) sum += v;
  return sum / xs.length;
}

/** Sample standard deviation (n - 1); null when there are fewer than 2 values. */
export function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  return Math.sqrt(sampleVariance(xs));
}

function sampleVariance(xs: readonly number[]): number {
  const m = mean(xs);
  let ss = 0;
  for (const v of xs) ss += (v - m) ** 2;
  return ss / (xs.length - 1);
}

/** 1-based ranks, with tied values sharing their average rank. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1]!] === xs[order[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!] = avg;
    i = j + 1;
  }
  return out;
}

/** Pearson r; null when n < 3, the lengths differ, or either series is constant. */
export function pearson(
  x: readonly number[],
  y: readonly number[]
): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** Spearman rho: Pearson on average ranks. */
export function spearman(
  x: readonly number[],
  y: readonly number[]
): number | null {
  return pearson(ranks(x), ranks(y));
}

/** Lag-k autocorrelation (the standard estimator: lagged products over the whole sum of squares); 0 when there are fewer than k + 2 values or the series is constant. */
export function autocorrelation(xs: readonly number[], k: number): number {
  const n = xs.length;
  if (k < 1 || n < k + 2) return 0;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    den += (xs[t]! - m) ** 2;
    if (t + k < n) num += (xs[t]! - m) * (xs[t + k]! - m);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Effective sample size of two paired series whose days carry over into later days:
 * n / (1 + 2·Σ ρa(k)·ρb(k)) over lags k = 1..K, K = min(maxLag, ⌊n/4⌋) and at least 1 (a
 * truncated Bartlett sum). Between 4 and n: a negative sum never raises it above n.
 */
export function effectiveNMultiLag(
  a: readonly number[],
  b: readonly number[],
  maxLag: number
): number {
  const n = a.length;
  const lags = Math.max(1, Math.min(maxLag, Math.floor(n / 4)));
  let sum = 0;
  for (let k = 1; k <= lags; k++) {
    sum += autocorrelation(a, k) * autocorrelation(b, k);
  }
  const inflation = Math.max(1, 1 + 2 * sum);
  return Math.max(4, Math.min(n, n / inflation));
}

/** Effective n from lag 1 alone: n(1 − ρa·ρb)/(1 + ρa·ρb), each ρ clamped at 0 or above; between 4 and n. */
function effectiveNLag1(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const clamp = (r: number) => Math.min(Math.max(r, 0), 1 - 1e-9);
  const prod = clamp(autocorrelation(a, 1)) * clamp(autocorrelation(b, 1));
  return Math.max(4, Math.min(n, (n * (1 - prod)) / (1 + prod)));
}

/**
 * The effective n every comparison uses: the smaller of the lag-1 count and the multi-lag
 * (Bartlett) count, between 4 and n. Lag 1 alone misses carry-over beyond yesterday over long
 * spans; the multi-lag sum under-corrects over short ones, where its far lags are noisy. The
 * smaller is never looser than either.
 */
export function cautiousEffectiveN(
  a: readonly number[],
  b: readonly number[],
  maxLag: number
): number {
  return Math.min(effectiveNLag1(a, b), effectiveNMultiLag(a, b, maxLag));
}

function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zz = z - 1;
  let a = c[0]!;
  const t = zz + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (zz + i);
  return (
    0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

// Continued fraction for the incomplete beta function (modified Lentz).
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b).
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Two-sided p-value of Student's t; df may be fractional. */
export function tTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

/** The t value whose two-sided p-value is 0.05. */
export function tCritical95(df: number): number {
  let low = 0;
  let high = 1;
  while (tTwoSidedP(high, df) > 0.05 && high < 1e9) high *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (tTwoSidedP(mid, df) > 0.05) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** p-value and 95% range for a correlation r given an effective sample size. */
export function correlationTest(
  r: number,
  nEff: number
): { p: number; low: number; high: number } {
  if (Math.abs(r) >= 1) return { p: 0, low: r, high: r };
  const df = nEff - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  const p = df > 0 ? tTwoSidedP(t, df) : 1;
  if (nEff <= 3) return { p, low: -1, high: 1 };
  const z = Math.atanh(r);
  const half = Z_95 / Math.sqrt(nEff - 3);
  return { p, low: Math.tanh(z - half), high: Math.tanh(z + half) };
}

/** A finding only when p < 0.05 and the 95% range leaves out 0: at a small effective n the two can disagree. */
export function isSignificant(test: {
  p: number;
  low: number;
  high: number;
}): boolean {
  return test.p < ALPHA && (test.low > 0 || test.high < 0);
}

/** Welch's t-test where each group's variance is divided by its effective n. */
export function welch(
  a: readonly number[],
  b: readonly number[],
  nEffA: number,
  nEffB: number
): {
  diff: number;
  se: number;
  df: number;
  p: number;
  low: number;
  high: number;
} {
  const diff = mean(a) - mean(b);
  const va = (sampleSd(a) ?? NaN) ** 2 / nEffA;
  const vb = (sampleSd(b) ?? NaN) ** 2 / nEffB;
  const se = Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (nEffA - 1) + vb ** 2 / (nEffB - 1));
  if (se === 0) {
    return { diff, se, df, p: diff === 0 ? 1 : 0, low: diff, high: diff };
  }
  const p = tTwoSidedP(diff / se, df);
  const margin = tCritical95(df) * se;
  return { diff, se, df, p, low: diff - margin, high: diff + margin };
}

/** The p-th quantile (p in [0, 1]) by linear interpolation between closest ranks, like numpy's default; null for an empty array. Sorts a copy. */
export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const h = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/**
 * How many independent days a single series' mean is worth: the smaller of the lag-1 count,
 * n(1 − ρ)/(1 + ρ), and the multi-lag (Bartlett) count, n / (1 + 2·Σ ρ(k)) over lags
 * k = 1..K, K = min(maxLag, ⌊n/4⌋) and at least 1. Between 2 and n (n itself below 2 values).
 * The single-series form of cautiousEffectiveN: carried-over days must not look like new ones.
 */
export function cautiousEffectiveNForMean(
  xs: readonly number[],
  maxLag: number
): number {
  const n = xs.length;
  if (n < 2) return n;
  const rho = Math.min(Math.max(autocorrelation(xs, 1), 0), 1 - 1e-9);
  const lag1 = (n * (1 - rho)) / (1 + rho);
  const lags = Math.max(1, Math.min(maxLag, Math.floor(n / 4)));
  let sum = 0;
  for (let k = 1; k <= lags; k++) sum += autocorrelation(xs, k);
  const multiLag = n / Math.max(1, 1 + 2 * sum);
  return Math.max(2, Math.min(n, lag1, multiLag));
}

/**
 * A stricter count of independent days for a slow-moving series' mean: the smaller of the cautious
 * count, the series length, and the lag-1 count n(1 − ρ)/(1 + ρ) with ρ corrected for Kendall's
 * small-sample bias of the lag-1 autocorrelation, E[ρ̂] ≈ ρ − (1 + 3ρ)/n, so ρ ≈ ρ̂ + (1 + 3ρ̂)/n,
 * held to 0..0.999. The uncorrected estimate reads a persistent series as less persistent than it is.
 * Between 2 and n (n itself below 2 values).
 */
export function biasCorrectedEffectiveNForMean(
  xs: readonly number[],
  maxLag: number
): number {
  const n = xs.length;
  if (n < 2) return n;
  const rhoHat = autocorrelation(xs, 1);
  const rho = Math.min(Math.max(rhoHat + (1 + 3 * rhoHat) / n, 0), 0.999);
  const biasCorrected = (n * (1 - rho)) / (1 + rho);
  return Math.max(
    2,
    Math.min(n, cautiousEffectiveNForMean(xs, maxLag), biasCorrected)
  );
}

/** Ordinary least squares of y on x: the slope and its textbook standard error, sqrt((SSR/(n−2))/Sxx). Null with fewer than 3 points or no spread in x. */
export function olsSlope(
  xs: readonly number[],
  ys: readonly number[]
): { slope: number; se: number; n: number } | null {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    ssr += (ys[i]! - intercept - slope * xs[i]!) ** 2;
  }
  return { slope, se: Math.sqrt(ssr / (n - 2) / sxx), n };
}
