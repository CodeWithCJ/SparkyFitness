import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import type {
  CompareQuestion,
  CompareResponse,
  CompareResult,
  CompareSinceResponse,
} from '@workspace/shared';
import { CompareDotsChart } from '@/pages/Reports/Compare/CompareDotsChart';
import { CompareOverTimeChart } from '@/pages/Reports/Compare/CompareOverTimeChart';
import { CompareSinceChart } from '@/pages/Reports/Compare/CompareSinceChart';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockTimeFormat: string | undefined;
const showDay = (d: string) => d;
let mockFormatDate: (d: string, format?: string) => string = showDay;

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    timeFormat: mockTimeFormat,
    formatDateInUserTimezone: (d: string, format?: string) =>
      mockFormatDate(d, format),
  }),
}));

jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: ({
    children,
  }: {
    children: (maximized: boolean, zoom: number) => ReactNode;
  }) => <div>{children(false, 1)}</div>,
}));

interface Dot {
  x: number;
  y: number;
}
type Format = (value: number) => string;
interface AxisProps {
  tickFormatter?: Format;
  allowDecimals?: boolean;
  ticks?: number[];
  domain?: (number | string)[];
}
type TooltipFormat = (value: number, name: string) => [string, string];
type TooltipContent = (props: {
  active?: boolean;
  payload?: { payload?: { day: string; value: number | null } }[];
}) => ReactNode;

let scatterData: Dot[] = [];
let lineKeys: string[] = [];
let xAxis: AxisProps = {};
let yAxis: AxisProps = {};
let tooltipFormat: TooltipFormat | undefined;
let tooltipContent: TooltipContent | undefined;
interface RefProps {
  x?: number;
  y?: number;
  x1?: number;
  x2?: number;
  label?: string | { value?: string };
  strokeDasharray?: string;
  segment?: { x: number; y: number }[];
  ifOverflow?: string;
}
let refAreas: RefProps[] = [];
let refLines: RefProps[] = [];

jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    ScatterChart: Passthrough,
    LineChart: Passthrough,
    Scatter: ({ data }: { data: Dot[] }) => {
      scatterData = data;
      return <div data-testid="scatter" />;
    },
    Line: ({ dataKey }: { dataKey: string }) => {
      lineKeys.push(dataKey);
      return null;
    },
    ReferenceLine: (props: RefProps) => {
      refLines.push(props);
      return <div data-testid="trend" />;
    },
    ReferenceArea: (props: RefProps) => {
      refAreas.push(props);
      return null;
    },
    XAxis: (props: AxisProps) => {
      xAxis = props;
      return null;
    },
    YAxis: (props: AxisProps) => {
      yAxis = props;
      return null;
    },
    CartesianGrid: () => null,
    Tooltip: ({
      formatter,
      content,
    }: {
      formatter?: TooltipFormat;
      content?: TooltipContent;
    }) => {
      tooltipFormat = formatter;
      tooltipContent = content;
      return null;
    },
  };
});

const Q: CompareQuestion = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' };
const YES_NO_Q: CompareQuestion = {
  a: 'meditated',
  b: 'energy',
  choice: 'sameDay',
};

function response(
  result: Partial<CompareResult>,
  q: CompareQuestion,
  dev: { a: Record<string, number>; b: Record<string, number> } = {
    a: {},
    b: {},
  }
): CompareResponse {
  return {
    a: { key: q.a, values: { '2026-10-01': 400, '2026-10-02': 480 } },
    b: { key: q.b, values: { '2026-10-01': 3, '2026-10-02': 4 } },
    through: '2026-10-21',
    deviations: dev,
    result: {
      status: 'ok',
      n: 62,
      needed: 14,
      checks: { ownNormal: true },
      ...result,
    },
  };
}

const DEV = {
  a: { '2026-10-01': -1, '2026-10-02': 1, '2026-10-03': 0.5 },
  b: { '2026-10-01': -0.5, '2026-10-02': 0.8, '2026-10-03': 0.2 },
};

