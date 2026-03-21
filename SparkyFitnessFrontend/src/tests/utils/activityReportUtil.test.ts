/**
 * Tests for processChartData in activityReportUtil.ts
 *
 * These tests document both the correct expected behaviour and the known
 * bugs that need to be fixed:
 *
 * Bug 1 – Index misalignment: unknown descriptor keys (directCadence,
 *   directPower) are not handled, so currentDataIndex is not incremented
 *   for them. Any known key that appears AFTER an unknown key in the
 *   descriptor list will be mapped to the wrong metrics-array column,
 *   producing wrong values (e.g. heart rate reading a cadence column).
 *   Fix: use descriptor.metricsIndex directly instead of counting.
 *
 * Bug 2 – sumDistance required: the function returns [] when sumDistance
 *   is absent from the descriptor list, making all charts empty for
 *   activities that don't track distance (cardio, soccer).
 *   Fix: make sumDistance optional; proceed without distance data.
 */

import { processChartData } from '@/utils/activityReportUtil';
import { ActivityDetailsResponse } from '@/types/exercises';
import { ChartDataPoint } from '@/types/reports';

// ── i18next ─────────────────────────────────────────────────────────────────
jest.mock('i18next', () => ({
  t: (key: string) => key,
}));

// ── helpers ──────────────────────────────────────────────────────────────────

/** Identity distance converter (km → km). */
const identityConvert = (value: number, _from: string, _to: string): number => value;

/** Build an ActivityDetailsResponse with the given descriptor keys and sample rows. */
function makeActivityData(
  descriptorKeys: string[],
  metrics: string[][]
): ActivityDetailsResponse {
  return {
    activity: {
      details: {
        metricDescriptors: descriptorKeys.map((key, i) => ({
          metricsIndex: i,
          key,
          unit: { key: 'unit' },
        })),
        activityDetailMetrics: metrics.map((row) => ({ metrics: row })),
      },
    },
  };
}

// ── Timestamp constants ───────────────────────────────────────────────────────
// Use absolute Unix timestamps (> 1_000_000_000_000 ms threshold in the code)
const T0 = 1741534000000; // start
const T1 = T0 + 10000;   // +10 s
const T2 = T0 + 20000;   // +20 s

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Guard clauses – should always return []
// ═══════════════════════════════════════════════════════════════════════════════

