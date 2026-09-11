import { describe, expect, it } from 'vitest';
import {
  clusterSleepStagesByGap,
  getPrimarySleepStageCluster,
  recomputeSleepAggregatesFromStages,
} from '../utils/sleepStageAggregates.js';

/**
 * Regression for #1954 / Health Connect same-day merge: when stages from the
 * main night and a disconnected evening fragment (next night / nap) land on
 * one entry_date, duration must follow the primary cluster — not min→max
 * across a ~24h envelope.
 */
describe('recomputeSleepAggregatesFromStages primary cluster (#1954)', () => {
  const mainNight = [
    {
      stage_type: 'light',
      start_time: '2026-09-05T23:28:00-03:00',
      end_time: '2026-09-05T23:41:00-03:00',
      duration_in_seconds: 13 * 60,
    },
    {
      stage_type: 'deep',
      start_time: '2026-09-05T23:42:00-03:00',
      end_time: '2026-09-06T00:16:00-03:00',
      duration_in_seconds: 34 * 60,
    },
    {
      stage_type: 'light',
      start_time: '2026-09-06T00:17:00-03:00',
      end_time: '2026-09-06T06:06:00-03:00',
      duration_in_seconds: 349 * 60,
    },
  ];

  const eveningFragment = [
    {
      stage_type: 'light',
      start_time: '2026-09-06T22:12:00-03:00',
      end_time: '2026-09-06T22:23:00-03:00',
      duration_in_seconds: 11 * 60,
    },
    {
      stage_type: 'deep',
      start_time: '2026-09-06T22:24:00-03:00',
      end_time: '2026-09-06T23:56:59.999-03:00',
      duration_in_seconds: 93 * 60,
    },
  ];

  it('splits disconnected blocks when gap exceeds 4 hours', () => {
    const clusters = clusterSleepStagesByGap([
      ...mainNight,
      ...eveningFragment,
    ]);
    expect(clusters).toHaveLength(2);
  });

  it('picks the longer asleep block as primary', () => {
    const primary = getPrimarySleepStageCluster([
      ...eveningFragment,
      ...mainNight,
    ]);
    expect(new Date(primary[0].start_time).toISOString()).toBe(
      new Date('2026-09-05T23:28:00-03:00').toISOString()
    );
  });

  it('does not stretch wake_time to the evening fragment', () => {
    const agg = recomputeSleepAggregatesFromStages([
      ...mainNight,
      ...eveningFragment,
    ]);
    expect(agg.wake_time?.toISOString()).toBe(
      new Date('2026-09-06T06:06:00-03:00').toISOString()
    );
    expect(agg.bedtime?.toISOString()).toBe(
      new Date('2026-09-05T23:28:00-03:00').toISOString()
    );
    // ~6.6h in bed, not ~24.5h
    expect(agg.duration_in_seconds).toBeGreaterThan(6 * 3600);
    expect(agg.duration_in_seconds).toBeLessThan(8 * 3600);
    expect(agg.time_asleep_in_seconds).toBe((13 + 34 + 349) * 60);
  });

  it('keeps a single contiguous night as one envelope (issue #1180 path)', () => {
    const withSmallGap = [
      ...mainNight.slice(0, 2),
      {
        stage_type: 'light',
        // 45 min gap after deep — still same night
        start_time: '2026-09-06T01:01:00-03:00',
        end_time: '2026-09-06T06:06:00-03:00',
        duration_in_seconds: 305 * 60,
      },
    ];
    expect(clusterSleepStagesByGap(withSmallGap)).toHaveLength(1);
    const agg = recomputeSleepAggregatesFromStages(withSmallGap);
    expect(agg.duration_in_seconds).toBe(
      Math.round(
        (new Date('2026-09-06T06:06:00-03:00').getTime() -
          new Date('2026-09-05T23:28:00-03:00').getTime()) /
          1000
      )
    );
  });
});
