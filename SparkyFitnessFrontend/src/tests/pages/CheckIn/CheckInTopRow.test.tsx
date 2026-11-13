import type { ComponentProps } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { todayInZone, type MoodCheckinCreateBody } from '@workspace/shared';
import { CheckInTopRow } from '@/pages/CheckIn/CheckInTopRow';
import type { MoodEntry } from '@/types/mood';
import { buildCheckinCreateBody, type CheckinDraft } from '@workspace/shared';

let mockTimezone = 'UTC';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: mockTimezone, timeFormat: 'HH:mm' }),
}));

beforeEach(() => {
  mockTimezone = 'UTC';
});

// The meter shows what the composer holds and offers one way to change it.
jest.mock('@/pages/CheckIn/MoodMeter', () => ({
  __esModule: true,
  default: ({
    mood,
    energy,
    notes,
    onEnergyChange,
  }: {
    mood: number | null;
    energy: number | null;
    notes: string;
    onEnergyChange: (value: number | null) => void;
  }) => (
    <div
      data-testid="mood-meter"
      data-mood={String(mood)}
      data-energy={String(energy)}
      data-notes={notes}
    >
      <button type="button" onClick={() => onEnergyChange(3)}>
        Set energy 3
      </button>
    </div>
  ),
}));

jest.mock('@/pages/CheckIn/HomeDashboardFasting', () => ({
  __esModule: true,
  default: () => <div data-testid="fasting" />,
}));

// A day well in the past, so the composer's default time is noon.
const DAY = '2025-03-14';

const stored: MoodEntry = {
  id: 'e1',
  user_id: 'u1',
  mood_value: 70,
  mood_tags: [],
  notes: 'Walked',
  energy_value: 4,
  focus_value: null,
  entry_date: DAY,
  entry_timestamp: '2025-03-14T09:30:00.000Z',
  source: 'manual',
  created_at: '2025-03-14T09:30:00.000Z',
  updated_at: '2025-03-14T09:30:00.000Z',
};

type Props = ComponentProps<typeof CheckInTopRow>;

const renderRow = (over: Partial<Props> = {}) => {
  const props: Props = {
    selectedDate: DAY,
    checkins: [],
    isLoadingCheckins: false,
    isSavingCheckin: false,
    onCreateCheckin: jest.fn().mockResolvedValue(true),
    onUpdateCheckin: jest.fn().mockResolvedValue(true),
    onDeleteCheckin: jest.fn().mockResolvedValue(true),
    ...over,
  };
  const utils = render(<CheckInTopRow {...props} />);
  const rerender = (next: Partial<Props>) =>
    utils.rerender(<CheckInTopRow {...props} {...next} />);
  return { ...utils, props, rerender };
};

const meter = () => screen.getByTestId('mood-meter');
// The hidden native input behind the browser's time picker: a real way for
// the user to set the time.
const pickTime = (container: HTMLElement, time: string) =>
  fireEvent.change(
    container.querySelector('input[type="time"][aria-hidden="true"]')!,
    { target: { value: time } }
  );
const timeSegments = () =>
  within(screen.getByRole('group', { name: 'Time' }))
    .getAllByRole('spinbutton')
    .map((segment) => segment.textContent);