describe('processChartData – guard clauses', () => {
  it('returns [] when metrics array is empty', () => {
    const activityData = makeActivityData(
      ['directTimestamp', 'sumDistance', 'directHeartRate'],
      []
    );
    const result = processChartData([], activityData, 'SILENT', identityConvert, 'km');
    expect(result).toEqual([]);
  });

  it('returns [] when metricDescriptors is missing', () => {
    const activityData: ActivityDetailsResponse = {
      activity: {
        details: {
          // no metricDescriptors
          activityDetailMetrics: [{ metrics: [String(T0), '0', '120'] }],
        },
      },
    };
    const result = processChartData(
      [{ metrics: [String(T0), '0', '120'] }],
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    expect(result).toEqual([]);
  });

  it('returns [] when directTimestamp descriptor is missing', () => {
    const activityData = makeActivityData(
      ['sumDistance', 'directHeartRate'],
      [['1000', '120']]
    );
    const result = processChartData(
      [{ metrics: ['1000', '120'] }],
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Happy path – all known descriptors present
// ═══════════════════════════════════════════════════════════════════════════════

describe('processChartData – happy path with sumDistance', () => {
  // Descriptors: directTimestamp(0), sumDistance(1), directHeartRate(2), directSpeed(3)
  // Cumulative distances: 0 m, 500 m, 1000 m
  const descriptors = ['directTimestamp', 'sumDistance', 'directHeartRate', 'directSpeed'];
  const rows: string[][] = [
    [String(T0), '0',    '120', '3.0'],
    [String(T1), '500',  '130', '3.2'],
    [String(T2), '1000', '140', '3.5'],
  ];

  it('returns one data point per sample (or sampled subset)', () => {
    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('reads heart rate from the correct column', () => {
    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    // All heart rates must be in the 120–140 range (not distance or speed values)
    result.forEach((point: ChartDataPoint) => {
      if (point.heartRate !== null) {
        expect(point.heartRate).toBeGreaterThanOrEqual(120);
        expect(point.heartRate).toBeLessThanOrEqual(140);
      }
    });
  });

  it('calculates relative distance starting from 0', () => {
    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    const first = result[0];
    expect(first?.distance).toBeCloseTo(0, 3);
  });

  it('last point distance equals total activity distance in km', () => {
    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );
    const last = result[result.length - 1];
    // 1000 m cumulative - 0 m initial = 1000 m = 1.0 km
    expect(last?.distance).toBeCloseTo(1.0, 2);
  });

  it('converts distance to miles when distanceUnit is miles', () => {
    const toMiles = (value: number) => value * 0.621371;
    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      toMiles,
      'miles'
    );
    const last = result[result.length - 1];
    // 1.0 km → ~0.621 miles
    expect(last?.distance).toBeCloseTo(0.621, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Bug 1 – index misalignment with unknown descriptor keys
//
// Real Garmin data for running/soccer includes directCadence and directPower,
// which are not in the hardcoded list. When they appear after a known key the
// current counting logic still produces the right index — but if they appear
// BEFORE a known key the index will be off by the number of unknown keys.
//
// Using metricsIndex from the descriptor object directly fixes this regardless
// of ordering.
// ═══════════════════════════════════════════════════════════════════════════════

describe('processChartData – Bug 1: unknown descriptor keys', () => {
  it('reads correct heart rate when unknown keys appear before directHeartRate', () => {
    // Descriptors: directTimestamp(0), UNKNOWN(1), directHeartRate(2), directSpeed(3)
    // With the counting bug, directHeartRate gets index 1 (wrong → reads unknown data).
    // With the metricsIndex fix, directHeartRate gets index 2 (correct → reads 135).
    const descriptors = ['directTimestamp', 'directUnknownField', 'directHeartRate', 'directSpeed'];
    const rows: string[][] = [
      [String(T0), '999',  '135', '2.8'],
      [String(T1), '999',  '140', '2.9'],
      [String(T2), '999',  '138', '3.0'],
    ];

    // We need sumDistance somewhere for the function to not short-circuit.
    // Add it as an extra known column at position 4.
    const descriptorsWithDist = [...descriptors, 'sumDistance'];
    const rowsWithDist = rows.map((r, i) => [...r, String(i * 500)]);

    const activityData = makeActivityData(descriptorsWithDist, rowsWithDist);
    const result = processChartData(
      rowsWithDist.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );

    result.forEach((point: ChartDataPoint) => {
      if (point.heartRate !== null) {
        // Correct: 135–140. Bug would produce 999 (unknown field value).
        expect(point.heartRate).toBeGreaterThanOrEqual(135);
        expect(point.heartRate).toBeLessThanOrEqual(140);
      }
    });
  });

  it('reads correct heart rate when directCadence appears before directHeartRate', () => {
    // Real soccer/running pattern: directTimestamp, directCadence, directHeartRate
    const descriptors = ['directTimestamp', 'directCadence', 'directHeartRate', 'sumDistance'];
    const rows: string[][] = [
      [String(T0), '85', '137', '0'],
      [String(T1), '87', '140', '500'],
      [String(T2), '84', '135', '1000'],
    ];

    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );

    result.forEach((point: ChartDataPoint) => {
      if (point.heartRate !== null) {
        // Correct: 135–140. Bug would produce 85–87 (cadence values).
        expect(point.heartRate).toBeGreaterThanOrEqual(135);
        expect(point.heartRate).toBeLessThanOrEqual(140);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Bug 2 – sumDistance missing should not return []
//
// Activities like cardio and soccer often have no sumDistance in their
// metricDescriptors. The current code returns [] in that case, making
// all charts empty. After the fix, the function should return chart data
// with distance=0 for every point.
// ═══════════════════════════════════════════════════════════════════════════════

describe('processChartData – Bug 2: sumDistance missing', () => {
  it('returns non-empty chart data when sumDistance is absent', () => {
    // Cardio / soccer: only timestamp + heart rate
    const descriptors = ['directTimestamp', 'directHeartRate', 'directSpeed'];
    const rows: string[][] = [
      [String(T0), '120', '0'],
      [String(T1), '130', '0.1'],
      [String(T2), '125', '0.2'],
    ];

    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );

    // After fix: should return data points, not an empty array.
    expect(result.length).toBeGreaterThan(0);
  });

  it('still reads heart rate correctly when sumDistance is absent', () => {
    const descriptors = ['directTimestamp', 'directHeartRate'];
    const rows: string[][] = [
      [String(T0), '137'],
      [String(T1), '140'],
      [String(T2), '135'],
    ];

    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );

    result.forEach((point: ChartDataPoint) => {
      if (point.heartRate !== null) {
        expect(point.heartRate).toBeGreaterThanOrEqual(135);
        expect(point.heartRate).toBeLessThanOrEqual(140);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Sorting – data points are ordered by timestamp
// ═══════════════════════════════════════════════════════════════════════════════

describe('processChartData – timestamp ordering', () => {
  it('sorts out-of-order samples by timestamp', () => {
    const descriptors = ['directTimestamp', 'sumDistance', 'directHeartRate'];
    // Deliberately out of order: T2, T0, T1
    const rows: string[][] = [
      [String(T2), '1000', '140'],
      [String(T0), '0',    '120'],
      [String(T1), '500',  '130'],
    ];

    const activityData = makeActivityData(descriptors, rows);
    const result = processChartData(
      rows.map((r) => ({ metrics: r })),
      activityData,
      'SILENT',
      identityConvert,
      'km'
    );

    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.timestamp).toBeGreaterThanOrEqual(result[i - 1]!.timestamp);
    }
  });
});
