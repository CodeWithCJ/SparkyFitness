import {
  chartFontFamily,
  computeNiceYAxisScale,
  measureLabelColumnWidth,
} from '../../../src/components/charts/chartFormatting';

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

  test('falls back to a safe scale instead of hanging when a bound is NaN', () => {
    expect(computeNiceYAxisScale(NaN, NaN)).toEqual(
      computeNiceYAxisScale(0, 0)
    );
    expect(computeNiceYAxisScale(NaN, 10)).toEqual(computeNiceYAxisScale(0, 0));
    expect(computeNiceYAxisScale(5, NaN)).toEqual(computeNiceYAxisScale(0, 0));
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

describe('measureLabelColumnWidth', () => {
  test('returns the fallback width when there are no labels', () => {
    expect(measureLabelColumnWidth([], () => 999, 44)).toBe(44);
  });

  test('sizes to the widest label plus a small gap, not the fallback', () => {
    const widths: Record<string, number> = {
      '23': 12,
      '01': 12,
      '12 AM': 30,
    };
    const measureText = (label: string) => widths[label];

    expect(
      measureLabelColumnWidth(['23', '01', '12 AM'], measureText, 44)
    ).toBe(36);
  });

  test('rounds a fractional measurement up', () => {
    expect(measureLabelColumnWidth(['23'], () => 12.2, 44)).toBe(19);
  });
});

describe('chartFontFamily', () => {
  test('uses a CJK-capable family on iOS for Chinese, Japanese and Korean', () => {
    expect(chartFontFamily('zh-CN', 'ios')).toBe('PingFang SC');
    expect(chartFontFamily('zh-Hant-TW', 'ios')).toBe('PingFang TC');
    expect(chartFontFamily('ja-JP', 'ios')).toBe('Hiragino Sans');
    expect(chartFontFamily('ko-KR', 'ios')).toBe('Apple SD Gothic Neo');
  });

  test('keeps Helvetica for other iOS locales and sans-serif on Android', () => {
    expect(chartFontFamily('en-US', 'ios')).toBe('Helvetica');
    expect(chartFontFamily('zh-CN', 'android')).toBe('sans-serif');
  });
});