beforeEach(() => {
  scatterData = [];
  lineKeys = [];
  xAxis = {};
  yAxis = {};
  tooltipFormat = undefined;
  tooltipContent = undefined;
  refAreas = [];
  refLines = [];
  mockTimeFormat = undefined;
  mockFormatDate = showDay;
});

describe('CompareDotsChart', () => {
  test('draws a dot per paired day and the trend only when linked', () => {
    const { unmount } = render(
      <CompareDotsChart
        response={response({ linked: true }, Q, DEV)}
        question={Q}
      />
    );
    expect(scatterData).toHaveLength(3);
    expect(screen.getByTestId('trend')).toBeInTheDocument();
    expect(screen.getByText('Each day as a dot')).toBeInTheDocument();
    unmount();
    render(
      <CompareDotsChart
        response={response({ linked: false }, Q, DEV)}
        question={Q}
      />
    );
    expect(screen.queryByTestId('trend')).not.toBeInTheDocument();
  });

  test('axes and tooltip read the dots as signed amounts on the display scale', () => {
    const q: CompareQuestion = { a: 'steps', b: 'mood', choice: 'sameDay' };
    render(
      <CompareDotsChart
        response={response(
          { linked: false },
          q,
          // Mood deviations are stored ×10; the dots show them on 1-10.
          { a: { '2026-10-01': 1234 }, b: { '2026-10-01': 8 } }
        )}
        question={q}
      />
    );
    expect(scatterData).toEqual([{ key: '2026-10-01', x: 1234, y: 0.8 }]);
    // Steps are whole, and the ticks say so instead of "1234.0".
    expect(xAxis.tickFormatter?.(1234)).toBe('+1,234');
    expect(xAxis.tickFormatter?.(0)).toBe('0');
    expect(xAxis.allowDecimals).toBe(false);
    // Mood is already on the display scale: 0.8 stays 0.8, never 0.1.
    expect(yAxis.tickFormatter?.(0.8)).toBe('+0.8');
    expect(yAxis.tickFormatter?.(-1.5)).toBe('-1.5');
    expect(yAxis.allowDecimals).toBe(true);
    expect(tooltipFormat?.(1234, 'Steps')).toEqual(['+1,234', 'Steps']);
    expect(tooltipFormat?.(-0.5, 'Mood')).toEqual(['-0.5', 'Mood']);
  });

  test('a yes/no side by day is a 0/1 flag, not a signed deviation', () => {
    render(
      <CompareDotsChart
        response={response({ status: 'not_enough' }, YES_NO_Q, {
          a: { '2026-10-01': 1 },
          b: { '2026-10-01': 0.5 },
        })}
        question={YES_NO_Q}
      />
    );
    expect(xAxis.tickFormatter?.(1)).toBe('1');
    expect(yAxis.tickFormatter?.(0.5)).toBe('+0.5');
  });

  test('shows the empty state with no dots', () => {
    render(
      <CompareDotsChart
        response={response({ status: 'not_enough' }, Q)}
        question={Q}
      />
    );
    expect(screen.getByText('No days with both yet')).toBeInTheDocument();
    expect(screen.queryByTestId('scatter')).not.toBeInTheDocument();
  });

  test('a yes/no question by day renders bars, not the scatter', () => {
    render(
      <CompareDotsChart
        response={response(
          {
            linked: true,
            binary: {
              yesKey: 'meditated',
              yesMean: 1,
              noMean: 0.5,
              diff: 0.5,
              yesCount: 10,
              noCount: 1,
            },
          },
          YES_NO_Q,
          DEV
        )}
        question={YES_NO_Q}
      />
    );
    expect(screen.getByTestId('compare-bar-yes')).toBeInTheDocument();
    expect(screen.getByTestId('compare-bar-no')).toBeInTheDocument();
    expect(screen.queryByTestId('scatter')).not.toBeInTheDocument();
    expect(screen.getByText(/· 1 day$/)).toBeInTheDocument();
  });

  test('bars show a bedtime as a clock time in the 12/24-hour setting', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'bedtime',
      choice: 'sameDay',
    };
    const binaryResponse = response(
      {
        linked: true,
        binary: {
          yesKey: 'meditated',
          yesMean: 240,
          noMean: 300,
          diff: -60,
          yesCount: 10,
          noCount: 12,
        },
      },
      q,
      DEV
    );
    mockTimeFormat = 'HH:mm';
    const { unmount } = render(
      <CompareDotsChart response={binaryResponse} question={q} />
    );
    expect(screen.getByText('22:00 · 10 nights')).toBeInTheDocument();
    expect(screen.getByText('23:00 · 12 nights')).toBeInTheDocument();
    unmount();
    mockTimeFormat = 'h:mm A';
    render(<CompareDotsChart response={binaryResponse} question={q} />);
    expect(screen.getByText('10:00 PM · 10 nights')).toBeInTheDocument();
  });
});

