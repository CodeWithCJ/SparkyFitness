import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import MoodChart from '@/pages/Reports/MoodChart';
import type { MoodEntry } from '@/types/mood';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string, options?: { count?: number }) =>
      (defaultValue ?? _key).replace('{{count}}', String(options?.count ?? '')),
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (d: string) => d,
    chartScaleMode: 'auto',
  }),
}));

interface ScatterPoint {
  date: string;
  moodValue: number;
  checkinCount: number;
}
interface TagPoint {
  label: string;
  count: number;
}

let scatterData: ScatterPoint[] = [];
let barData: TagPoint[] = [];

jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    ScatterChart: Passthrough,
    BarChart: ({
      data,
      children,
    }: {
      data: TagPoint[];
      children?: ReactNode;
    }) => {
      barData = data;
      return <div>{children}</div>;
    },
    Scatter: ({ data }: { data: ScatterPoint[] }) => {
      scatterData = data;
      return null;
    },
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const row = (over: Partial<MoodEntry>): MoodEntry => ({
  id: 'id',
  user_id: 'u',
  mood_value: null,
  mood_tags: [],
  notes: null,
  energy_value: null,
  focus_value: null,
  entry_date: '2026-10-01',
  entry_timestamp: '2026-10-01T12:00:00.000Z',
  source: 'manual',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
  ...over,
});

const renderChart = (data: MoodEntry[]) =>
  render(<MoodChart data={data} title="Mood" />);

beforeEach(() => {
  scatterData = [];
  barData = [];
});

describe('MoodChart', () => {
  it("plots one point per day: the mean of that day's check-ins", () => {
    renderChart([
      row({ id: 'a', mood_value: 40 }),
      row({ id: 'b', mood_value: 80 }),
    ]);

    expect(scatterData).toHaveLength(1);
    expect(scatterData[0]).toMatchObject({
      date: '2026-10-01',
      moodValue: 60,
      checkinCount: 2,
    });
  });

  it('plots nothing for a day whose check-ins have no mood', () => {
    renderChart([row({ energy_value: 4 }), row({ id: 'b', notes: 'tired' })]);

    expect(scatterData).toEqual([]);
  });

  it('charts a Garmin-only day at the Garmin value', () => {
    renderChart([row({ source: 'garmin', mood_value: 30 })]);

    expect(scatterData).toHaveLength(1);
    expect(scatterData[0]).toMatchObject({ moodValue: 30, checkinCount: 0 });
  });

  it('counts no check-ins on a day plotted from Garmin while its manual ones have no mood', () => {
    renderChart([
      row({ id: 'g', source: 'garmin', mood_value: 30 }),
      row({ id: 'a', energy_value: 3 }),
      row({ id: 'b', notes: 'tired' }),
    ]);

    expect(scatterData).toHaveLength(1);
    expect(scatterData[0]).toMatchObject({ moodValue: 30, checkinCount: 0 });
  });

  it('prefers the manual mood over Garmin on the same day', () => {
    renderChart([
      row({ id: 'g', source: 'garmin', mood_value: 30 }),
      row({ id: 'm', mood_value: 70 }),
    ]);

    expect(scatterData).toHaveLength(1);
    expect(scatterData[0]?.moodValue).toBe(70);
  });

  it('counts tags across every check-in in range', () => {
    renderChart([
      row({ id: 'a', mood_value: 40, mood_tags: ['happy', 'calm'] }),
      row({ id: 'b', mood_value: 80, mood_tags: ['happy'] }),
      row({ id: 'c', energy_value: 5, mood_tags: ['happy'] }),
    ]);

    expect(barData).toHaveLength(2);
    expect(barData[0]?.count).toBe(3);
    expect(barData[1]?.count).toBe(1);
  });
});
