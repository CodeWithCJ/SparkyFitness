import {
  sinceLineOptions,
  type CompareMetricKey,
  type CompareSinceResult,
} from '@workspace/shared';

import { initializeI18n } from '../../src/localization/i18n';
import { compareValueText } from '../../src/utils/compareCopy';

beforeAll(async () => {
  await initializeI18n('en');
});

type Ranges = Pick<CompareSinceResult, 'before' | 'since'>;

function ranges(before: [number, number], since: [number, number]): Ranges {
  const stretch = (from: string, to: string, [p10, p90]: [number, number]) => ({
    from,
    to,
    days: 100,
    valueDays: 90,
    mean: (p10 + p90) / 2,
    p10,
    p90,
  });
  return {
    before: stretch('2025-12-23', '2026-03-31', before),
    since: stretch('2026-04-01', '2026-07-09', since),
  };
}

const values = (options: { value: number }[]) => options.map((o) => o.value);
const labels = (options: { label: string }[]) => options.map((o) => o.label);

function lineOptions(key: CompareMetricKey, current: number, result?: Ranges) {
  return sinceLineOptions(
    key,
    current,
    (v) => compareValueText(key, v),
    result
  );
}

describe('sinceLineOptions', () => {
  it('offers mood on 1-10, as the 10-100 the server keeps', () => {
    const options = lineOptions('mood', 70);
    expect(values(options)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(labels(options)).toEqual([
      '1.0',
      '2.0',
      '3.0',
      '4.0',
      '5.0',
      '6.0',
      '7.0',
      '8.0',
      '9.0',
      '10.0',
    ]);
  });

  it('offers energy and focus 1 to 5', () => {
    expect(values(lineOptions('energy', 4))).toEqual([1, 2, 3, 4, 5]);
    expect(values(lineOptions('focus', 4))).toEqual([1, 2, 3, 4, 5]);
  });

  it('steps round numbers across both typical ranges and keeps the line in use', () => {
    const options = lineOptions(
      'steps',
      8734.5,
      ranges([5200, 9800], [6100, 11800])
    );
    expect(values(options)).toEqual([4000, 6000, 8000, 8734.5, 10000, 12000]);
    expect(labels(options)).toEqual([
      '4,000',
      '6,000',
      '8,000',
      '8,735',
      '10,000',
      '12,000',
    ]);
  });

  it('steps hours by the half hour', () => {
    expect(
      values(lineOptions('timeAsleep', 7.5, ranges([6.1, 8.4], [6.4, 8.2])))
    ).toEqual([6, 6.5, 7, 7.5, 8, 8.5]);
  });

  it('steps bedtime by the quarter hour, as clock times', () => {
    const options = lineOptions('bedtime', 300, ranges([240, 330], [250, 320]));
    expect(values(options)).toEqual([240, 255, 270, 285, 300, 315, 330]);
    expect(labels(options)[0]).toMatch(/^10:00\sPM$/);
    expect(labels(options)[6]).toMatch(/^11:30\sPM$/);
  });

  it('steps a wide bedtime range by the hour, the largest step', () => {
    const steps = values(
      lineOptions('bedtime', 300, ranges([0, 600], [60, 540]))
    );
    expect(steps[0]).toBe(0);
    expect(steps.slice(1).map((value, i) => value - steps[i]!)).toEqual(
      Array(steps.length - 1).fill(60)
    );
  });

  it('never steps a count below one', () => {
    expect(
      values(lineOptions('steps', 100, ranges([100, 101], [100, 101])))
    ).toEqual([100, 101]);
  });

  it('spreads round steps around the line when there is no range yet', () => {
    expect(values(lineOptions('steps', 5000))).toEqual([
      4000, 4500, 5000, 5500, 6000,
    ]);
  });

  it('drops a step that reads the same as the line in use', () => {
    const options = lineOptions(
      'steps',
      8000.4,
      ranges([5200, 9800], [6100, 11800])
    );
    expect(values(options)).toEqual([4000, 6000, 8000.4, 10000, 12000]);
    expect(labels(options).filter((l) => l === '8,000')).toHaveLength(1);
  });

  it('never goes below zero', () => {
    expect(
      Math.min(...values(lineOptions('alcohol', 2, ranges([0, 4], [0, 3]))))
    ).toBe(0);
  });
});
