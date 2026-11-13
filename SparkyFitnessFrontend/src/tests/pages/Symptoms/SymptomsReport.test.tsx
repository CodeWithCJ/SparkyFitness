import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SymptomEpisodeContext } from '@workspace/shared';
import SymptomsReport from '@/pages/Symptoms/SymptomsReport';
import {
  ID,
  ID2,
  hookState,
  makeEntry,
  resetSymptomHooks,
} from './symptomTestKit';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string,
      options?: Record<string, string | number>
    ) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(options?.[name] ?? '')
      ),
  }),
}));

jest.mock('@/hooks/useSymptoms', () =>
  jest.requireActual('./symptomTestKit').buildHooksMock()
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatTime: (d: string | Date) => new Date(d).toISOString().slice(11, 16),
    formatDateInUserTimezone: (d: string | Date) =>
      new Date(d).toISOString().slice(0, 10),
  }),
}));

const unparse = jest.fn((_rows: unknown[]) => 'csv');
jest.mock('papaparse', () => ({
  __esModule: true,
  default: { unparse: (rows: unknown[]) => unparse(rows) },
}));

// Recharts needs a laid-out container; the chart itself is not what is tested.
jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

const episode = (id: string, day: string, over = {}) =>
  makeEntry({
    id,
    symptom_name_snapshot: 'Migraine',
    entry_date: day,
    started_at: `${day}T09:00:00.000Z`,
    ended_at: `${day}T12:30:00.000Z`,
    logged_at: `${day}T09:00:00.000Z`,
    peak_severity: 8,
    severity: 6,
    ...over,
  });

const contextFor = (
  id: string,
  over: Partial<SymptomEpisodeContext> = {}
): SymptomEpisodeContext => ({
  entry_id: id,
  sleep: {
    minutes: 310,
    bedtime: '2026-09-28T23:30:00Z',
    wake_time: '2026-09-29T04:40:00Z',
  },
  days: [
    {
      date: '2026-09-28',
      label: 'day_before',
      foods: ['Porridge', 'Red wine'],
      water_ml: 1200,
      steps: 6300,
      workouts: [],
    },
    {
      date: '2026-09-29',
      label: 'day_of',
      foods: [],
      water_ml: null,
      steps: null,
      workouts: [],
    },
  ],
  medications: [],
  cycle: null,
  ...over,
});