describe('CompareOverTimeChart', () => {
  test('draws both series and names each metric in the legend', () => {
    render(
      <CompareOverTimeChart response={response({}, Q, DEV)} question={Q} />
    );
    expect(lineKeys).toEqual(['a', 'b']);
    expect(screen.getByText(/^Energy/)).toBeInTheDocument();
    expect(screen.getByText(/Time asleep/)).toBeInTheDocument();
  });

  test('the legend shows a bedtime range in the 12/24-hour setting', () => {
    const q: CompareQuestion = { a: 'bedtime', b: 'energy', choice: 'sameDay' };
    const bedtimes = response({}, q, DEV);
    bedtimes.a.values = { '2026-10-01': 240, '2026-10-02': 300 };
    mockTimeFormat = 'HH:mm';
    render(<CompareOverTimeChart response={bedtimes} question={q} />);
    expect(screen.getByText('Bedtime 22:00–23:00')).toBeInTheDocument();
  });

  test('shows the empty state when nothing is logged', () => {
    const empty = response({}, Q);
    empty.a.values = {};
    empty.b.values = {};
    render(<CompareOverTimeChart response={empty} question={Q} />);
    expect(
      screen.getByText('Nothing logged in this range')
    ).toBeInTheDocument();
  });
});

function sinceResponse(
  outcome: 'mood' | 'meditated',
  line: number
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'meditated', values: {} },
    outcome: {
      key: outcome,
      values: {
        '2026-10-01': outcome === 'mood' ? 50 : 0,
        '2026-10-03': outcome === 'mood' ? 70 : 1,
        '2026-10-05': outcome === 'mood' ? 80 : 1,
      },
    },
    result: {
      status: 'ok',
      start: '2026-10-04',
      suggestedStart: '2026-10-04',
      before: {
        from: '2026-10-01',
        to: '2026-10-03',
        days: 3,
        valueDays: 2,
        mean: 60,
      },
      since: {
        from: '2026-10-04',
        to: '2026-10-05',
        days: 2,
        valueDays: 1,
        mean: 80,
      },
      line,
    },
  };
}

