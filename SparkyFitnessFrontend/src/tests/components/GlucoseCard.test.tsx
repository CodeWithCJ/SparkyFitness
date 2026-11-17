import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { usePreferences } from '@/contexts/PreferencesContext';
import GlucoseCard from '@/pages/Reports/GlucoseCard';
import { useGlucoseContext } from '@/hooks/Reports/useGlucoseContext';
import { useHealthMetricSamples } from '@/hooks/useGenericHealth';

jest.mock('@/hooks/Reports/useGlucoseContext', () => ({
  useGlucoseContext: jest.fn(),
}));
jest.mock('@/hooks/useGenericHealth', () => ({
  useHealthMetricSamples: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
    i18n: { language: 'en' },
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: jest.fn(() => ({
    formatDateInUserTimezone: () => 'Nov 3',
    formatTime: () => '10:00',
    timezone: 'UTC',
    glucoseUnit: 'mmol/L',
  })),
}));
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    children,
  LineChart: ({
    data,
    children,
  }: {
    data: unknown;
    children: React.ReactNode;
  }) => (
    <>
      <pre data-testid="points">{JSON.stringify(data)}</pre>
      {children}
    </>
  ),
  ReferenceArea: ({ x2 }: { x2: number }) => (
    <span data-testid="context-span" data-end={x2} />
  ),
  ReferenceLine: ({ x }: { x: number }) => (
    <span data-testid="meal-marker" data-time={x} />
  ),
  Line: ({ connectNulls }: { connectNulls?: boolean }) => (
    <span
      data-testid="glucose-line"
      data-connect-nulls={String(connectNulls)}
    />
  ),
  XAxis: ({ domain }: { domain: number[] }) => (
    <span data-testid="time-window">{JSON.stringify(domain)}</span>
  ),
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));
const mealsQuery = jest.mocked(useGlucoseContext);
beforeEach(() =>
  mealsQuery.mockReturnValue({
    data: { events: [], unavailable: [] },
    isError: false,
  } as unknown as ReturnType<typeof useGlucoseContext>)
);
const query = jest.mocked(useHealthMetricSamples);
const samples = [
  { t: '2026-11-03T10:00:00Z', mmol_l: 5 },
  { t: '2026-11-03T10:05:00Z', mmol_l: 6 },
  { t: '2026-11-03T11:00:00Z', mmol_l: 7 },
];
const result = (data: unknown[], state = {}) =>
  ({ data, isLoading: false, isError: false, ...state }) as ReturnType<
    typeof useHealthMetricSamples
  >;

