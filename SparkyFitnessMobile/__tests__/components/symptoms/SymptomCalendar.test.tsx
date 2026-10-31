import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { SymptomEntryResponse } from '@workspace/shared';
import SymptomCalendar from '../../../src/components/symptoms/SymptomCalendar';
import {
  useSymptomEntriesDetailed,
  useSymptomFreeDays,
} from '../../../src/hooks/useSymptoms';

jest.mock('../../../src/hooks/useSymptoms', () => ({
  useSymptomEntriesDetailed: jest.fn(),
  useSymptomFreeDays: jest.fn(),
}));

const mockUseSymptomEntriesDetailed =
  useSymptomEntriesDetailed as jest.MockedFunction<
    typeof useSymptomEntriesDetailed
  >;
const mockUseSymptomFreeDays = useSymptomFreeDays as jest.MockedFunction<
  typeof useSymptomFreeDays
>;

const entry = (fields: Partial<SymptomEntryResponse>) =>
  ({
    started_at: null,
    ended_at: null,
    severity: 8,
    peak_severity: 8,
    source: 'manual',
    ...fields,
  }) as SymptomEntryResponse;

function renderCalendar(
  entries: SymptomEntryResponse[],
  { timezone = 'UTC' } = {}
) {
  mockUseSymptomEntriesDetailed.mockReturnValue({
    entries,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useSymptomEntriesDetailed>);
  return render(
    <SymptomCalendar
      selectedDate={null}
      initialDate="2026-10-20"
      onSelectDate={jest.fn()}
      timezone={timezone}
    />
  );
}

describe('SymptomCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Today is 29 October 2026 in UTC.
    jest.useFakeTimers({ now: new Date('2026-10-29T12:00:00.000Z') });
    mockUseSymptomFreeDays.mockReturnValue({
      freeDays: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useSymptomFreeDays>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks for the episodes that overlap the month, not only those logged in it', () => {
    renderCalendar([]);
    expect(mockUseSymptomEntriesDetailed).toHaveBeenCalledWith({
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
      overlapping: true,
    });
  });

  it('marks every day an episode covers, from its start to its end', () => {
    const screen = renderCalendar([
      entry({
        entry_date: '2026-10-12',
        started_at: '2026-10-12T21:00:00.000Z',
        ended_at: '2026-10-14T09:00:00.000Z',
      }),
    ]);
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-14']) {
      expect(screen.getByLabelText(`${day}, Severe`)).toBeTruthy();
    }
    expect(screen.getByLabelText('2026-10-11')).toBeTruthy();
    expect(screen.getByLabelText('2026-10-15')).toBeTruthy();
  });

  it('marks an episode still going up to today and no further', () => {
    const screen = renderCalendar([
      entry({
        entry_date: '2026-10-27',
        started_at: '2026-10-27T10:00:00.000Z',
        severity: 4,
        peak_severity: 4,
      }),
    ]);
    for (const day of ['2026-10-27', '2026-10-28', '2026-10-29']) {
      expect(screen.getByLabelText(`${day}, Mild to moderate`)).toBeTruthy();
    }
    expect(screen.getByLabelText('2026-10-30')).toBeTruthy();
  });

  it('reads today again when the month changes after midnight', () => {
    const screen = renderCalendar([
      entry({
        entry_date: '2026-10-30',
        started_at: '2026-10-30T10:00:00.000Z',
      }),
    ]);
    jest.setSystemTime(new Date('2026-11-01T08:00:00.000Z'));
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByLabelText('2026-11-01, Severe')).toBeTruthy();
    expect(screen.getByLabelText('2026-11-02')).toBeTruthy();
  });

  it('places the end of an episode on a day in the profile timezone', () => {
    // 02:00 UTC on the 15th is still the evening of the 14th in New York.
    const screen = renderCalendar(
      [
        entry({
          entry_date: '2026-10-13',
          started_at: '2026-10-13T14:00:00.000Z',
          ended_at: '2026-10-15T02:00:00.000Z',
        }),
      ],
      { timezone: 'America/New_York' }
    );
    expect(screen.getByLabelText('2026-10-14, Severe')).toBeTruthy();
    expect(screen.getByLabelText('2026-10-15')).toBeTruthy();
  });
});
