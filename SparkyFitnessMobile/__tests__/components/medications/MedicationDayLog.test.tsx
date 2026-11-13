import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MedicationDayLog from '../../../src/components/medications/MedicationDayLog';
import { buildEntry } from '../../helpers/medicationFixtures';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));

const onEdit = jest.fn();
const onDelete = jest.fn();

function renderLog(
  entries = [buildEntry()],
  props: Partial<React.ComponentProps<typeof MedicationDayLog>> = {}
) {
  return render(
    <MedicationDayLog
      title="Logged today"
      description="Everything you've taken or skipped on this date."
      entries={entries}
      isLoading={false}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />
  );
}

describe('MedicationDayLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists each entry with its name and status chip', () => {
    const screen = renderLog([
      buildEntry({ id: 'a', med_name_snapshot: 'Lisinopril', status: 'taken' }),
      buildEntry({
        id: 'b',
        med_name_snapshot: 'Metformin',
        status: 'skipped',
        taken_at: '2026-10-14T20:00:00.000Z',
      }),
    ]);
    expect(screen.getByText('Logged today')).toBeTruthy();
    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('Metformin')).toBeTruthy();
    expect(screen.getByText('Taken')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('shows the time each dose was logged', () => {
    const screen = renderLog([
      buildEntry({ taken_at: new Date(2026, 9, 14, 8, 5).toISOString() }),
    ]);
    expect(screen.getByText('08:05')).toBeTruthy();
  });

  it('labels as-needed and snoozed entries', () => {
    const screen = renderLog([
      buildEntry({ id: 'a', status: 'prn_taken' }),
      buildEntry({ id: 'b', status: 'snoozed' }),
    ]);
    expect(screen.getByText('As needed')).toBeTruthy();
    expect(screen.getByText('Snoozed')).toBeTruthy();
  });

  it('orders entries by time of day', () => {
    const screen = renderLog([
      buildEntry({
        id: 'late',
        med_name_snapshot: 'Evening med',
        taken_at: '2026-10-14T20:00:00.000Z',
      }),
      buildEntry({
        id: 'early',
        med_name_snapshot: 'Morning med',
        taken_at: '2026-10-14T07:00:00.000Z',
      }),
    ]);
    const names = screen
      .getAllByText(/(Morning|Evening) med/)
      .map((node) => node.props.children);
    expect(names).toEqual(['Morning med', 'Evening med']);
  });

  it('shows notes and the injection site under the row', () => {
    const screen = renderLog([
      buildEntry({
        entry_type: 'injection',
        site: 'stomach_upper_left',
        notes: 'felt fine',
      }),
    ]);
    expect(screen.getByText(/felt fine/)).toBeTruthy();
  });

  it('calls back with the entry for edit and delete', () => {
    const entry = buildEntry({ id: 'a', med_name_snapshot: 'Lisinopril' });
    const screen = renderLog([entry]);
    fireEvent.press(screen.getByLabelText('Edit Lisinopril'));
    expect(onEdit).toHaveBeenCalledWith(entry);
    fireEvent.press(screen.getByLabelText('Delete Lisinopril'));
    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it('shows an empty state', () => {
    const screen = renderLog([]);
    expect(screen.getByText('Nothing logged for this day.')).toBeTruthy();
  });

  it('shows a loading state instead of the empty one', () => {
    const screen = renderLog([], { isLoading: true });
    expect(screen.getByText('Loading history…')).toBeTruthy();
    expect(screen.queryByText('Nothing logged for this day.')).toBeNull();
  });

  it('does not act on presses while busy', () => {
    const screen = renderLog(
      [buildEntry({ med_name_snapshot: 'Lisinopril' })],
      {
        busy: true,
      }
    );
    fireEvent.press(screen.getByLabelText('Delete Lisinopril'));
    expect(onDelete).not.toHaveBeenCalled();
  });
});
