import type { MouseHandlerDataParam, TickItem } from 'recharts';
import {
  createDateTickFormatter,
  createTimeSyncMethod,
  getTimeXAxisProps,
  parseDateToTimestamp,
  prepareTimeChartData,
} from '@/utils/chartUtils';

/** Local midnight for a calendar day, i.e. what the parser is expected to return. */
const localMidnight = (day: string) => new Date(`${day}T00:00:00`).getTime();

const tick = (value: string | number, index: number): TickItem =>
  ({ value, index, coordinate: index * 10 }) as TickItem;

const hover = (activeLabel: MouseHandlerDataParam['activeLabel']) =>
  ({ activeLabel }) as MouseHandlerDataParam;

describe('parseDateToTimestamp', () => {
  it('passes finite numbers straight through', () => {
    expect(parseDateToTimestamp(1767225600000)).toBe(1767225600000);
  });

  it('rejects non-finite numbers', () => {
    expect(parseDateToTimestamp(NaN)).toBeNull();
    expect(parseDateToTimestamp(Infinity)).toBeNull();
  });

  it('reads a Date, and rejects an invalid one', () => {
    expect(parseDateToTimestamp(new Date(1767225600000))).toBe(1767225600000);
    expect(parseDateToTimestamp(new Date('nope'))).toBeNull();
  });

  it('pins a bare calendar day to local midnight', () => {
    expect(parseDateToTimestamp('2026-01-15')).toBe(
      localMidnight('2026-01-15')
    );
  });

  it('accepts a stringified epoch, which is how Recharts echoes numeric labels', () => {
    expect(parseDateToTimestamp('1767225600000')).toBe(1767225600000);
  });

  // The whole point of MIN_EPOCH_MS: these all-digit strings are not epochs.
  it.each([
    ['a compact YYYYMMDD day', '20260101'],
    ['a bare year', '2026'],
    ['a small counter', '42'],
  ])('does not mistake %s for epoch milliseconds', (_label, value) => {
    expect(parseDateToTimestamp(value)).toBeNull();
  });

  it('parses a full ISO instant as an instant', () => {
    const iso = '2026-01-15T10:30:00.000Z';
    expect(parseDateToTimestamp(iso)).toBe(Date.parse(iso));
  });

  it.each([null, undefined, '', '   ', 'not a date', true, {}])(
    'returns null for %p',
    (value) => {
      expect(parseDateToTimestamp(value)).toBeNull();
    }
  );

  // `new Date` has a lenient fallback parser that turns these into real dates
  // ('Week 3' becomes 2001-02-28), which would silently mis-sync tooltips on a
  // categorical axis. Only ISO shapes may parse.
  it.each(['Week 3', 'Day 5', 'Set 2', 'Q1 2026', '15 Jan', 'Jan 15 2026'])(
    'refuses the categorical label %p that new Date would happily accept',
    (label) => {
      expect(parseDateToTimestamp(label)).toBeNull();
    }
  );

  it('accepts the ISO shapes the app actually stores', () => {
    expect(parseDateToTimestamp('2026-01-15T10:30:00Z')).toBe(
      Date.parse('2026-01-15T10:30:00Z')
    );
    expect(parseDateToTimestamp('2026-01-15T10:30:00.123+02:00')).toBe(
      Date.parse('2026-01-15T10:30:00.123+02:00')
    );
    expect(parseDateToTimestamp('2026-01-15 10:30:00')).toBe(
      new Date('2026-01-15T10:30:00').getTime()
    );
  });
});

describe('prepareTimeChartData', () => {
  const rows = [
    { date: '2026-01-15', value: 3 },
    { date: '2026-01-01', value: 1 },
    { date: 'unknown', value: 2 },
  ];

  it('returns an empty array for empty or missing input', () => {
    expect(prepareTimeChartData([], 'time')).toEqual([]);
    expect(prepareTimeChartData(null, 'time')).toEqual([]);
    expect(prepareTimeChartData(undefined, 'time')).toEqual([]);
  });

  it('sorts chronologically and drops undateable rows in time mode', () => {
    const result = prepareTimeChartData(rows, 'time');

    expect(result.map((r) => r.date)).toEqual(['2026-01-01', '2026-01-15']);
    expect(result.map((r) => r.timestamp)).toEqual([
      localMidnight('2026-01-01'),
      localMidnight('2026-01-15'),
    ]);
  });

  it('keeps every row in point mode, still in chronological order', () => {
    const result = prepareTimeChartData(rows, 'point');

    // On a categorical axis the array order is the axis order, so the points
    // must still come out by date -- undateable rows go last.
    expect(result.map((r) => r.date)).toEqual([
      '2026-01-01',
      '2026-01-15',
      'unknown',
    ]);
    // Still timestamped where possible, because tooltip sync matches on it.
    expect(result.map((r) => r.timestamp)).toEqual([
      localMidnight('2026-01-01'),
      localMidnight('2026-01-15'),
      null,
    ]);
  });

  it('keeps undateable rows in their original relative order', () => {
    const result = prepareTimeChartData(
      [
        { date: 'second', value: 2 },
        { date: '2026-01-01', value: 1 },
        { date: 'first', value: 3 },
      ],
      'point'
    );

    expect(result.map((r) => r.date)).toEqual([
      '2026-01-01',
      'second',
      'first',
    ]);
  });

  it('reads an alternate date key', () => {
    const result = prepareTimeChartData(
      [{ entry_date: '2026-02-01', value: 1 }],
      'time',
      'entry_date'
    );
    expect(result.map((r) => r.timestamp)).toEqual([
      localMidnight('2026-02-01'),
    ]);
  });

  it('does not mutate the input rows', () => {
    const input = [{ date: '2026-01-01', value: 1 }];
    prepareTimeChartData(input, 'time');
    expect(input[0]).not.toHaveProperty('timestamp');
  });
});