const table = () => screen.getByRole('table', { name: 'Recent episodes' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);

const renderReport = () =>
  render(<SymptomsReport startDate="2026-09-01" endDate="2026-09-30" />);

beforeEach(() => {
  resetSymptomHooks();
  unparse.mockClear();
});

describe('SymptomsReport', () => {
  it('shows the headline numbers', () => {
    hookState.entries = [
      episode('a', '2026-09-29'),
      episode('b', '2026-09-17', {
        treatments: [
          {
            id: 't',
            user_id: ID2,
            symptom_entry_id: 'b',
            kind: 'medication',
            medication_id: null,
            medication_entry_id: null,
            name_snapshot: 'Ibuprofen',
            dose_snapshot: null,
            taken_at: null,
            effectiveness: null,
            notes: null,
            created_at: '2026-09-17T10:00:00.000Z',
          },
        ],
      }),
    ];
    hookState.freeDays = [{ id: 'f', entry_date: '2026-09-10' }];
    renderReport();
    const tile = (label: string) =>
      screen.getByText(label).previousElementSibling as HTMLElement;
    expect(tile('Symptom days')).toHaveTextContent('2');
    expect(tile('Episodes')).toHaveTextContent('2');
    expect(tile('Symptom-free days')).toHaveTextContent('1');
    expect(tile('Average episode')).toHaveTextContent('3 h 30 m');
    expect(tile('Days with medication')).toHaveTextContent('1');
  });

  it('says so when there is nothing in the range', () => {
    renderReport();
    expect(
      screen.getByText(/No episodes in this date range/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Print for a doctor' })
    ).toBeDisabled();
  });

  it('puts what the diary holds beside each episode', () => {
    hookState.entries = [
      episode('a', '2026-09-29', {
        body_locations: ['Behind left eye'],
        triggers: ['Poor sleep'],
        treatments: [
          {
            id: 't',
            user_id: ID2,
            symptom_entry_id: 'a',
            kind: 'medication',
            medication_id: null,
            medication_entry_id: null,
            name_snapshot: 'Sumatriptan',
            dose_snapshot: null,
            taken_at: null,
            effectiveness: 'full',
            notes: null,
            created_at: '2026-09-29T09:50:00.000Z',
          },
        ],
      }),
    ];
    hookState.contexts = { a: contextFor('a') };
    renderReport();
    const row = bodyRows()[0] as HTMLElement;
    expect(row).toHaveTextContent('2026-09-29');
    expect(row).toHaveTextContent('3 h 30 m');
    expect(row).toHaveTextContent('8');
    expect(row).toHaveTextContent('Behind left eye');
    expect(row).toHaveTextContent('Poor sleep');
    expect(row).toHaveTextContent('Sumatriptan');
    expect(row).toHaveTextContent('Helped');
    expect(row).toHaveTextContent('5 h 10 m');
    expect(row).toHaveTextContent('Porridge, Red wine');
    expect(row).toHaveTextContent('1.2 L');
  });

  it('shows a dash where the diary has nothing', () => {
    hookState.entries = [episode('a', '2026-09-29')];
    hookState.contexts = {
      a: contextFor('a', { sleep: null, days: [] }),
    };
    renderReport();
    const row = bodyRows()[0] as HTMLElement;
    expect(within(row).getAllByText('–').length).toBeGreaterThanOrEqual(4);
  });

  it('marks an episode that is still running', () => {
    hookState.entries = [episode('a', '2026-09-29', { ended_at: null })];
    renderReport();
    expect(screen.getAllByText('ongoing').length).toBeGreaterThan(0);
  });

  it('leaves out cycle-hub entries', () => {
    hookState.entries = [
      episode('a', '2026-09-29', {
        source: 'cycle',
        symptom_name_snapshot: 'Cramps',
      }),
    ];
    renderReport();
    expect(
      screen.getByText(/No episodes in this date range/)
    ).toBeInTheDocument();
  });

  it('shows the last episodes first and can show fewer', () => {
    hookState.entries = Array.from({ length: 8 }, (_, i) =>
      episode(`e${i}`, `2026-09-${String(10 + i).padStart(2, '0')}`)
    );
    renderReport();
    expect(bodyRows()).toHaveLength(8);
    expect(bodyRows()[0]).toHaveTextContent('2026-09-17');
    expect(bodyRows()[7]).toHaveTextContent('2026-09-10');
  });

  it('warns that a pattern needs more episodes', () => {
    hookState.entries = [episode('a', '2026-09-29', { triggers: ['Stress'] })];
    renderReport();
    expect(
      screen.getByText(
        /Not enough episodes yet to read a pattern \(at least 7\)/
      )
    ).toBeInTheDocument();
  });

  it('drops that warning once there are enough episodes', () => {
    hookState.entries = Array.from({ length: 7 }, (_, i) =>
      episode(`e${i}`, `2026-09-${String(10 + i).padStart(2, '0')}`, {
        triggers: ['Stress'],
      })
    );
    renderReport();
    expect(
      screen.queryByText(/Not enough episodes yet/)
    ).not.toBeInTheDocument();
  });

  it('lists what came before, as counts and without claiming a cause', () => {
    hookState.entries = [
      episode('a', '2026-09-29', { triggers: ['Stress'] }),
      episode('b', '2026-09-17', { triggers: ['Stress'] }),
    ];
    hookState.contexts = {
      a: contextFor('a'),
      b: contextFor('b', {
        sleep: { minutes: 480, bedtime: '', wake_time: '' },
      }),
    };
    renderReport();
    const list = screen.getByRole('list', { name: 'What came before' });
    const rowFor = (label: string) =>
      within(list).getByText(label).closest('li') as HTMLElement;
    // Both episodes named Stress; only one of them had a short night.
    expect(rowFor('Stress')).toHaveTextContent('2 of 2');
    expect(rowFor('Slept under 6 hours the night before')).toHaveTextContent(
      '1 of 2'
    );
    expect(screen.getByText(/does not show a cause/)).toBeInTheDocument();
  });

  it('explains how to get factors when there are none', () => {
    hookState.entries = [episode('a', '2026-09-29')];
    renderReport();
    expect(
      screen.getByText(/Add triggers to your episodes/)
    ).toBeInTheDocument();
  });

  it('warns gently at ten days of medication, and not before', () => {
    const med = {
      id: 't',
      user_id: ID2,
      symptom_entry_id: 'x',
      kind: 'medication' as const,
      medication_id: null,
      medication_entry_id: null,
      name_snapshot: 'Ibuprofen',
      dose_snapshot: null,
      taken_at: null,
      effectiveness: null,
      notes: null,
      created_at: '2026-09-01T10:00:00.000Z',
    };
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        episode(`e${i}`, `2026-09-${String(1 + i).padStart(2, '0')}`, {
          treatments: [med],
        })
      );
    hookState.entries = days(9);
    const { unmount } = renderReport();
    expect(screen.queryByText(/not a diagnosis/)).not.toBeInTheDocument();
    unmount();
    hookState.entries = days(10);
    renderReport();
    expect(screen.getByText(/not a diagnosis/)).toBeInTheDocument();
  });

  it('narrows to one symptom', () => {
    hookState.entries = [
      episode('a', '2026-09-29'),
      episode('b', '2026-09-28', { symptom_name_snapshot: 'Back pain' }),
    ];
    renderReport();
    expect(bodyRows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('combobox', { name: 'Symptom' }));
    fireEvent.click(screen.getByRole('option', { name: 'Back pain' }));
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('2026-09-28');
  });

  it('shows the strongest effect on the day beside the peak', () => {
    hookState.entries = [
      episode('a', '2026-09-29', {
        impact: 'mild',
        impact_timeline: [
          { at: '2026-09-29T09:00:00.000Z', impact: 'moderate' },
          { at: '2026-09-29T10:00:00.000Z', impact: 'severe' },
          { at: '2026-09-29T11:00:00.000Z', impact: 'mild' },
        ],
      }),
      episode('b', '2026-09-27'),
    ];
    renderReport();
    expect(
      within(table()).getByRole('columnheader', { name: 'Effect on the day' })
    ).toBeInTheDocument();
    const [withImpact, without] = bodyRows();
    expect(within(withImpact!).getByText('severe')).toBeInTheDocument();
    expect(within(without!).getAllByText('–').length).toBeGreaterThan(0);
    expect(within(without!).queryByText(/mild|moderate|severe/)).toBeNull();
    // Once in the table, once in the printed report for a doctor.
    expect(screen.getAllByText('severe')).toHaveLength(2);
  });

  it('exports the effect on the day and how it changed', () => {
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
    hookState.entries = [
      episode('a', '2026-09-29', {
        impact: 'mild',
        impact_timeline: [
          // The server returns appended points with an offset, not Z.
          { at: '2026-09-29T11:00:00+00:00', impact: 'mild' },
          { at: '2026-09-29T09:00:00.000Z', impact: 'severe' },
        ],
      }),
      episode('b', '2026-09-27', { impact: 'moderate' }),
      episode('c', '2026-09-25'),
    ];
    renderReport();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(unparse.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        peak_impact: 'severe',
        impact_timeline:
          '2026-09-29T09:00:00.000Z severe; 2026-09-29T11:00:00.000Z mild',
      }),
      expect.objectContaining({
        peak_impact: 'moderate',
        impact_timeline: '2026-09-27T09:00:00.000Z moderate',
      }),
      expect.objectContaining({ peak_impact: '', impact_timeline: '' }),
    ]);
  });

  it('exports the episodes with their context to CSV', () => {
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
    hookState.entries = [
      episode('a', '2026-09-29', {
        body_locations: ['Left temple', 'Neck'],
        triggers: ['Stress'],
      }),
    ];
    hookState.contexts = { a: contextFor('a') };
    renderReport();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(unparse).toHaveBeenCalledTimes(1);
    expect(unparse.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        symptom: 'Migraine',
        duration_minutes: 210,
        peak_severity: 8,
        where: 'Left temple; Neck',
        triggers: 'Stress',
        sleep_minutes: 310,
        foods_day_before: 'Porridge; Red wine',
        water_ml_day_before: 1200,
        steps_day_before: 6300,
      }),
    ]);
  });
});

void ID;
