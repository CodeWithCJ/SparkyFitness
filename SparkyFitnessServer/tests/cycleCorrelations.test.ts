import { describe, expect, it } from 'vitest';
import {
  correlateMetricWithPhase,
  coachingForPhase,
  detectConditionFlags,
  articlesForMode,
  featuredArticle,
  articleBySlug,
  deriveCycles,
  computeCycleStats,
  predictNextCycles,
  type DayEvidence,
  type MetricPoint,
  type SharedCycleSettings,
} from '@workspace/shared';

const settings = {
  avg_cycle_length_override: null,
  avg_period_length_override: null,
  luteal_phase_length: 14,
  birth_control_method: 'none',
  show_fertile_window: true,
  mode: 'standard' as const,
} as SharedCycleSettings;

function addDaysLocal(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function textbook(starts: string[]): DayEvidence[] {
  const ev: DayEvidence[] = [];
  for (const start of starts) {
    for (let d = 0; d < 5; d++) {
      ev.push({ date: addDaysLocal(start, d), flow_level: 'medium' });
    }
  }
  return ev;
}

describe('correlateMetricWithPhase', () => {
  const cycles = deriveCycles(
    textbook(['2026-01-01', '2026-01-29', '2026-02-26'])
  );
  const stats = computeCycleStats(cycles);
  const prediction = predictNextCycles(stats, '2026-02-26', settings, 3);

  it('buckets values by phase and finds the peak', () => {
    // Higher "weight" during menstrual days (days 1-5 of each cycle).
    const points: MetricPoint[] = [];
    for (const start of ['2026-01-01', '2026-01-29']) {
      for (let d = 0; d < 5; d++) {
        points.push({ date: addDaysLocal(start, d), value: 62 }); // menstrual
      }
      for (let d = 8; d < 13; d++) {
        points.push({ date: addDaysLocal(start, d), value: 60 }); // follicular
      }
    }
    const result = correlateMetricWithPhase(
      'weight',
      points,
      cycles,
      prediction
    );
    expect(result.sampleSize).toBe(20);
    expect(result.hasEnoughData).toBe(true);
    expect(result.peakPhase).toBe('menstrual');
    expect(result.peakDelta).toBeGreaterThan(0);
  });

  it('reports not-enough-data for sparse input', () => {
    const result = correlateMetricWithPhase(
      'mood',
      [{ date: '2026-01-02', value: 3 }],
      cycles,
      prediction
    );
    expect(result.hasEnoughData).toBe(false);
  });
});

describe('coachingForPhase', () => {
  it('returns a population-default tip when no correlation', () => {
    const tip = coachingForPhase('luteal', []);
    expect(tip?.personalized).toBe(false);
    expect(tip?.key).toContain('luteal');
  });
  it('returns null for unknown phase', () => {
    expect(coachingForPhase('unknown', [])).toBeNull();
  });
});

describe('detectConditionFlags', () => {
  it('flags consistently long cycles', () => {
    const cycles = deriveCycles(
      textbook(['2026-01-01', '2026-02-10', '2026-03-22', '2026-05-01'])
    );
    const stats = computeCycleStats(cycles);
    const flags = detectConditionFlags(cycles, stats);
    expect(flags.some((f) => f.key === 'long_cycles')).toBe(true);
  });
  it('returns nothing with too little data', () => {
    const cycles = deriveCycles(textbook(['2026-01-01']));
    expect(detectConditionFlags(cycles, computeCycleStats(cycles))).toEqual([]);
  });
});

describe('content library', () => {
  it('filters articles by mode and includes basics', () => {
    const ttc = articlesForMode('ttc');
    expect(ttc.some((a) => a.tags.includes('ttc'))).toBe(true);
    expect(featuredArticle('pregnant').tags).toContain('pregnant');
  });
  it('looks up an article by slug', () => {
    expect(articleBySlug('reading-your-bbt')?.title).toContain('temperature');
    expect(articleBySlug('nope')).toBeNull();
  });
});
