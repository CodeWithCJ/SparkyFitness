import { computeNiceYAxisScale } from '../../../src/components/charts/chartFormatting';

describe('computeNiceYAxisScale', () => {
  test('steps by a nice round 500 for a hydration-sized domain', () => {
    expect(computeNiceYAxisScale(0, 1800)).toEqual({
      min: 0,
      max: 2000,
      tickValues: [0, 500, 1000, 1500, 2000],
    });
  });

  test('steps by a nice round 1000 for a larger hydration-sized domain', () => {
    expect(computeNiceYAxisScale(0, 3518)).toEqual({
      min: 0,
      max: 4000,
      tickValues: [0, 1000, 2000, 3000, 4000],
    });
  });

  test('never steps by less than 1, so a narrow weight range still labels whole numbers', () => {
    expect(computeNiceYAxisScale(100.05, 100.42)).toEqual({
      min: 100,
      max: 102,
      tickValues: [100, 101, 102],
    });
  });

  test('every tick value is a whole number, whatever the input scale', () => {
    const { tickValues } = computeNiceYAxisScale(65.3, 82.9);
    for (const tick of tickValues) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  test('the resolved bounds always cover the input range', () => {
    const { min, max } = computeNiceYAxisScale(12, 947);
    expect(min).toBeLessThanOrEqual(12);
    expect(max).toBeGreaterThanOrEqual(947);
  });

  test('widens a single-value domain to at least 3 labeled ticks', () => {
    expect(computeNiceYAxisScale(72, 72)).toEqual({
      min: 72,
      max: 74,
      tickValues: [72, 73, 74],
    });
  });

  test('widens a domain where a goal sits close to the data to at least 3 labeled ticks', () => {
    expect(computeNiceYAxisScale(65, 65.05)).toEqual({
      min: 65,
      max: 67,
      tickValues: [65, 66, 67],
    });
  });

  test('never returns fewer than 3 tick values, whatever the input scale', () => {
    const domains: [number, number][] = [
      [72, 72],
      [65, 65.05],
      [100.05, 100.42],
      [0, 1800],
      [12, 947],
    ];
    for (const [min, max] of domains) {
      expect(
        computeNiceYAxisScale(min, max).tickValues.length
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