describe('CheckInTopRow composer', () => {
  test('keeps Save disabled for an empty draft', () => {
    renderRow();
    expect(
      screen.getByRole('heading', { name: 'New check-in' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add check-in' })).toBeDisabled();
  });

  test('"Add check-in" sends the draft to the create handler, then resets', async () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    const add = screen.getByRole('button', { name: 'Add check-in' });
    expect(add).toBeEnabled();

    fireEvent.click(add);

    expect(props.onCreateCheckin).toHaveBeenCalledWith({
      mood: null,
      energy: 3,
      focus: null,
      notes: '',
      tags: [],
      time: '12:00',
    });
    await waitFor(() => expect(meter()).toHaveAttribute('data-energy', 'null'));
    expect(timeSegments()).toEqual(['12', '00']);
  });

  test('keeps the draft when the create fails', async () => {
    const { props } = renderRow({
      onCreateCheckin: jest.fn().mockResolvedValue(false),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add check-in' }));

    await waitFor(() => expect(props.onCreateCheckin).toHaveBeenCalled());
    expect(meter()).toHaveAttribute('data-energy', '3');
  });

  test('keeps Save disabled while a request is pending', () => {
    renderRow({ isSavingCheckin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});

describe('CheckInTopRow editing', () => {
  test('edit loads the check-in with its edit labels, and Cancel leaves', () => {
    renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );

    expect(
      screen.getByRole('heading', { name: 'Edit check-in' })
    ).toBeInTheDocument();
    expect(meter()).toHaveAttribute('data-mood', '70');
    expect(meter()).toHaveAttribute('data-energy', '4');
    expect(meter()).toHaveAttribute('data-notes', 'Walked');
    expect(timeSegments()).toEqual(['09', '30']);
    expect(
      screen.queryByRole('button', { name: 'Add check-in' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save changes' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByRole('heading', { name: 'New check-in' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add check-in' })).toBeDisabled();
    expect(meter()).toHaveAttribute('data-mood', 'null');
    expect(timeSegments()).toEqual(['12', '00']);
  });

  test('"Save changes" sends the check-in and the draft to the update handler', async () => {
    const { props } = renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(props.onUpdateCheckin).toHaveBeenCalledWith(stored, {
      mood: 70,
      energy: 3,
      focus: null,
      notes: 'Walked',
      tags: [],
      time: '09:30',
    });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'New check-in' })
      ).toBeInTheDocument()
    );
  });

  test('changing the date while editing cancels the edit and resets', () => {
    const { props, rerender } = renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );
    expect(
      screen.getByRole('heading', { name: 'Edit check-in' })
    ).toBeInTheDocument();

    rerender({ selectedDate: '2025-03-15', checkins: [] });

    expect(
      screen.getByRole('heading', { name: 'New check-in' })
    ).toBeInTheDocument();
    expect(meter()).toHaveAttribute('data-mood', 'null');
    expect(meter()).toHaveAttribute('data-energy', 'null');
    expect(timeSegments()).toEqual(['12', '00']);
    expect(screen.getByRole('button', { name: 'Add check-in' })).toBeDisabled();

    // What is saved next is a new check-in, never an edit of the old day's.
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add check-in' }));

    expect(props.onUpdateCheckin).not.toHaveBeenCalled();
    expect(props.onCreateCheckin).toHaveBeenCalledWith({
      mood: null,
      energy: 3,
      focus: null,
      notes: '',
      tags: [],
      time: '12:00',
    });
  });

  test('saving an edit that changes nothing sends nothing and leaves edit mode', () => {
    const { props } = renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(props.onUpdateCheckin).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'New check-in' })
    ).toBeInTheDocument();
  });
});

describe('CheckInTopRow default time', () => {
  // Today in both UTC and Chicago (CDT, UTC-5), so the default is "now".
  const TODAY = '2026-10-20';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-20T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Renders today's composer; the create handler records the POST body. */
  const renderToday = () => {
    const sent: MoodCheckinCreateBody[] = [];
    const utils = renderRow({
      selectedDate: TODAY,
      onCreateCheckin: jest.fn((draft: CheckinDraft) => {
        sent.push(buildCheckinCreateBody(draft, TODAY, mockTimezone));
        return Promise.resolve(true);
      }),
    });
    return { ...utils, sent };
  };

  const addEnergyCheckin = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add check-in' }));
  };

  test('an untouched time is "now" when the check-in is sent', () => {
    const { sent } = renderToday();
    expect(timeSegments()).toEqual(['15', '00']);

    jest.setSystemTime(new Date('2026-10-20T16:20:00.000Z'));
    addEnergyCheckin();

    expect(sent[0]?.entry_timestamp).toBe('2026-10-20T16:20:00.000Z');
  });

  test('an untouched time on show follows the clock', () => {
    renderToday();
    act(() => {
      jest.setSystemTime(new Date('2026-10-20T16:20:00.000Z'));
      jest.advanceTimersByTime(30_000);
    });

    expect(timeSegments()).toEqual(['16', '20']);
  });

  test('an untouched time follows a change of zone', () => {
    const { rerender } = renderToday();
    expect(timeSegments()).toEqual(['15', '00']);

    // The saved preference replaces the browser zone once it loads.
    mockTimezone = 'America/Chicago';
    rerender({});

    expect(timeSegments()).toEqual(['10', '00']);
  });

  test('a time the user set is kept through the clock and a zone change', () => {
    const { container, rerender, sent } = renderToday();
    pickTime(container, '07:45');
    expect(timeSegments()).toEqual(['07', '45']);

    act(() => {
      jest.setSystemTime(new Date('2026-10-20T16:20:00.000Z'));
      jest.advanceTimersByTime(30_000);
    });
    mockTimezone = 'America/Chicago';
    rerender({});
    expect(timeSegments()).toEqual(['07', '45']);

    addEnergyCheckin();
    // 07:45 in Chicago (UTC-5).
    expect(sent[0]?.entry_timestamp).toBe('2026-10-20T12:45:00.000Z');
  });
});