describe('getTimeXAxisProps', () => {
  const formatDate = (date: Date | string, pattern?: string) =>
    `${String(date)}|${pattern}`;

  it('returns a continuous time axis in time mode', () => {
    const props = getTimeXAxisProps({ chartScaleMode: 'time', formatDate });

    expect(props.type).toBe('number');
    expect(props.dataKey).toBe('timestamp');
    expect(props.domain).toEqual(['dataMin', 'dataMax']);
    expect(props.scale).toBe('time');
  });

  it('returns a categorical axis in point mode', () => {
    const props = getTimeXAxisProps({ chartScaleMode: 'point', formatDate });

    expect(props.type).toBe('category');
    expect(props.dataKey).toBe('date');
  });

  // Spreading an explicit `undefined` would clobber a domain set by the caller.
  it('omits domain and scale entirely in point mode', () => {
    const props = getTimeXAxisProps({ chartScaleMode: 'point', formatDate });

    expect(props).not.toHaveProperty('domain');
    expect(props).not.toHaveProperty('scale');
  });

  it('honours custom keys', () => {
    const props = getTimeXAxisProps({
      chartScaleMode: 'point',
      formatDate,
      dateKey: 'entry_date',
    });
    expect(props.dataKey).toBe('entry_date');
  });
});

describe('createDateTickFormatter', () => {
  const formatDate = jest.fn(
    (date: Date | string, pattern?: string) => `${String(date)}|${pattern}`
  );

  beforeEach(() => formatDate.mockClear());

  it('formats a numeric timestamp through a Date', () => {
    createDateTickFormatter(formatDate)(1767225600000);

    const [date, pattern] = formatDate.mock.calls[0]!;
    expect(date).toBeInstanceOf(Date);
    expect((date as Date).getTime()).toBe(1767225600000);
    expect(pattern).toBe('MMM dd');
  });

  it('passes a day string through untouched, so the formatter can treat it literally', () => {
    createDateTickFormatter(formatDate, 'dd/MM')('2026-01-15');
    expect(formatDate).toHaveBeenCalledWith('2026-01-15', 'dd/MM');
  });

  it('renders nothing for a blank or non-date value', () => {
    const format = createDateTickFormatter(formatDate);
    expect(format('')).toBe('');
    expect(format('   ')).toBe('');
    expect(format(null)).toBe('');
    expect(formatDate).not.toHaveBeenCalled();
  });
});

describe('createTimeSyncMethod', () => {
  const ticks = [
    tick(localMidnight('2026-01-01'), 0),
    tick(localMidnight('2026-01-10'), 1),
    tick(localMidnight('2026-01-20'), 2),
  ];

  it('matches the nearest point in time, not the nearest index', () => {
    const sync = createTimeSyncMethod();

    // Jan 4 is 3 days from Jan 1 but 6 from Jan 10.
    expect(sync(ticks, hover(localMidnight('2026-01-04')))).toBe(0);
    // Jan 8 is 2 days from Jan 10 but 7 from Jan 1.
    expect(sync(ticks, hover(localMidnight('2026-01-08')))).toBe(1);
  });

  it('matches across the two axis shapes, day string against timestamp', () => {
    const sync = createTimeSyncMethod();
    expect(sync(ticks, hover('2026-01-19'))).toBe(2);
  });

  it('accepts the stringified timestamps Recharts emits', () => {
    const sync = createTimeSyncMethod();
    expect(sync(ticks, hover(String(localMidnight('2026-01-09'))))).toBe(1);
  });

  it('matches day-string ticks too, for charts left on a categorical axis', () => {
    const sync = createTimeSyncMethod();
    const dayTicks = [tick('2026-01-01', 0), tick('2026-01-10', 1)];
    expect(sync(dayTicks, hover(localMidnight('2026-01-09')))).toBe(1);
  });

  it('falls back to the index Recharts computed when the label is not a date', () => {
    const sync = createTimeSyncMethod();
    const param = {
      activeLabel: 'Week 3',
      activeTooltipIndex: 1,
    } as MouseHandlerDataParam;

    expect(sync([tick('A', 0), tick('B', 1), tick('C', 2)], param)).toBe(1);
  });

  it('returns -1 rather than highlighting an unrelated first point', () => {
    const sync = createTimeSyncMethod();

    expect(sync([], hover(localMidnight('2026-01-04')))).toBe(-1);
    // A dated hover over a chart with no dated ticks and no usable index.
    expect(
      sync([tick('A', 0), tick('B', 1)], hover(localMidnight('2026-01-04')))
    ).toBe(-1);
    expect(sync(ticks, hover(undefined))).toBe(-1);
  });

  it('ignores an out-of-range fallback index', () => {
    const sync = createTimeSyncMethod();
    const param = {
      activeLabel: 'Week 3',
      activeTooltipIndex: 99,
    } as MouseHandlerDataParam;

    expect(sync([tick('A', 0)], param)).toBe(-1);
  });
});