it('plots actual instants, leaves sensor gaps, and converts display units', () => {
  query.mockReturnValue(
    result([{ metric: 'blood_glucose', source_provider: 'mobile', samples }])
  );
  const { rerender } = render(
    <GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />
  );
  expect(query).toHaveBeenCalledWith(
    'blood_glucose',
    '2026-11-01',
    '2026-11-05'
  );
  const points = () =>
    JSON.parse(screen.getByTestId('points').textContent || '[]') as Array<{
      time: number;
      value: number | null;
    }>;
  expect(points().map((p) => p.value)).toEqual([5, 6, null, 7]);
  expect(
    screen.getByTestId('glucose-line').getAttribute('data-connect-nulls')
  ).toBe('false');
  jest
    .mocked(usePreferences)
    .mockReturnValueOnce({ ...usePreferences(), glucoseUnit: 'mg/dL' });
  rerender(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(screen.queryByLabelText('Unit')).not.toBeInTheDocument();
  expect(points()[0]?.value).toBeCloseTo(90.09);
});

it('keeps providers separate', () => {
  query.mockReturnValue(
    result([
      { metric: 'blood_glucose', source_provider: 'a', samples },
      {
        metric: 'blood_glucose',
        source_provider: 'b',
        samples: [{ ...samples[0], mmol_l: 10 }],
      },
    ])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Source' }));
  fireEvent.click(screen.getByRole('option', { name: 'b' }));
  expect(JSON.parse(screen.getByTestId('points').textContent || '[]')).toEqual([
    { time: Date.parse(samples[0]!.t), value: 10 },
  ]);
});

it('explains how to import when the selected period has no data', () => {
  query.mockReturnValue(result([]));
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(screen.getByText(/Enable Dexcom sharing/)).toBeInTheDocument();
});

it('shows an error instead of an empty success state', () => {
  query.mockReturnValue(result([], { isError: true }));
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load glucose');
});

it('keeps two Apple Health writer apps separate within the same provider', () => {
  query.mockReturnValue(
    result([
      {
        metric: 'blood_glucose',
        source_provider: 'mobile',
        samples: [
          { ...samples[0], source_bundle_id: 'dexcom', mmol_l: 5 },
          { ...samples[0], source_bundle_id: 'other', mmol_l: 10 },
        ],
      },
    ])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(
    JSON.parse(screen.getByTestId('points').textContent || '[]')[0].value
  ).toBe(5);
  fireEvent.click(screen.getByRole('combobox', { name: 'Source' }));
  fireEvent.click(screen.getByRole('option', { name: 'mobile · other' }));
  expect(
    JSON.parse(screen.getByTestId('points').textContent || '[]')[0].value
  ).toBe(10);
});

it('overlays meal times and shows foods eaten, without positioning untimed foods', () => {
  mealsQuery.mockReturnValue({
    data: {
      events: [
        {
          id: 'meal1',
          kind: 'meal',
          day: '2026-11-03',
          start: '2026-11-03T10:00:00Z',
          label: 'Oatmeal',
        },
        {
          id: 'meal2',
          kind: 'meal',
          day: '2026-11-03',
          label: 'Untimed snack',
        },
      ],
      unavailable: [],
    },
    isError: false,
  } as unknown as ReturnType<typeof useGlucoseContext>);
  query.mockReturnValue(
    result([{ metric: 'blood_glucose', source_provider: 'mobile', samples }])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(screen.getAllByTestId('meal-marker')).toHaveLength(1);
  expect(screen.getByTestId('meal-marker')).toHaveAttribute(
    'data-time',
    String(Date.parse('2026-11-03T10:00:00Z'))
  );
  expect(screen.getAllByText(/Oatmeal/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Untimed snack/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Food'));
  expect(screen.queryByTestId('meal-marker')).not.toBeInTheDocument();
});

it('shows exercise start and end as a span', () => {
  mealsQuery.mockReturnValue({
    data: {
      events: [
        {
          id: 'exercise1',
          kind: 'exercise',
          day: '2026-11-03',
          start: '2026-11-03T10:00:00Z',
          end: '2026-11-03T10:30:00Z',
          label: 'Walk',
        },
      ],
      unavailable: [],
    },
    isError: false,
  } as unknown as ReturnType<typeof useGlucoseContext>);
  query.mockReturnValue(
    result([{ metric: 'blood_glucose', source_provider: 'mobile', samples }])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(screen.getByTestId('context-span')).toHaveAttribute(
    'data-end',
    String(Date.parse('2026-11-03T10:30:00Z'))
  );
  expect(screen.getAllByText(/Walk/).length).toBeGreaterThan(0);
});

it('zooms, pans and resets the visible time window', () => {
  query.mockReturnValue(
    result([{ metric: 'blood_glucose', source_provider: 'mobile', samples }])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  const window = () =>
    JSON.parse(
      screen.getByTestId('time-window').textContent || '[]'
    ) as number[];
  const original = window();
  fireEvent.click(screen.getByText('Zoom in'));
  expect(window()[1]! - window()[0]!).toBe((original[1]! - original[0]!) / 2);
  const zoomed = window();
  fireEvent.click(screen.getByText('Later'));
  expect(window()[0]).toBeGreaterThan(zoomed[0]!);
  fireEvent.click(screen.getByText('Reset zoom'));
  expect(window()).toEqual(original);
});

it('keeps the event list synchronized with the zoomed time interval', () => {
  mealsQuery.mockReturnValue({
    data: {
      events: [
        {
          id: 'lunch',
          kind: 'meal',
          day: '2026-11-03',
          start: '2026-11-03T12:30:00Z',
          label: 'Lunch in view',
        },
        {
          id: 'walk',
          kind: 'exercise',
          day: '2026-11-03',
          start: '2026-11-03T15:30:00Z',
          end: '2026-11-03T16:15:00Z',
          label: 'Later walk',
        },
      ],
      unavailable: [],
    },
    isError: false,
  } as unknown as ReturnType<typeof useGlucoseContext>);
  query.mockReturnValue(
    result([{ metric: 'blood_glucose', source_provider: 'mobile', samples }])
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  fireEvent.click(screen.getByText('Zoom in'));
  fireEvent.click(screen.getByText('Zoom in'));
  const list = screen.getByRole('region', { name: 'Events in view' });
  expect(list).toHaveTextContent('Lunch in view');
  expect(list).not.toHaveTextContent('Later walk');
  fireEvent.click(screen.getByText('Later'));
  expect(list).toHaveTextContent('Later walk');
});

it('finds a local-day reading stored in an adjacent bucket after a timezone change', () => {
  jest
    .mocked(usePreferences)
    .mockReturnValueOnce({ ...usePreferences(), timezone: 'America/New_York' });
  const row = {
    metric: 'blood_glucose',
    entry_date: '2026-11-04',
    source_provider: 'Apple Health',
    samples: [
      { t: '2026-11-04T01:00:00Z', mmol_l: 6 },
      { t: '2026-11-03T01:00:00Z', mmol_l: 9 },
    ],
  };
  query.mockImplementation((_metric, start, end) =>
    result(
      start <= row.entry_date && (end ?? start) >= row.entry_date ? [row] : []
    )
  );
  render(<GlucoseCard startDate="2026-11-03" endDate="2026-11-03" />);
  expect(JSON.parse(screen.getByTestId('points').textContent || '[]')).toEqual([
    { time: Date.parse('2026-11-04T01:00:00Z'), value: 6 },
  ]);
});

it('keeps an observation imported two stored dates away in the current account day', () => {
  jest
    .mocked(usePreferences)
    .mockReturnValueOnce({ ...usePreferences(), timezone: 'Etc/GMT+12' });
  query.mockReturnValue(
    result([
      {
        metric: 'blood_glucose',
        entry_date: '2026-11-04',
        source_provider: 'watch',
        samples: [{ t: '2026-11-03T10:30:00Z', mmol_l: 5 }],
      },
    ])
  );
  render(<GlucoseCard startDate="2026-11-02" endDate="2026-11-02" />);
  expect(query).toHaveBeenCalledWith(
    'blood_glucose',
    '2026-10-31',
    '2026-11-04'
  );
  expect(JSON.parse(screen.getByTestId('points').textContent || '[]')).toEqual([
    { time: Date.parse('2026-11-03T10:30:00Z'), value: 5 },
  ]);
});