describe('CheckInTopRow delete', () => {
  test('asks first, then deletes and leaves the edit of that check-in', async () => {
    const { props } = renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete check-in at 09:30' })
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this check-in?');
    expect(dialog).toHaveTextContent(
      'This removes the check-in and its journal entry.'
    );
    expect(props.onDeleteCheckin).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(props.onDeleteCheckin).toHaveBeenCalledWith(stored);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'New check-in' })
      ).toBeInTheDocument()
    );
  });

  test('cancelling the confirmation deletes nothing', () => {
    const { props } = renderRow({ checkins: [stored] });
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete check-in at 09:30' })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      })
    );

    expect(props.onDeleteCheckin).not.toHaveBeenCalled();
  });
});

describe('CheckInTopRow delete in flight', () => {
  test('a pending delete locks that row and sends no second request', async () => {
    let finish: (ok: boolean) => void = () => {};
    const onDeleteCheckin = jest.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    );
    renderRow({ checkins: [stored], onDeleteCheckin });

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete check-in at 09:30' })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete',
      })
    );

    const rowDelete = screen.getByRole('button', {
      name: 'Delete check-in at 09:30',
    });
    expect(rowDelete).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    ).toBeDisabled();
    fireEvent.click(rowDelete);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDeleteCheckin).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));
    expect(rowDelete).toBeEnabled();
  });

  test('Save changes is off while the edited check-in is being deleted', async () => {
    let finish: (ok: boolean) => void = () => {};
    const onDeleteCheckin = jest.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve))
    );
    renderRow({ checkins: [stored], onDeleteCheckin });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 09:30' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete check-in at 09:30' })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete',
      })
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await act(async () => finish(false));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});

describe('CheckInTopRow save hint', () => {
  test('explains what makes a check-in saveable until it has content', () => {
    renderRow();
    const add = screen.getByRole('button', { name: 'Add check-in' });
    const hint = 'Add a mood, energy, focus, a tag or a journal entry to save.';

    expect(add).toBeDisabled();
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(add).toHaveAccessibleDescription(hint);

    fireEvent.click(screen.getByRole('button', { name: 'Set energy 3' }));

    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(add).toBeEnabled();
    expect(add).not.toHaveAttribute('aria-describedby');
  });
});

describe('CheckInTopRow day list', () => {
  test("titles today's list and other days differently", () => {
    const { rerender } = renderRow({ selectedDate: todayInZone('UTC') });
    expect(
      screen.getByRole('heading', { name: "Today's check-ins" })
    ).toBeInTheDocument();

    rerender({ selectedDate: DAY });
    expect(
      screen.getByRole('heading', { name: 'Check-ins' })
    ).toBeInTheDocument();
  });

  test('shows a loading state instead of the list while the day loads', () => {
    renderRow({ isLoadingCheckins: true });
    expect(
      screen.queryByText('No check-ins yet for this day.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Check-ins' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
