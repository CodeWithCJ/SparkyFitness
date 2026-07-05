import { describe, expect, it } from 'vitest';
import {
  detectBiphasicShift,
  estimateOvulation,
  dpo,
  type DerivedCycle,
  type SharedCycleDailyLog,
  type SharedCycleSettings,
} from '@workspace/shared';

describe('detectBiphasicShift', () => {
  it('identifies standard 3-over-6 shift and coverline', () => {
    // 6 low temps (around 36.2), followed by a shift above coverline (e.g. 36.6, 36.7, 36.6)
    const series = [
      { date: '2026-03-01', bbt: 36.2 },
      { date: '2026-03-02', bbt: 36.1 },
      { date: '2026-03-03', bbt: 36.3 },
      { date: '2026-03-04', bbt: 36.2 },
      { date: '2026-03-05', bbt: 36.1 },
      { date: '2026-03-06', bbt: 36.2 },
      { date: '2026-03-07', bbt: 36.6 }, // Day 1 above coverline (Coverline = 36.3 + 0.11 = 36.41)
      { date: '2026-03-08', bbt: 36.7 }, // Day 2 above
      { date: '2026-03-09', bbt: 36.6 }, // Day 3 above
    ];

    const result = detectBiphasicShift(series);
    expect(result.isConfirmed).toBe(true);
    expect(result.coverline).toBe(36.41);
    expect(result.confirmedOvulationDate).toBe('2026-03-06'); // Last low temp day
  });

  it('ignores temp outliers when scanning shift', () => {
    const series = [
      { date: '2026-02-28', bbt: 36.2 },
      { date: '2026-03-01', bbt: 36.2 },
      { date: '2026-03-02', bbt: 36.1 },
      { date: '2026-03-03', bbt: 37.5 }, // Outlier! (>1.0 deg above 5-day median)
      { date: '2026-03-04', bbt: 36.2 },
      { date: '2026-03-05', bbt: 36.1 },
      { date: '2026-03-06', bbt: 36.2 },
      { date: '2026-03-07', bbt: 36.6 },
      { date: '2026-03-08', bbt: 36.7 },
      { date: '2026-03-09', bbt: 36.6 },
    ];

    const result = detectBiphasicShift(series);
    expect(result.isConfirmed).toBe(true);
    expect(result.coverline).toBe(36.31); // 37.5 discarded. Max of valid is 36.2. 36.2 + 0.11 = 36.31
    expect(result.confirmedOvulationDate).toBe('2026-03-06');
  });

  it('returns false if not enough data or shift not sustained', () => {
    const series = [
      { date: '2026-03-01', bbt: 36.2 },
      { date: '2026-03-02', bbt: 36.1 },
      { date: '2026-03-03', bbt: 36.3 },
      { date: '2026-03-04', bbt: 36.2 },
      { date: '2026-03-05', bbt: 36.1 },
      { date: '2026-03-06', bbt: 36.2 },
      { date: '2026-03-07', bbt: 36.6 },
      { date: '2026-03-08', bbt: 36.1 }, // Temp dropped below coverline (36.41)
      { date: '2026-03-09', bbt: 36.6 },
    ];

    const result = detectBiphasicShift(series);
    expect(result.isConfirmed).toBe(false);
  });
});

describe('estimateOvulation', () => {
  const cycle: DerivedCycle = {
    start_date: '2026-03-01',
    end_date: null,
    period_length: 5,
    cycle_length: null,
  };

  const settings: Pick<
    SharedCycleSettings,
    'luteal_phase_length' | 'avg_cycle_length_override'
  > = {
    luteal_phase_length: 14,
    avg_cycle_length_override: 28,
  };

  it('defaults to calendar method', () => {
    const est = estimateOvulation(cycle, [], [], settings);
    expect(est.date).toBe('2026-03-15'); // 28 - 14 = 14 days after start_date
    expect(est.basis).toBe('calendar');
  });

  it('prefers OPK peak over calendar', () => {
    const tests = [
      { entry_date: '2026-03-12', test_type: 'opk', result: 'peak' },
    ];
    const est = estimateOvulation(cycle, [], tests, settings);
    expect(est.date).toBe('2026-03-13'); // peak day + 1 day
    expect(est.basis).toBe('opk');
  });

  it('prefers BBT shifts over OPK and calendar', () => {
    const logs = [
      { entry_date: '2026-03-01', bbt: 36.2 } as SharedCycleDailyLog,
      { entry_date: '2026-03-02', bbt: 36.1 } as SharedCycleDailyLog,
      { entry_date: '2026-03-03', bbt: 36.3 } as SharedCycleDailyLog,
      { entry_date: '2026-03-04', bbt: 36.2 } as SharedCycleDailyLog,
      { entry_date: '2026-03-05', bbt: 36.1 } as SharedCycleDailyLog,
      { entry_date: '2026-03-06', bbt: 36.2 } as SharedCycleDailyLog,
      { entry_date: '2026-03-07', bbt: 36.6 } as SharedCycleDailyLog,
      { entry_date: '2026-03-08', bbt: 36.7 } as SharedCycleDailyLog,
      { entry_date: '2026-03-09', bbt: 36.6 } as SharedCycleDailyLog,
    ];
    const tests = [
      { entry_date: '2026-03-10', test_type: 'opk', result: 'peak' },
    ];

    const est = estimateOvulation(cycle, logs, tests, settings);
    expect(est.date).toBe('2026-03-06'); // Ovulation confirmed by BBT (last low temp date)
    expect(est.basis).toBe('bbt');
  });
});

describe('dpo', () => {
  it('correctly calculates days past ovulation', () => {
    expect(dpo('2026-03-15', '2026-03-12')).toBe(3);
    expect(dpo('2026-03-12', '2026-03-12')).toBe(0);
    expect(dpo('2026-03-10', '2026-03-12')).toBeNull();
  });
});