describe('CompareSinceChart', () => {
  test('draws both stretches, the start marker and the dashed line', () => {
    render(<CompareSinceChart response={sinceResponse('mood', 70)} />);
    expect(
      screen.getByRole('img', {
        name: 'Mood over time, before and since 2026-10-04',
      })
    ).toBeInTheDocument();
    expect(refAreas.map((a) => [a.x1, a.x2])).toEqual([
      [0, 2],
      [3, 4],
    ]);
    expect(
      refAreas.map((a) =>
        typeof a.label === 'object' ? a.label.value : a.label
      )
    ).toEqual(['Before', 'Since']);
    expect(refLines.find((l) => l.x === 3)).toBeDefined();
    const dashed = refLines.find((l) => l.y === 7);
    expect(dashed?.strokeDasharray).toBeTruthy();
    expect(
      typeof dashed?.label === 'object' ? dashed.label.value : dashed?.label
    ).toBe('Line 7.0');
    expect(refLines.filter((l) => l.segment).map((l) => l.segment)).toEqual([
      [
        { x: 0, y: 6 },
        { x: 2, y: 6 },
      ],
      [
        { x: 3, y: 8 },
        { x: 4, y: 8 },
      ],
    ]);
  });

  test('a yes/no outcome draws no line', () => {
    render(<CompareSinceChart response={sinceResponse('meditated', 0)} />);
    expect(refLines.some((l) => l.y !== undefined)).toBe(false);
    expect(refLines.some((l) => l.x === 3)).toBe(true);
  });

  test('the dashed line stays drawn when it lies outside the data', () => {
    // A line of 10 sits above every day (the most is 8), so it widens the axis.
    render(<CompareSinceChart response={sinceResponse('mood', 100)} />);
    const dashed = refLines.find((l) => l.y === 10);
    expect(dashed?.ifOverflow).toBe('extendDomain');
  });

  test('a yes/no outcome reads its axis as shares and its days as Yes or No', () => {
    render(<CompareSinceChart response={sinceResponse('meditated', 0)} />);
    expect(yAxis.domain).toEqual([0, 1]);
    expect(yAxis.ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(yAxis.ticks?.map((v) => yAxis.tickFormatter?.(v))).toEqual([
      '0%',
      '25%',
      '50%',
      '75%',
      '100%',
    ]);
    render(
      <>
        {tooltipContent?.({
          active: true,
          payload: [{ payload: { day: '2026-10-03', value: 1 } }],
        })}
        {tooltipContent?.({
          active: true,
          payload: [{ payload: { day: '2026-10-01', value: 0 } }],
        })}
      </>
    );
    expect(screen.getByText('Meditated: Yes')).toBeInTheDocument();
    expect(screen.getByText('Meditated: No')).toBeInTheDocument();
  });

  test('a scaled outcome keeps its own axis and tooltip amounts', () => {
    render(<CompareSinceChart response={sinceResponse('mood', 70)} />);
    expect(yAxis.ticks).toBeUndefined();
    expect(yAxis.tickFormatter?.(6.5)).toBe('6.5');
    render(
      <>
        {tooltipContent?.({
          active: true,
          payload: [{ payload: { day: '2026-10-03', value: 7 } }],
        })}
      </>
    );
    expect(screen.getByText('Mood: 7.0')).toBeInTheDocument();
  });

  test('past 120 days the axis names months with their year', () => {
    mockFormatDate = (d, format) => `${format}:${d}`;
    const { unmount } = render(
      <CompareSinceChart response={sinceResponse('mood', 70)} />
    );
    expect(xAxis.tickFormatter?.(0)).toBe('MMM dd:2026-10-01');
    unmount();

    const long = sinceResponse('mood', 70);
    long.outcome.values = { '2026-01-05': 50, '2026-05-01': 70 };
    long.result = {
      ...long.result,
      start: '2026-04-01',
      before: { ...long.result.before!, from: '2026-01-01', to: '2026-03-31' },
      since: { ...long.result.since!, from: '2026-04-01', to: '2026-06-30' },
    };
    render(<CompareSinceChart response={long} />);
    expect(xAxis.tickFormatter?.(0)).toBe('MMM yyyy:2026-01-01');
  });

  test('says nothing was logged when no day has a value', () => {
    const empty = sinceResponse('mood', 70);
    empty.outcome.values = {};
    render(<CompareSinceChart response={empty} />);
    expect(
      screen.getByText('Nothing logged in this range')
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('renders nothing without a since stretch', () => {
    const empty = sinceResponse('mood', 70);
    empty.result = {
      status: 'not_enough',
      reason: 'noStart',
      start: null,
      suggestedStart: null,
      line: 70,
    };
    const { container } = render(<CompareSinceChart response={empty} />);
    expect(container).toBeEmptyDOMElement();
  });
});
