import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SleepEntrySection from '@/pages/CheckIn/SleepEntrySection';

// Issue #2033: a bed/wake edit is typed against the browser clock and must
// relabel record_timezone; a stage-only or no-op save must NOT relabel an
// imported entry's recording zone.

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : String(defaultValue),
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (d: string) => d,
    timeFormat: 'HH:mm',
    timezone: 'UTC',
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

jest.mock('lucide-react', () => ({
  Trash2: () => <span data-testid="icon-delete" />,
  Edit: () => <span data-testid="icon-edit" />,
  Save: () => <span data-testid="icon-save" />,
  X: () => <span data-testid="icon-cancel" />,
}));

// Stub timeline editor: exposes a button that simulates the user dragging
// bed/wake to new times.
jest.mock('@/pages/CheckIn/SleepTimelineEditor', () => ({
  __esModule: true,
  default: ({
    onTimeChange,
  }: {
    onTimeChange?: (b: string, w: string) => void;
  }) => (
    <button
      data-testid="change-times"
      onClick={() => onTimeChange && onTimeChange('21:00', '05:00')}
    >
      change times
    </button>
  ),
}));

const updateMutateAsync = jest.fn().mockResolvedValue(undefined);

const importedEntry = {
  id: 'entry-1',
  user_id: 'user-1',
  entry_date: '2026-08-01',
  bedtime: '2026-08-01T03:00:00.000Z',
  wake_time: '2026-08-01T11:00:00.000Z',
  duration_in_seconds: 28800,
  time_asleep_in_seconds: 27000,
  sleep_score: 80,
  source: 'garmin',
  record_utc_offset_minutes: 120,
  stage_events: [],
};

jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({ data: [importedEntry], isLoading: false }),
  useSaveSleepEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useUpdateSleepEntryMutation: () => ({ mutateAsync: updateMutateAsync }),
  useDeleteSleepEntryMutation: () => ({ mutateAsync: jest.fn() }),
}));

const clickIconButton = (testId: string) => {
  const button = screen.getByTestId(testId).closest('button');
  expect(button).not.toBeNull();
  fireEvent.click(button!);
};

describe('SleepEntrySection existing-entry save and the recording zone', () => {
  beforeEach(() => {
    updateMutateAsync.mockClear();
  });

  it('a no-op save omits record_timezone so imported zone metadata survives', async () => {
    render(<SleepEntrySection selectedDate="2026-08-01" />);

    clickIconButton('icon-edit');
    clickIconButton('icon-save');

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    const { data } = updateMutateAsync.mock.calls[0][0];
    expect(data).not.toHaveProperty('record_timezone');
    expect(data).not.toHaveProperty('record_utc_offset_minutes');
    // Unchanged times pass through as the original instants.
    expect(data.bedtime).toBe(importedEntry.bedtime);
    expect(data.wake_time).toBe(importedEntry.wake_time);
  });

  it('a bed/wake edit stamps the browser IANA zone', async () => {
    render(<SleepEntrySection selectedDate="2026-08-01" />);

    clickIconButton('icon-edit');
    fireEvent.click(screen.getByTestId('change-times'));
    clickIconButton('icon-save');

    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
    const { data } = updateMutateAsync.mock.calls[0][0];
    expect(data.record_timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    // The relabel must also clear a stale imported offset, or precedence
    // metadata contradicts itself on the stored row.
    expect(data.record_utc_offset_minutes).toBeNull();
  });
});
