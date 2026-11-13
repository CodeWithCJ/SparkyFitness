import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SleepEntry } from '@/types';
import DailyLogPanel from '@/pages/Cycle/DailyLogPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      typeof options === 'string' ? options : (options?.defaultValue ?? key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

jest.mock('@/hooks/useCycle', () => ({
  useUpsertDailyLogMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useCycleSettings: () => ({ data: undefined }),
  useDisplayPreferences: () => ({ data: undefined }),
  useUpsertDisplayPreferencesMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useLatestCheckInMeasurements: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('@/hooks/Diary/useWaterIntake', () => ({
  useWaterIntakeQuery: () => ({ data: 0, isLoading: false }),
}));
const mockSleep: { current: Partial<SleepEntry>[] } = { current: [] };
jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({ data: mockSleep.current, isLoading: false }),
}));
jest.mock('@/pages/Cycle/CycleSymptomPicker', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Cycle/ttc/IntercourseLog', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Cycle/ttc/CervicalPositionPicker', () => ({
  __esModule: true,
  default: () => null,
}));

function night(
  source: string,
  bedtime: string,
  wakeTime: string,
  stageTypes: string[] = []
): Partial<SleepEntry> {
  const duration =
    (new Date(wakeTime).getTime() - new Date(bedtime).getTime()) / 1000;
  return {
    entry_date: '2026-10-24',
    source,
    bedtime,
    wake_time: wakeTime,
    duration_in_seconds: duration,
    time_asleep_in_seconds: duration,
    stage_events: stageTypes.map((stage_type, i) => ({
      id: String(i),
      entry_id: source,
      stage_type: stage_type as 'light' | 'deep' | 'rem' | 'awake',
      start_time: bedtime,
      end_time: wakeTime,
      duration_in_seconds: duration / stageTypes.length,
    })),
  };
}

describe('DailyLogPanel sleep total', () => {
  it('counts a night two sources recorded once', () => {
    mockSleep.current = [
      night('Google Health', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z'),
      night('Health Connect', '2026-10-23T23:00:00Z', '2026-10-24T07:00:00Z', [
        'light',
        'deep',
      ]),
    ];
    render(<DailyLogPanel date="2026-10-24" log={null} />);
    expect(screen.getByText('8.0 hrs')).toBeInTheDocument();
  });
});
