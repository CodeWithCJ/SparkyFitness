import {
  isTerminalFast,
  parseCurrentWatchFast,
  toWatchFast,
} from '../../src/utils/watchFast';

describe('toWatchFast', () => {
  it('keeps "unknown" apart from "not fasting"', () => {
    expect(toWatchFast(undefined)).toBeUndefined();
    expect(toWatchFast(null)).toBeNull();
  });

  it('turns the fast into epoch milliseconds', () => {
    expect(
      toWatchFast({
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
      } as never)
    ).toEqual({
      startedAt: Date.parse('2026-10-03T08:00:00.000Z'),
      targetEndAt: Date.parse('2026-10-04T00:00:00.000Z'),
      label: '16:8',
    });
  });

  it('allows an open-ended fast and ignores a broken start time', () => {
    expect(
      toWatchFast({
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: null,
        fasting_type: null,
      } as never)
    ).toMatchObject({ targetEndAt: null, label: null });
    expect(toWatchFast({ start_time: 'nonsense' } as never)).toBeNull();
  });

  it('says "not fasting" during an auto-calculated eating window, but keeps a calculated fast', () => {
    const base = {
      id: 'auto-2026-10-03T08:00:00.000Z',
      start_time: '2026-10-03T08:00:00.000Z',
      target_end_time: '2026-10-03T16:00:00.000Z',
      fasting_type: '16:8',
      is_auto_calculated: true,
    };
    expect(
      toWatchFast({ ...base, is_eating_window: true } as never)
    ).toBeNull();
    const calculated = toWatchFast(base as never);
    expect(calculated).toMatchObject({ label: '16:8' });
    expect(calculated?.id).toBeUndefined();

    expect(
      toWatchFast({
        id: 'fast-manual-1',
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
      } as never)
    ).toMatchObject({ id: 'fast-manual-1', label: '16:8' });
  });

  it('classifies COMPLETED/CANCELLED as terminal while keeping ACTIVE rows with end_time active', () => {
    expect(isTerminalFast({ status: 'COMPLETED', end_time: null })).toBe(true);
    expect(isTerminalFast({ status: 'CANCELLED', end_time: null })).toBe(true);
    expect(
      isTerminalFast({
        status: null,
        end_time: '2026-10-03T16:00:00.000Z',
      })
    ).toBe(true);
    expect(
      isTerminalFast({
        status: 'ACTIVE',
        end_time: '2026-10-03T16:00:00.000Z',
      })
    ).toBe(false);

    expect(
      toWatchFast({
        id: 'fast-cancelled',
        start_time: '2026-10-03T08:00:00.000Z',
        end_time: null,
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
        status: 'CANCELLED',
      } as never)
    ).toBeNull();

    expect(
      toWatchFast({
        id: 'fast-active-with-end',
        start_time: '2026-10-03T08:00:00.000Z',
        end_time: '2026-10-03T16:00:00.000Z',
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
        status: 'ACTIVE',
      } as never)
    ).toMatchObject({ id: 'fast-active-with-end', label: '16:8' });
  });

  it('parseCurrentWatchFast separates confirmed absence from unreadable payloads', () => {
    expect(parseCurrentWatchFast(null)).toEqual({ known: true, fast: null });
    expect(parseCurrentWatchFast(undefined)).toEqual({ known: false });
    expect(parseCurrentWatchFast('unexpected' as never)).toEqual({
      known: false,
    });
    expect(parseCurrentWatchFast([] as never)).toEqual({ known: false });
    expect(
      parseCurrentWatchFast({
        id: 'f-bad-time',
        start_time: 'not-a-date',
        status: 'ACTIVE',
      } as never)
    ).toEqual({ known: false });
    expect(
      parseCurrentWatchFast({
        id: 'f-null-time',
        start_time: null,
        status: 'ACTIVE',
      } as never)
    ).toEqual({ known: false });
    expect(
      parseCurrentWatchFast({
        id: 'f-blank-time',
        start_time: '   ',
        status: 'ACTIVE',
      } as never)
    ).toEqual({ known: false });
    expect(
      toWatchFast({
        id: 'f-null-time',
        start_time: null,
        status: 'ACTIVE',
      } as never)
    ).toBeNull();
    expect(
      parseCurrentWatchFast({
        id: 'f-eating',
        start_time: 'not-a-date',
        is_eating_window: true,
      } as never)
    ).toEqual({ known: true, fast: null });
    expect(
      parseCurrentWatchFast({
        id: 'f-malformed-eating',
        start_time: null,
        status: 'ACTIVE',
        is_eating_window: 'false',
      } as never)
    ).toEqual({ known: false });
    expect(
      parseCurrentWatchFast({
        id: 'f-done',
        start_time: 'not-a-date',
        status: 'COMPLETED',
      } as never)
    ).toEqual({ known: true, fast: null });
    expect(
      parseCurrentWatchFast({
        id: 'f-active',
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
        status: 'ACTIVE',
      } as never)
    ).toEqual({
      known: true,
      fast: {
        id: 'f-active',
        startedAt: Date.parse('2026-10-03T08:00:00.000Z'),
        targetEndAt: Date.parse('2026-10-04T00:00:00.000Z'),
        label: '16:8',
      },
    });
  });
});
