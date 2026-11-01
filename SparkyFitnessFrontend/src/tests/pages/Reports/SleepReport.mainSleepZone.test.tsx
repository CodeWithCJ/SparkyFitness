import { fireEvent, render, screen } from '@testing-library/react';
import type { SleepAnalyticsData, SleepEntry } from '@/types';
import SleepReport from '@/pages/Reports/SleepReport';
import { mainSleepZone } from '@/utils/timeFormatters';

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
    timeFormat: 'HH:mm',
    timezone: 'UTC',
  }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), info: jest.fn() },
}));

const mockEntries: { current: SleepEntry[] } = { current: [] };
jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({ data: mockEntries.current, isLoading: false }),
}));
jest.mock('@/hooks/SleepScience/useSleepScience', () => ({
  useSleepDebtQuery: () => ({ data: { sleepNeed: 8 }, isLoading: false }),
}));

const mockCharts: { sleepAnalyticsData: SleepAnalyticsData[] } = {
  sleepAnalyticsData: [],
};
jest.mock('@/pages/Reports/SleepAnalyticsCharts', () => ({
  __esModule: true,
  default: (props: { sleepAnalyticsData: SleepAnalyticsData[] }) => {
    mockCharts.sleepAnalyticsData = props.sleepAnalyticsData;
    return null;
  },
}));

function entry(
  id: string,
  bedtime: string,
  wakeTime: string,
  recordTimezone: string
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
    record_timezone: recordTimezone,
    stage_events: [],
  };
}

// A travel day: a nap recorded in Tokyo before the night recorded in New
// York. The nap has the earlier bedtime, so it sets the day zone, but the
// day's bed and wake times are the night's and must read in its zone:
// 03:00Z-10:00Z is 23:00-06:00 in New York (EDT), 12:00-19:00 in Tokyo.
const NAP = entry(
  'nap',
  '2026-10-23T05:00:00Z',
  '2026-10-23T05:45:00Z',
  'Asia/Tokyo'
);
const NIGHT = entry(
  'night',
  '2026-10-24T03:00:00Z',
  '2026-10-24T10:00:00Z',
  'America/New_York'
);

describe('SleepReport main sleep zone', () => {
  beforeEach(() => {
    mockEntries.current = [NAP, NIGHT];
  });

  it('keeps the day zone for stages and gives bed and wake times the main sleep zone', () => {
    render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

    expect(mockCharts.sleepAnalyticsData).toHaveLength(1);
    const [day] = mockCharts.sleepAnalyticsData;
    expect(day?.record_timezone).toBe('Asia/Tokyo');
    expect(day?.main_record_timezone).toBe('America/New_York');
    expect(day?.mainBedtime).toBe(NIGHT.bedtime);
    expect(mainSleepZone(day ?? {}, 'UTC')).toEqual({
      kind: 'tz',
      tz: 'America/New_York',
    });
  });

  it('shows the table bed and wake times in the main sleep zone', () => {
    render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);

    expect(screen.getByText('23:00')).toBeTruthy();
    expect(screen.getByText('06:00')).toBeTruthy();
    expect(screen.queryByText('12:00')).toBeNull();
    expect(screen.queryByText('19:00')).toBeNull();
  });

  it('exports the bed and wake times in the main sleep zone', () => {
    const parts: string[] = [];
    const RealBlob = global.Blob;
    global.Blob = class {
      constructor(blobParts: string[]) {
        parts.push(...blobParts);
      }
    } as unknown as typeof Blob;
    const createObjectURL = jest.fn(() => 'blob:csv');
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      render(<SleepReport startDate="2026-10-24" endDate="2026-10-24" />);
      // The report's own button and the table's both export the same rows.
      const [exportButton] = screen.getAllByText('Export to CSV');
      fireEvent.click(exportButton!);

      const [, row] = parts.join('').split('\n');
      expect(row).toMatch(/^"2026-10-24","23:00","06:00",/);
    } finally {
      global.Blob = RealBlob;
      click.mockRestore();
    }
  });
});

describe('mainSleepZone', () => {
  it('reads the main sleep fields, not the day zone', () => {
    expect(
      mainSleepZone(
        {
          main_record_timezone: null,
          main_record_utc_offset_minutes: -300,
        },
        'UTC'
      )
    ).toEqual({ kind: 'offset', minutes: -300 });
  });

  it('falls back to the profile timezone when the main sleep has no zone', () => {
    expect(mainSleepZone({}, 'Europe/Paris')).toEqual({
      kind: 'tz',
      tz: 'Europe/Paris',
    });
  });
});
