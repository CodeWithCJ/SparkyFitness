import { render } from '@testing-library/react';
import type { CombinedSleepData, SleepEntry } from '@/types';
import SleepReport from '@/pages/Reports/SleepReport';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      options?: string | ({ defaultValue?: string } & Record<string, unknown>)
    ) => {
      if (typeof options === 'string') return options;
      return (options?.defaultValue ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_, name: string) => String(options?.[name])
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: string) => date,
    dateFormat: 'yyyy-MM-dd',
    timeFormat: '24h',
    timezone: 'UTC',
  }),
}));

const mockEntries: { current: SleepEntry[] } = { current: [] };
jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({ data: mockEntries.current, isLoading: false }),
}));
jest.mock('@/hooks/SleepScience/useSleepScience', () => ({
  useSleepDebtQuery: () => ({ data: undefined, isLoading: false }),
}));

const mockTable: { combinedSleepData: CombinedSleepData[] } = {
  combinedSleepData: [],
};
jest.mock('@/pages/Reports/SleepAnalyticsTable', () => ({
  __esModule: true,
  default: (props: { combinedSleepData: CombinedSleepData[] }) => {
    mockTable.combinedSleepData = props.combinedSleepData;
    return null;
  },
}));
jest.mock('@/pages/Reports/SleepAnalyticsCharts', () => ({
  __esModule: true,
  default: () => null,
}));

function entry(
  id: string,
  source: string,
  bedtime: string,
  wakeTime: string,
  stageTypes: string[] = []
): SleepEntry {
  const duration =
    (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000;
  return {
    id,
    user_id: 'user-1',
    entry_date: '2026-10-24',
    bedtime,
    wake_time: wakeTime,
    duration_in_seconds: duration,
    time_asleep_in_seconds: duration - 1800,
    sleep_score: 80,
    source,
    created_at: bedtime,
    updated_at: bedtime,
    deep_sleep_seconds: null,
    light_sleep_seconds: null,
    rem_sleep_seconds: null,
    awake_sleep_seconds: null,
    average_spo2_value: null,
    lowest_spo2_value: null,
    highest_spo2_value: null,
    average_respiration_value: null,
    lowest_respiration_value: null,
    highest_respiration_value: null,
    awake_count: null,
    avg_sleep_stress: null,
    restless_moments_count: null,
    avg_overnight_hrv: null,
    body_battery_change: null,
    resting_heart_rate: null,
    stage_events: stageTypes.map((stage_type, i) => ({
      id: `${id}-${i}`,
      entry_id: id,
      stage_type: stage_type as 'light' | 'deep' | 'rem' | 'awake',
      start_time: bedtime,
      end_time: wakeTime,
      duration_in_seconds: duration / stageTypes.length,
    })),
  };
}

describe('SleepReport with the same night from two sources', () => {
  it('shows the night once, from the more detailed record', () => {
    mockEntries.current = [
      entry(
        'gh',
        'Google Health',
        '2026-10-23T23:05:00Z',
        '2026-10-24T06:55:00Z'
      ),
      entry(
        'hc',
        'Health Connect',
        '2026-10-23T23:00:00Z',
        '2026-10-24T07:00:00Z',
        ['light', 'deep', 'rem', 'awake']
      ),
    ];

    render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

    const [day] = mockTable.combinedSleepData;
    expect(day?.sleepAnalyticsData.totalSleepDuration).toBe(8 * 3600);
    expect(day?.sleepEntry.source).toBe('Health Connect');
  });

  it('still adds a nap from another source', () => {
    mockEntries.current = [
      entry(
        'hc',
        'Health Connect',
        '2026-10-23T23:00:00Z',
        '2026-10-24T07:00:00Z'
      ),
      entry(
        'gh',
        'Google Health',
        '2026-10-24T13:00:00Z',
        '2026-10-24T14:00:00Z'
      ),
    ];

    render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

    const [day] = mockTable.combinedSleepData;
    expect(day?.sleepAnalyticsData.totalSleepDuration).toBe(9 * 3600);
    expect(day?.sleepEntry.source).toBe('2 Sessions');
  });
});
