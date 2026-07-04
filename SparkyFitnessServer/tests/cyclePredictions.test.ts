import { describe, expect, it } from 'vitest';
import {
  deriveCycles,
  computeCycleStats,
  predictNextCycles,
  phaseForDay,
  latePeriodStatus,
  daysBetween,
  isPeriodDay,
  selectDailyInsight,
  type DayEvidence,
  type SharedCycleSettings,
} from '@workspace/shared';

const baseSettings: Pick<
  SharedCycleSettings,
  | 'avg_cycle_length_override'
  | 'avg_period_length_override'
  | 'luteal_phase_length'
  | 'birth_control_method'
  | 'show_fertile_window'
  | 'mode'
> = {
  avg_cycle_length_override: null,
  avg_period_length_override: null,
  luteal_phase_length: 14,
  birth_control_method: 'none',
  show_fertile_window: true,
  mode: 'standard',
};

/** Build a textbook 28-day history: 5-day periods starting each cycle. */
function textbookEvidence(starts: string[]): DayEvidence[] {
  const ev: DayEvidence[] = [];
  for (const start of starts) {
    for (let d = 0; d < 5; d++) {
      ev.push({
        date: addDaysLocal(start, d),
        flow_level: d === 0 ? 'medium' : 'light',
      });
    }
  }
  return ev;
}

function addDaysLocal(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1); // 2026 not leap
  });
});

describe('isPeriodDay', () => {
  it('treats bleed flow as evidence', () => {
    expect(isPeriodDay({ date: '2026-01-01', flow_level: 'light' })).toBe(true);
    expect(isPeriodDay({ date: '2026-01-01', flow_level: 'none' })).toBe(false);
  });
  it('treats any product use as evidence even without flow', () => {
    expect(isPeriodDay({ date: '2026-01-01', product_usage: { pad: 2 } })).toBe(
      true
    );
    expect(isPeriodDay({ date: '2026-01-01', product_usage: { pad: 0 } })).toBe(
      false
    );
  });
});

describe('deriveCycles', () => {
  it('groups a textbook 28-day history into cycles', () => {
    const ev = textbookEvidence(['2026-01-01', '2026-01-29', '2026-02-26']);
    const cycles = deriveCycles(ev);
    expect(cycles).toHaveLength(3);
    expect(cycles[0]!.start_date).toBe('2026-01-01');
    expect(cycles[0]!.period_length).toBe(5);
    expect(cycles[0]!.cycle_length).toBe(28);
    expect(cycles[1]!.cycle_length).toBe(28);
    expect(cycles[2]!.cycle_length).toBeNull(); // current, open cycle
  });

  it('tolerates a single skipped day inside a period', () => {
    const ev: DayEvidence[] = [
      { date: '2026-01-01', flow_level: 'medium' },
      { date: '2026-01-02', flow_level: 'light' },
      // 2026-01-03 skipped (forgot to log)
      { date: '2026-01-04', flow_level: 'light' },
    ];
    const cycles = deriveCycles(ev);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.period_length).toBe(4);
  });

  it('handles product-only period evidence', () => {
    const ev: DayEvidence[] = [
      { date: '2026-01-01', product_usage: { tampon: 3 } },
      { date: '2026-01-02', product_usage: { tampon: 2 } },
      { date: '2026-01-29', flow_level: 'medium' },
    ];
    const cycles = deriveCycles(ev);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]!.cycle_length).toBe(28);
  });
});

describe('computeCycleStats', () => {
  it('reports regular for consistent cycles', () => {
    const cycles = deriveCycles(
      textbookEvidence(['2026-01-01', '2026-01-29', '2026-02-26', '2026-03-26'])
    );
    const stats = computeCycleStats(cycles);
    expect(stats.avgCycleLength).toBe(28);
    expect(stats.regularity).toBe('regular');
    expect(stats.sampleSize).toBe(3);
  });

  it('flags irregular for scattered cycles', () => {
    const cycles = deriveCycles(
      textbookEvidence(['2026-01-01', '2026-01-22', '2026-03-05', '2026-03-30'])
    );
    const stats = computeCycleStats(cycles);
    expect(stats.regularity).toBe('irregular');
  });
});

describe('predictNextCycles', () => {
  it('predicts the next period ~28 days out with ovulation', () => {
    const cycles = deriveCycles(
      textbookEvidence(['2026-01-01', '2026-01-29', '2026-02-26'])
    );
    const stats = computeCycleStats(cycles);
    const pred = predictNextCycles(stats, '2026-02-26', baseSettings, 3);
    expect(pred.cycles).toHaveLength(3);
    expect(pred.cycles[0]!.periodStart).toBe('2026-03-26');
    expect(pred.cycles[0]!.ovulation).toBe('2026-03-12'); // start - 14
    expect(pred.cycles[0]!.fertileStart).toBe('2026-03-07');
    expect(pred.cycles[0]!.fertileEnd).toBe('2026-03-13');
    expect(pred.basis).toBe('history');
  });

  it('suppresses fertility for hormonal birth control', () => {
    const cycles = deriveCycles(textbookEvidence(['2026-01-01', '2026-01-29']));
    const stats = computeCycleStats(cycles);
    const pred = predictNextCycles(
      stats,
      '2026-01-29',
      { ...baseSettings, birth_control_method: 'pill' },
      1
    );
    expect(pred.cycles[0]!.ovulation).toBeNull();
    expect(pred.cycles[0]!.fertileStart).toBeNull();
    expect(pred.basis).toBe('bc-bleed');
  });

  it('honors cycle-length override', () => {
    const stats = computeCycleStats([]);
    const pred = predictNextCycles(
      stats,
      '2026-01-01',
      { ...baseSettings, avg_cycle_length_override: 30 },
      1
    );
    expect(pred.cycles[0]!.periodStart).toBe('2026-01-31');
  });
});

describe('phaseForDay', () => {
  it('reports menstrual during the period', () => {
    const cycles = deriveCycles(textbookEvidence(['2026-01-01', '2026-01-29']));
    const stats = computeCycleStats(cycles);
    const pred = predictNextCycles(stats, '2026-01-29', baseSettings, 3);
    expect(phaseForDay('2026-01-30', cycles, pred).phase).toBe('menstrual');
    expect(phaseForDay('2026-01-30', cycles, pred).cycleDay).toBe(2);
  });
});

describe('latePeriodStatus', () => {
  it('detects a late period', () => {
    const cycles = deriveCycles(textbookEvidence(['2026-01-01', '2026-01-29']));
    const stats = computeCycleStats(cycles);
    const pred = predictNextCycles(stats, '2026-01-29', baseSettings, 3);
    // next predicted start is 2026-02-26; three days later:
    const late = latePeriodStatus('2026-03-01', pred);
    expect(late.isLate).toBe(true);
    expect(late.daysLate).toBe(3);
  });
});

describe('selectDailyInsight', () => {
  it('is deterministic per day and returns a key', () => {
    const a = selectDailyInsight('2026-03-01', 'luteal', { mode: 'standard' });
    const b = selectDailyInsight('2026-03-01', 'luteal', { mode: 'standard' });
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
  });
});
