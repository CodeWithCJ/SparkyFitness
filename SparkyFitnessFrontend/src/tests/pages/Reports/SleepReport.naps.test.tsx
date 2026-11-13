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
  useSleepDebtQuery: () => ({ data: { sleepNeed: 8 }, isLoading: false }),
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

function entry(id: string, bedtime: string, wakeTime: string): SleepEntry {
  const duration =
    (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000;
  return {
    id,
    user_id: 'user-1',
    entry_date: '2026-10-24',
    bedtime,
    wake_time: wakeTime,
    duration_in_seconds: duration,
    time_asleep_in_seconds: duration,
    sleep_score: 80,
    source: 'HealthKit',
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
    stage_events: [],
  };
}

// Issue #3259: a nap is its own entry on the night's day (#3243), and the
// day row showed the nap's end as the wake time.
const NIGHT = entry('night', '2026-10-23T23:00:00Z', '2026-10-24T06:00:00Z');
const NAP = entry('nap', '2026-10-24T13:30:00Z', '2026-10-24T14:15:00Z');

describe('SleepReport with a nap on the same day as the night', () => {
  it.each([
    ['night first', [NIGHT, NAP]],
    ['nap first', [NAP, NIGHT]],
  ])(
    'shows the night as bedtime and wake time (%s)',
    (_order, entries: SleepEntry[]) => {
      mockEntries.current = entries;

      render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

      expect(mockTable.combinedSleepData).toHaveLength(1);
      const [day] = mockTable.combinedSleepData;
      expect(day?.sleepEntry.source).toBe('2 Sessions');
      expect(day?.sleepEntry.bedtime).toBe(NIGHT.bedtime);
      expect(day?.sleepEntry.wake_time).toBe(NIGHT.wake_time);
      expect(day?.sleepAnalyticsData.mainBedtime).toBe(NIGHT.bedtime);
      expect(day?.sleepAnalyticsData.mainWakeTime).toBe(NIGHT.wake_time);
    }
  );

  it('still counts the nap in the time asleep and the day debt', () => {
    mockEntries.current = [NIGHT, NAP];

    render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

    const [day] = mockTable.combinedSleepData;
    expect(day?.sleepAnalyticsData.timeAsleep).toBe(7.75 * 3600);
    expect(day?.sleepAnalyticsData.sleepDebt).toBeCloseTo(0.25, 5);
  });
});
