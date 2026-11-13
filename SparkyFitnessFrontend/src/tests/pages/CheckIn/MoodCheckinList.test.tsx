import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BUILT_IN_MOODS } from '@workspace/shared';
import { MoodCheckinList } from '@/pages/CheckIn/MoodCheckinList';
import type { MoodEntry } from '@/types/mood';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'America/Chicago', timeFormat: 'HH:mm' }),
}));

const checkin = (
  id: string,
  entry_timestamp: string,
  over: Partial<MoodEntry> = {}
): MoodEntry => ({
  id,
  user_id: 'u1',
  mood_value: null,
  mood_tags: [],
  notes: null,
  energy_value: null,
  focus_value: null,
  entry_date: '2026-10-19',
  entry_timestamp,
  source: 'manual',
  created_at: entry_timestamp,
  updated_at: entry_timestamp,
  ...over,
});

// Chicago is UTC-5 on these days: 08:10, 13:45 and 21:30 local.
const morning = checkin('a', '2026-10-19T13:10:00.000Z', {
  mood_value: 40,
  energy_value: 4,
  focus_value: 4,
  mood_tags: ['tired', 'Studying'],
});
const afternoon = checkin('b', '2026-10-19T18:45:00.000Z', {
  energy_value: 2,
  notes: 'Hard time focusing after lunch.',
});
const evening = checkin('c', '2026-10-20T02:30:00.000Z', {
  mood_value: 80,
  energy_value: 2,
});

const BAND_FACES = BUILT_IN_MOODS.filter((m) => m.band != null).map(
  (m) => m.emoji
);

const renderList = (
  checkins: MoodEntry[],
  editingId: string | null = null,
  deletingId: string | null = null
) => {
  const onEdit = jest.fn();
  const onDelete = jest.fn();
  render(
    <MoodCheckinList
      checkins={checkins}
      editingId={editingId}
      deletingId={deletingId}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
  return { onEdit, onDelete };
};

const rows = () =>
  within(screen.getByRole('list')).getAllByRole('listitem') as HTMLElement[];

describe('MoodCheckinList', () => {
  test('lists the check-ins in the order given, at their local time', () => {
    renderList([morning, afternoon, evening]);
    expect(rows().map((row) => row.querySelector('time')?.textContent)).toEqual(
      ['08:10', '13:45', '21:30']
    );
  });

  test('shows a face for a check-in with a mood and none without one', () => {
    renderList([morning, afternoon, evening]);
    const [first, second] = rows();

    expect(first).toHaveTextContent('😐 Neutral');
    expect(first).toHaveTextContent('Energy 4/5');
    expect(first).toHaveTextContent('Focus 4/5');
    BAND_FACES.forEach((face) =>
      expect(second!.textContent).not.toContain(face)
    );
    expect(second).toHaveTextContent('Energy 2/5');
    expect(second).not.toHaveTextContent('Focus');
  });

  test('shows tags as chips and the journal line', () => {
    renderList([morning, afternoon]);
    const [first, second] = rows();

    expect(within(first!).getByText('😴 Tired')).toBeInTheDocument();
    expect(within(first!).getByText('Studying')).toBeInTheDocument();
    expect(second).toHaveTextContent('Hard time focusing after lunch.');
  });

  test('cuts a long journal entry to 120 characters', () => {
    const long = 'word '.repeat(60).trim();
    renderList([checkin('d', '2026-10-19T15:00:00.000Z', { notes: long })]);
    const snippet = within(rows()[0]!).getByText(/^word word/);

    expect(snippet.textContent!.length).toBeLessThanOrEqual(120);
    expect(snippet.textContent!.endsWith('…')).toBe(true);
  });

  test('averages the day, leaving a check-in without a mood out of the mood', () => {
    renderList([morning, afternoon, evening]);
    const average = screen.getByRole('group', { name: 'Day average' });

    // (40 + 80) / 2 = 60, Calm. Counting the empty mood as 0 would give Neutral.
    expect(average).toHaveTextContent('🙂 Calm');
    expect(average).toHaveTextContent('Energy 2.7/5');
    expect(average).toHaveTextContent('Focus 4/5');
    expect(average).toHaveTextContent('3 check-ins');
  });

  test('shows a dash for the mood when no check-in has one', () => {
    renderList([afternoon]);
    const average = screen.getByRole('group', { name: 'Day average' });

    expect(average).toHaveTextContent('—');
    expect(average).toHaveTextContent('1 check-in');
    expect(average).not.toHaveTextContent('1 check-ins');
  });

  test('shows the empty state when the day has no check-ins', () => {
    renderList([]);
    expect(
      screen.getByText('No check-ins yet for this day.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Day average' })
    ).not.toBeInTheDocument();
  });

  test('edit and delete name the check-in they act on', () => {
    const { onEdit, onDelete } = renderList([morning, afternoon, evening]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Edit check-in at 08:10' })
    );
    expect(onEdit).toHaveBeenCalledWith(morning);

    fireEvent.click(
      screen.getByRole('button', { name: 'Delete check-in at 13:45' })
    );
    expect(onDelete).toHaveBeenCalledWith(afternoon);
  });

  test('marks the check-in being edited', () => {
    renderList([morning, afternoon], 'b');
    const [first, second] = rows();

    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
  });
});
