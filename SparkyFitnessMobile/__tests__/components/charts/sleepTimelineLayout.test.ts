import {
  buildSleepTimelineLayout,
  chooseSleepClockAnchorMinutes,
  toClockOffsetMinutes,
} from '../../../src/components/charts/sleepTimelineLayout';
import type { SleepTimelineDay } from '../../../src/types/sleep';

/**
 * The clock axis is a wall clock, so every number under test here has to come from the
 * zone the night was recorded in rather than the runner's own. Each fixture below pins a
 * bedtime of 22:45 *local* to a different zone, expressed as the UTC instant it maps to —
 * so an implementation reading `Date#getHours` produces a different answer in every CI
 * timezone, and the assertions below only hold if the zone is honoured.
 */
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const nightAt = (
  day: string,
  bedtimeUtc: string,
  zone: SleepTimelineDay['zone']
): SleepTimelineDay => {
  const startMs = Date.parse(bedtimeUtc);

  return {
    day,
    timeInBedSeconds: EIGHT_HOURS_MS / 1000,
    timeAsleepSeconds: null,
    segments: [{ stage: 'other', startMs, endMs: startMs + EIGHT_HOURS_MS }],
    zone,
  };
};

// 22:45 in Tokyo (UTC+9) and 22:45 in Berlin (UTC+2, summer) — seven hours apart as
// instants, the same moment of the evening as far as the sleeper is concerned.
const tokyoNight = nightAt('2026-08-23', '2026-08-22T13:45:00Z', {
  kind: 'tz',
  tz: 'Asia/Tokyo',
});
const berlinNight = nightAt('2026-08-22', '2026-08-21T20:45:00Z', {
  kind: 'tz',
  tz: 'Europe/Berlin',
});

describe('toClockOffsetMinutes', () => {
  const anchorMinutes = 21 * 60;

  test('measures from the wall clock of the zone the instant was recorded in', () => {
    const bedtime = Date.parse('2026-08-22T13:45:00Z');

    // 22:45 in Tokyo is 105 minutes past a 21:00 anchor.
    expect(
      toClockOffsetMinutes(bedtime, anchorMinutes, {
        kind: 'tz',
        tz: 'Asia/Tokyo',
      })
    ).toBe(105);
    // The same instant read in UTC is 13:45, which is most of a day past the anchor.
    expect(
      toClockOffsetMinutes(bedtime, anchorMinutes, { kind: 'tz', tz: 'UTC' })
    ).toBe(1005);
  });

  test('accepts a fixed offset for sources that report no zone', () => {
    const bedtime = Date.parse('2026-08-22T13:45:00Z');

    expect(
      toClockOffsetMinutes(bedtime, anchorMinutes, {
        kind: 'offset',
        minutes: 540,
      })
    ).toBe(105);
  });

  test('falls back to the device clock when the night has no zone', () => {
    const bedtime = Date.parse('2026-08-22T13:45:00Z');
    const local = new Date(bedtime);
    const expected =
      (local.getHours() * 60 + local.getMinutes() - anchorMinutes + 1440) %
      1440;

    expect(toClockOffsetMinutes(bedtime, anchorMinutes, null)).toBe(expected);
    expect(toClockOffsetMinutes(bedtime, anchorMinutes)).toBe(expected);
  });
});

describe('chooseSleepClockAnchorMinutes', () => {
  test('finds the quiet stretch on each night’s own clock', () => {
    // Both nights run 22:45–06:45 locally, so the anchor is an hour before the earliest
    // covered hour (22:00) regardless of the instants involved.
    expect(chooseSleepClockAnchorMinutes([tokyoNight, berlinNight])).toBe(
      21 * 60
    );
  });

  test('falls back to the default evening anchor for a window with no sleep', () => {
    const empty: SleepTimelineDay = {
      day: '2026-08-23',
      timeInBedSeconds: 0,
      timeAsleepSeconds: null,
      segments: [],
      zone: null,
    };

    expect(chooseSleepClockAnchorMinutes([empty])).toBe(18 * 60);
  });
});

describe('buildSleepTimelineLayout', () => {
  test('draws two nights slept at the same local hour at the same height', () => {
    // The regression this guards: reading the instants on the device clock puts these
    // seven hours apart on the axis, which is how a trip used to smear the chart.
    const days = [berlinNight, tokyoNight];

    const layout = buildSleepTimelineLayout(days, {
      width: 100,
      height: 100,
      anchorMinutes: chooseSleepClockAnchorMinutes(days),
      innerPadding: 0,
    });

    expect(layout.columns).toHaveLength(2);
    expect(layout.columns[0].blocks[0].y).toBeCloseTo(
      layout.columns[1].blocks[0].y
    );
    expect(layout.columns[0].blocks[0].height).toBeCloseTo(
      layout.columns[1].blocks[0].height
    );
  });

  /**
   * A DST night's elapsed duration is not its span on the clock face. Both nights below
   * ran 23:00–07:00 on the sleeper's own clock — eight hours of axis — but Europe/Berlin
   * skips an hour into 2026-03-29 and repeats one into 2026-10-25, so they are seven and
   * nine hours of elapsed time. Laying the block out from the elapsed duration ends it at
   * 06:00 and 08:00 respectively.
   */
  describe.each([
    ['forward', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z'],
    ['backward', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z'],
  ])('across a %s DST transition', (_direction, bedtimeUtc, wakeUtc) => {
    const startMs = Date.parse(bedtimeUtc);
    const night: SleepTimelineDay = {
      day: '2026-03-29',
      timeInBedSeconds: (Date.parse(wakeUtc) - startMs) / 1000,
      timeAsleepSeconds: null,
      segments: [{ stage: 'other', startMs, endMs: Date.parse(wakeUtc) }],
      zone: { kind: 'tz', tz: 'Europe/Berlin' },
    };

    test('ends the night where the sleeper’s clock said they woke', () => {
      const layout = buildSleepTimelineLayout([night], {
        width: 100,
        // One pixel per minute of the 21:00–07:00 domain, so the block's geometry reads
        // straight back as clock minutes.
        height: 600 - 120,
        anchorMinutes: 21 * 60,
        innerPadding: 0,
      });

      // 22:00 through 07:00, as minutes past the 21:00 anchor.
      expect(layout.domain).toEqual({ startMinutes: 120, endMinutes: 600 });
      expect(layout.columns[0].blocks[0].y).toBeCloseTo(0);
      expect(layout.columns[0].blocks[0].height).toBeCloseTo(8 * 60);
    });
  });

  test('returns empty geometry for the first frame, before onLayout reports a width', () => {
    const layout = buildSleepTimelineLayout([tokyoNight], {
      width: 0,
      height: 0,
      anchorMinutes: 21 * 60,
      innerPadding: 0,
    });

    expect(layout.columns).toEqual([]);
    expect(layout.ticks).toEqual([]);
  });
});
