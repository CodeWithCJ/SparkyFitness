import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MedicationLogCalendar from '../../../src/components/medications/MedicationLogCalendar';
import { useMedicationEntries } from '../../../src/hooks/useMedications';
import { useSymptomEntries } from '../../../src/hooks/useSymptoms';
import type { SymptomEntry } from '../../../src/services/api/symptomsApi';
import { buildEntry, buildMedication } from '../../helpers/medicationFixtures';

jest.mock('../../../src/hooks/useMedications', () => ({
  useMedicationEntries: jest.fn(),
}));
jest.mock('../../../src/hooks/useSymptoms', () => ({
  useSymptomEntries: jest.fn(),
}));
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { first_day_of_week: 0 } }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map((k) => `var(${k})`) : `var(${keys})`,
}));

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// The real picker lives in a bottom sheet; expose its options as buttons.
jest.mock('../../../src/components/BottomSheetPicker', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      options,
      onSelect,
      value,
    }: {
      options: { label: string; value: string }[];
      onSelect: (value: string) => void;
      value: string;
    }) => (
      <View testID="filter-picker">
        <Text testID="filter-value">{value}</Text>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            accessibilityLabel={`filter-${option.label}`}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<
  typeof useMedicationEntries
>;
const mockUseSymptomEntries = useSymptomEntries as jest.MockedFunction<
  typeof useSymptomEntries
>;

const lisinopril = buildMedication({ id: 'med-1', name: 'Lisinopril' });
const metformin = buildMedication({ id: 'med-2', name: 'Metformin' });
const inactive = buildMedication({
  id: 'med-3',
  name: 'Old med',
  is_active: false,
});
const onSelectDate = jest.fn();

function setData(
  entries = [buildEntry()],
  symptoms: Partial<SymptomEntry>[] = []
) {
  mockUseMedicationEntries.mockReturnValue({
    data: entries,
  } as unknown as ReturnType<typeof useMedicationEntries>);
  mockUseSymptomEntries.mockReturnValue({
    entries: symptoms,
  } as unknown as ReturnType<typeof useSymptomEntries>);
}

function renderCalendar(
  props: Partial<React.ComponentProps<typeof MedicationLogCalendar>> = {}
) {
  return render(
    <MedicationLogCalendar
      medications={[lisinopril, metformin, inactive]}
      selectedDate="2026-10-14"
      onSelectDate={onSelectDate}
      subtype="all"
      {...props}
    />
  );
}

const lastEntriesCall = () =>
  mockUseMedicationEntries.mock.calls[
    mockUseMedicationEntries.mock.calls.length - 1
  ]![0];

describe('MedicationLogCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setData();
  });

  it('shows the month, the dose total and the legend', () => {
    setData([
      buildEntry({ id: 'a', entry_date: '2026-10-14' }),
      buildEntry({ id: 'b', entry_date: '2026-10-15' }),
      buildEntry({ id: 'c', entry_date: '2026-10-15', status: 'skipped' }),
    ]);
    const screen = renderCalendar();
    expect(screen.getByText('Log Calendar')).toBeTruthy();
    expect(screen.getAllByText(/October 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText('2 doses logged in October 2026')).toBeTruthy();
    for (const label of [
      'All doses taken',
      'Partially taken',
      'Mostly skipped',
      'All doses skipped',
      'Snoozed only',
      'Side-effect symptom',
      'General symptom',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('requests the visible grid range, including adjacent-month days', () => {
    renderCalendar();
    // October 2026 starts on a Thursday and ends on a Saturday, Sunday-first grid.
    expect(lastEntriesCall()).toEqual({
      fromDate: '2026-09-27',
      toDate: '2026-10-31',
      medicationId: undefined,
    });
    expect(mockUseSymptomEntries).toHaveBeenLastCalledWith({
      fromDate: '2026-09-27',
      toDate: '2026-10-31',
    });
  });

  it('colours each day by how complete it was', () => {
    setData([
      buildEntry({ id: '1', entry_date: '2026-10-01' }),
      buildEntry({ id: '2', entry_date: '2026-10-02' }),
      buildEntry({ id: '3', entry_date: '2026-10-02', status: 'skipped' }),
      buildEntry({ id: '4', entry_date: '2026-10-03', status: 'skipped' }),
      buildEntry({ id: '5', entry_date: '2026-10-03', status: 'skipped' }),
      buildEntry({ id: '6', entry_date: '2026-10-03' }),
      buildEntry({ id: '7', entry_date: '2026-10-04', status: 'skipped' }),
      buildEntry({ id: '8', entry_date: '2026-10-05', status: 'snoozed' }),
    ]);
    const screen = renderCalendar();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-01-all_taken')
    ).toBeTruthy();
    expect(screen.getByTestId('med-cal-fill-2026-10-02-partial')).toBeTruthy();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-03-mostly_skipped')
    ).toBeTruthy();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-04-all_skipped')
    ).toBeTruthy();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-05-snoozed_only')
    ).toBeTruthy();
    expect(
      screen.queryByTestId('med-cal-fill-2026-10-06-all_taken')
    ).toBeNull();
  });

  it('badges days with more than one dose taken', () => {
    setData([
      buildEntry({ id: '1', entry_date: '2026-10-01' }),
      buildEntry({ id: '2', entry_date: '2026-10-01', status: 'prn_taken' }),
      buildEntry({ id: '3', entry_date: '2026-10-02' }),
    ]);
    const screen = renderCalendar();
    expect(screen.getByTestId('med-cal-count-2026-10-01')).toBeTruthy();
    expect(screen.queryByTestId('med-cal-count-2026-10-02')).toBeNull();
  });

  it('marks side-effect and general symptom days', () => {
    setData(
      [],
      [
        {
          entry_date: '2026-10-06',
          medication_id: 'med-1',
          symptom_name_snapshot: 'Nausea',
        },
        {
          entry_date: '2026-10-07',
          medication_id: null,
          symptom_name_snapshot: 'Headache',
        },
      ]
    );
    const screen = renderCalendar();
    expect(screen.getByTestId('med-cal-side-effect-2026-10-06')).toBeTruthy();
    expect(screen.queryByTestId('med-cal-general-2026-10-06')).toBeNull();
    expect(screen.getByTestId('med-cal-general-2026-10-07')).toBeTruthy();
    expect(screen.queryByTestId('med-cal-side-effect-2026-10-07')).toBeNull();
  });

  it('never marks days with cycle-hub symptoms', () => {
    setData(
      [],
      [
        {
          entry_date: '2026-10-08',
          medication_id: null,
          symptom_name_snapshot: 'Cramps',
          source: 'cycle',
        },
      ]
    );
    const screen = renderCalendar();
    expect(screen.queryByTestId('med-cal-general-2026-10-08')).toBeNull();
    expect(screen.queryByTestId('med-cal-side-effect-2026-10-08')).toBeNull();
  });

  it('works without symptom access', () => {
    setData([buildEntry({ entry_date: '2026-10-01' })], []);
    const screen = renderCalendar();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-01-all_taken')
    ).toBeTruthy();
  });

  it('describes a day for screen readers', () => {
    setData([
      buildEntry({ id: '1', entry_date: '2026-10-02' }),
      buildEntry({ id: '2', entry_date: '2026-10-02', status: 'skipped' }),
    ]);
    const screen = renderCalendar();
    expect(
      screen.getByLabelText('2026-10-02, 1 taken, 1 skipped')
    ).toBeTruthy();
  });

  it('selects a day when it is tapped', () => {
    const screen = renderCalendar();
    fireEvent.press(screen.getByTestId('med-cal-day-2026-10-20'));
    expect(onSelectDate).toHaveBeenCalledWith('2026-10-20');
  });

  it('shows the selected day as selected', () => {
    const screen = renderCalendar();
    expect(
      screen.getByTestId('med-cal-day-2026-10-14').props.accessibilityState
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId('med-cal-day-2026-10-15').props.accessibilityState
    ).toEqual({ selected: false });
  });

  it('navigates months and refetches the new range', () => {
    const screen = renderCalendar();
    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getAllByText(/November 2026/).length).toBeGreaterThan(0);
    expect(lastEntriesCall()).toEqual(
      expect.objectContaining({ fromDate: '2026-11-01', toDate: '2026-12-05' })
    );

    fireEvent.press(screen.getByLabelText('Previous month'));
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getAllByText(/September 2026/).length).toBeGreaterThan(0);
  });

  it('follows the selected date into another month', () => {
    const screen = renderCalendar();
    screen.rerender(
      <MedicationLogCalendar
        medications={[lisinopril, metformin]}
        selectedDate="2026-12-02"
        onSelectDate={onSelectDate}
        subtype="all"
      />
    );
    expect(screen.getAllByText(/December 2026/).length).toBeGreaterThan(0);
  });

  it('filters the month to one medication', () => {
    const screen = renderCalendar();
    expect(screen.getByLabelText('filter-All')).toBeTruthy();
    expect(screen.getByLabelText('filter-Lisinopril')).toBeTruthy();
    expect(screen.getByLabelText('filter-Metformin')).toBeTruthy();
    // Inactive medications are not offered.
    expect(screen.queryByLabelText('filter-Old med')).toBeNull();

    fireEvent.press(screen.getByLabelText('filter-Metformin'));
    expect(lastEntriesCall()).toEqual(
      expect.objectContaining({ medicationId: 'med-2' })
    );

    fireEvent.press(screen.getByLabelText('filter-All'));
    expect(lastEntriesCall()).toEqual(
      expect.objectContaining({ medicationId: undefined })
    );
  });

  it('only counts the chosen medication when filtered', () => {
    setData([
      buildEntry({ id: '1', medication_id: 'med-1', entry_date: '2026-10-01' }),
      buildEntry({ id: '2', medication_id: 'med-2', entry_date: '2026-10-02' }),
    ]);
    const screen = renderCalendar();
    fireEvent.press(screen.getByLabelText('filter-Metformin'));
    expect(
      screen.queryByTestId('med-cal-fill-2026-10-01-all_taken')
    ).toBeNull();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-02-all_taken')
    ).toBeTruthy();
  });

  it('drops entries from the hidden subtype in the catch-all view', () => {
    const vitamin = buildMedication({
      id: 'vit',
      name: 'Vitamin D',
      is_supplement: true,
    });
    setData([
      buildEntry({ id: '1', medication_id: 'med-1', entry_date: '2026-10-01' }),
      buildEntry({ id: '2', medication_id: 'vit', entry_date: '2026-10-02' }),
    ]);
    const screen = renderCalendar({
      medications: [vitamin],
      subtype: 'supplements',
    });
    expect(screen.getByText('Supplement Log Calendar')).toBeTruthy();
    expect(
      screen.queryByTestId('med-cal-fill-2026-10-01-all_taken')
    ).toBeNull();
    expect(
      screen.getByTestId('med-cal-fill-2026-10-02-all_taken')
    ).toBeTruthy();
  });

  it('falls back to all when the chosen medication leaves the filtered list', () => {
    const screen = renderCalendar();
    fireEvent.press(screen.getByLabelText('filter-Metformin'));
    screen.rerender(
      <MedicationLogCalendar
        medications={[lisinopril]}
        selectedDate="2026-10-14"
        onSelectDate={onSelectDate}
        subtype="meds"
      />
    );
    expect(lastEntriesCall()).toEqual(
      expect.objectContaining({ medicationId: undefined })
    );
    expect(screen.getByTestId('filter-value').props.children).toBe('__all__');
  });

  it('shows an empty state when there are no active medications', () => {
    const screen = renderCalendar({ medications: [inactive] });
    expect(
      screen.getByText('Add a medication to see its log calendar here.')
    ).toBeTruthy();
    expect(screen.queryByTestId('filter-picker')).toBeNull();
  });
});
