import {
  completedFasts,
  dailyTotals,
  fastsInWindow,
  heatLevel,
  reportDays,
  summarizeFasts,
  zoneCounts,
} from '../../src/utils/fastingReport';
import { METABOLIC_STAGES } from '../../src/constants/fasting';
import type { FastingLog } from '../../src/types/fasting';

const fast = (overrides: Partial<FastingLog>): FastingLog => ({
  id: 'f',
  user_id: 'u',
  start_time: '2026-10-03T12:00:00',
  end_time: '2026-10-04T04:00:00',
  target_end_time: null,
  duration_minutes: 960,
  fasting_type: '16:8',
  status: 'COMPLETED',
  created_at: null,
  updated_at: null,
  ...overrides,
});

describe('fastingReport', () => {
  test('completedFasts drops active fasts and rows without a duration', () => {
    const rows = [
      fast({ id: 'a' }),
      fast({ id: 'b', status: 'ACTIVE', duration_minutes: null }),
      fast({ id: 'c', duration_minutes: null }),
    ];
    expect(completedFasts(rows).map((f) => f.id)).toEqual(['a']);
  });

  test('summarizeFasts totals, averages and finds the longest', () => {
    const summary = summarizeFasts([
      fast({ duration_minutes: 600 }),
      fast({ duration_minutes: 1080 }),
    ]);
    expect(summary).toEqual({
      totalFasts: 2,
      totalHours: 28,
      avgHours: 14,
      longestHours: 18,
    });
  });

  test('summarizeFasts is all zeros when empty', () => {
    expect(summarizeFasts([])).toEqual({
      totalFasts: 0,
      totalHours: 0,
      avgHours: 0,
      longestHours: 0,
    });
  });

  test('reportDays is inclusive, oldest first and ends on the end date', () => {
    expect(reportDays('2026-10-05', 7)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
  });

  test('dailyTotals zero-fills the window and sums by start day', () => {
    const totals = dailyTotals(
      [
        fast({ start_time: '2026-10-03T12:00:00', duration_minutes: 480 }),
        fast({ start_time: '2026-10-03T20:00:00', duration_minutes: 240 }),
      ],
      '2026-10-05',
      7
    );
    expect(totals).toHaveLength(7);
    expect(totals.find((d) => d.date === '2026-10-03')?.hours).toBe(12);
    expect(totals.find((d) => d.date === '2026-10-04')?.hours).toBe(0);
  });

  test('fastsInWindow keeps only fasts that start inside the window', () => {
    const rows = [
      fast({ id: 'in', start_time: '2026-10-04T20:00:00' }),
      fast({ id: 'out', start_time: '2026-09-01T20:00:00' }),
    ];
    expect(fastsInWindow(rows, '2026-10-05', 7).map((f) => f.id)).toEqual([
      'in',
    ]);
  });

  test('dailyTotals buckets a boundary instant in the given timezone', () => {
    const totals = dailyTotals(
      [fast({ start_time: '2024-06-15T05:00:00Z', duration_minutes: 60 })],
      '2024-06-15',
      7,
      'America/Los_Angeles'
    );
    expect(totals.find((d) => d.date === '2024-06-14')?.hours).toBe(1);
    expect(totals.find((d) => d.date === '2024-06-15')?.hours).toBe(0);
  });

  test('zoneCounts buckets by metabolic stage', () => {
    const counts = zoneCounts(
      [
        fast({ duration_minutes: 120 }), // 2h anabolic
        fast({ duration_minutes: 600 }), // 10h catabolic
        fast({ duration_minutes: 1080 }), // 18h fat burning
        fast({ duration_minutes: 1800 }), // 30h ketosis
        fast({ duration_minutes: 5000 }), // 83h deep ketosis
      ],
      METABOLIC_STAGES.length
    );
    expect(counts).toEqual([1, 1, 1, 1, 1]);
  });

  test('heatLevel thresholds', () => {
    expect([0, 5, 12, 16, 20].map(heatLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});
