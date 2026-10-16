import {
  MAX_CUSTOM_RANGE_DAYS,
  clampCustomRange,
  resolveReportWindow,
} from '../../src/utils/trendRange';

const TODAY = '2026-10-11';

describe('clampCustomRange', () => {
  it('puts the days in order and keeps a normal range as picked', () => {
    expect(clampCustomRange('2026-10-08', '2026-10-01', TODAY)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-08',
    });
  });

  it('does not run past today', () => {
    expect(clampCustomRange('2026-10-05', '2026-10-30', TODAY)).toEqual({
      startDate: '2026-10-05',
      endDate: TODAY,
    });
  });

  it('cuts a range longer than the maximum back to its end', () => {
    const range = clampCustomRange('2025-01-01', '2026-10-01', TODAY);
    expect(range.endDate).toBe('2026-10-01');
    expect(resolveReportWindow('custom', range, TODAY).days).toBe(
      MAX_CUSTOM_RANGE_DAYS
    );
  });
});

describe('resolveReportWindow', () => {
  it('ends a preset today and counts its days', () => {
    expect(resolveReportWindow('7d', null, TODAY)).toEqual({
      startDate: '2026-10-05',
      endDate: TODAY,
      days: 7,
      chartRange: '7d',
    });
    expect(resolveReportWindow('90d', null, TODAY).days).toBe(90);
  });

  it('uses the days picked and the chart density that suits them', () => {
    const window = resolveReportWindow(
      'custom',
      { startDate: '2026-09-01', endDate: '2026-09-20' },
      TODAY
    );
    expect(window).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-20',
      days: 20,
      chartRange: '30d',
    });
    expect(
      resolveReportWindow(
        'custom',
        { startDate: '2026-06-01', endDate: '2026-09-20' },
        TODAY
      ).chartRange
    ).toBe('90d');
    expect(
      resolveReportWindow(
        'custom',
        { startDate: '2026-10-03', endDate: '2026-10-09' },
        TODAY
      ).chartRange
    ).toBe('7d');
  });

  it('falls back to 30 days until custom days are picked', () => {
    const window = resolveReportWindow('custom', null, TODAY);
    expect(window.days).toBe(30);
    expect(window.chartRange).toBe('30d');
  });
});
