import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDueDosesForDate, computeAdherence } from '@workspace/shared';
import MedicationAdherenceScreen from '../../src/screens/MedicationAdherenceScreen';
import { useMedicationAdherence } from '../../src/hooks/useMedicationAdherence';
import {
  useDeleteMedicationEntry,
  useLogDose,
} from '../../src/hooks/useMedications';
import { useDeleteInjection } from '../../src/hooks/useGlp1';
import type { RootStackScreenProps } from '../../src/types/navigation';
import {
  buildEntry,
  buildMedication,
  buildSchedule,
} from '../helpers/medicationFixtures';

type ScreenProps = RootStackScreenProps<'MedicationAdherence'>;

jest.mock('../../src/hooks/useMedicationAdherence', () => ({
  useMedicationAdherence: jest.fn(),
}));
jest.mock('../../src/hooks/useMedications', () => ({
  useDeleteMedicationEntry: jest.fn(),
  useLogDose: jest.fn(),
}));
jest.mock('../../src/hooks/useGlp1', () => ({
  useDeleteInjection: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-10-14',
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});
jest.mock('../../src/components/ProgressRing', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="ring" /> };
});

// The calendar owns its own queries and has its own tests; here it just selects days.
jest.mock('../../src/components/medications/MedicationLogCalendar', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      onSelectDate,
      subtype,
      selectedDate,
    }: {
      onSelectDate: (date: string) => void;
      subtype: string;
      selectedDate: string;
    }) => (
      <View>
        <Text testID="calendar-subtype">{subtype}</Text>
        <Text testID="calendar-selected">{selectedDate}</Text>
        <Pressable onPress={() => onSelectDate('2026-10-02')}>
          <Text>pick-oct-2</Text>
        </Pressable>
      </View>
    ),
  };
});

const mockNavigate = jest.fn();
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: mockNavigate,
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseMedicationAdherence = useMedicationAdherence as jest.Mock;
const mockUseLogDose = useLogDose as jest.Mock;
const mockUseDeleteEntry = useDeleteMedicationEntry as jest.Mock;
const mockUseDeleteInjection = useDeleteInjection as jest.Mock;
const deleteEntryMutate = jest.fn();
const deleteInjectionMutate = jest.fn();
const refetch = jest.fn().mockResolvedValue(undefined);
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const lisinopril = buildMedication({
  id: 'med-1',
  name: 'Lisinopril',
  schedules: [buildSchedule({ id: 's-1', medication_id: 'med-1' })],
});
const vitamin = buildMedication({
  id: 'vit',
  name: 'Vitamin D',
  is_supplement: true,
  schedules: [buildSchedule({ id: 's-v', medication_id: 'vit' })],
});
const ibuprofen = buildMedication({
  id: 'ibu',
  name: 'Ibuprofen',
  schedules: [],
});

function setAdherence(
  overrides: Record<string, unknown> = {},
  medications = [lisinopril, ibuprofen],
  entries = [buildEntry({ med_name_snapshot: 'Lisinopril' })]
) {
  const dueDoses = getDueDosesForDate(medications, '2026-10-14', 'UTC');
  mockUseMedicationAdherence.mockReturnValue({
    allMedications: medications,
    medications,
    dueDoses,
    prnMedications: medications.filter((m) => m.schedules.length === 0),
    dayEntries: entries,
    checklist: { completed: 1, total: dueDoses.length, pct: 50 },
    summary: computeAdherence({
      medications,
      entries,
      endDate: '2026-10-14',
      timezone: 'UTC',
    }),
    isLoading: false,
    isError: false,
    refetch,
    ...overrides,
  });
}

function renderScreen() {
  const route: ScreenProps['route'] = {
    key: 'MedicationAdherence-key',
    name: 'MedicationAdherence',
    params: undefined,
  };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationAdherenceScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>
  );
}

/** Presses the destructive button of the most recent Alert. */
function confirmAlert() {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2]!;
  buttons.find((b) => b.style === 'destructive')!.onPress!();
}

describe('MedicationAdherenceScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setAdherence();
    mockUseLogDose.mockReturnValue({
      entryForDue: jest.fn(),
      logDose: jest.fn(),
      toggleTaken: jest.fn(),
      logPrn: jest.fn(),
    });
    mockUseDeleteEntry.mockReturnValue({
      mutate: deleteEntryMutate,
      isPending: false,
    });
    mockUseDeleteInjection.mockReturnValue({
      mutate: deleteInjectionMutate,
      isPending: false,
    });
  });

  it('shows the overview, checklist, doses, calendar and day log', () => {
    const screen = renderScreen();
    expect(screen.getByText('Adherence overview')).toBeTruthy();
    expect(screen.getByText("Today's Checklist")).toBeTruthy();
    expect(screen.getByText("Today's medications")).toBeTruthy();
    expect(screen.getByTestId('calendar-selected').props.children).toBe(
      '2026-10-14'
    );
    expect(screen.getByText('Logged today')).toBeTruthy();
    expect(screen.queryByText('Back to today')).toBeNull();
  });

  it('asks the data hook for the selected day and filter', () => {
    renderScreen();
    expect(mockUseMedicationAdherence).toHaveBeenCalledWith(
      '2026-10-14',
      'all'
    );
    expect(mockUseLogDose).toHaveBeenCalledWith(
      '2026-10-14',
      expect.any(Array)
    );
  });

  it('shows the empty message when nothing is due', () => {
    setAdherence({
      dueDoses: [],
      checklist: { completed: 0, total: 0, pct: 100 },
    });
    const screen = renderScreen();
    expect(
      screen.getByText(
        'No scheduled doses today, log any medication as-needed below.'
      )
    ).toBeTruthy();
    expect(screen.getByText('No scheduled doses for today.')).toBeTruthy();
  });

  it('moves to another day from the calendar and offers a way back', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('pick-oct-2'));
    expect(mockUseMedicationAdherence).toHaveBeenLastCalledWith(
      '2026-10-02',
      'all'
    );
    expect(screen.getByTestId('calendar-selected').props.children).toBe(
      '2026-10-02'
    );
    expect(screen.getByText('Medication Checklist')).toBeTruthy();
    expect(screen.queryByText('Logged today')).toBeNull();

    fireEvent.press(screen.getByText('Back to today'));
    expect(mockUseMedicationAdherence).toHaveBeenLastCalledWith(
      '2026-10-14',
      'all'
    );
    expect(screen.getByText("Today's Checklist")).toBeTruthy();
  });

  it('only offers the filter once a supplement exists, and applies it', () => {
    const withoutSupplements = renderScreen();
    expect(withoutSupplements.queryByText('Supplements')).toBeNull();
    withoutSupplements.unmount();

    setAdherence({}, [lisinopril, vitamin, ibuprofen]);
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Supplements'));
    expect(mockUseMedicationAdherence).toHaveBeenLastCalledWith(
      '2026-10-14',
      'supplements'
    );
    expect(screen.getByTestId('calendar-subtype').props.children).toBe(
      'supplements'
    );
  });

  it('splits medications and supplements into separate dose cards', () => {
    setAdherence({}, [lisinopril, vitamin, ibuprofen]);
    const screen = renderScreen();
    expect(screen.getByText("Today's medications")).toBeTruthy();
    expect(screen.getByText("Today's supplements")).toBeTruthy();
  });

  it('opens a medication from a dose row', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Ibuprofen'));
    expect(mockNavigate).toHaveBeenCalledWith('MedicationDetail', {
      medicationId: 'ibu',
    });
  });

  it('opens the edit screen with the entry', () => {
    const entry = buildEntry({ med_name_snapshot: 'Lisinopril' });
    setAdherence({}, [lisinopril], [entry]);
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Edit Lisinopril'));
    expect(mockNavigate).toHaveBeenCalledWith('MedicationEntryEdit', { entry });
  });

  it('asks before deleting and deletes a normal entry', () => {
    const entry = buildEntry({ id: 'e1', med_name_snapshot: 'Lisinopril' });
    setAdherence({}, [lisinopril], [entry]);
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Delete Lisinopril'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete entry',
      'Delete this logged dose of Lisinopril?',
      expect.any(Array)
    );
    expect(deleteEntryMutate).not.toHaveBeenCalled();

    confirmAlert();
    expect(deleteEntryMutate).toHaveBeenCalledWith('e1', expect.any(Object));
    expect(deleteInjectionMutate).not.toHaveBeenCalled();
  });

  it('deletes an injection row through the injection endpoint', () => {
    const entry = buildEntry({
      id: 'inj-1',
      med_name_snapshot: 'Wegovy',
      entry_type: 'injection',
    });
    setAdherence({}, [lisinopril], [entry]);
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Delete Wegovy'));
    confirmAlert();
    expect(deleteInjectionMutate).toHaveBeenCalledWith(
      'inj-1',
      expect.any(Object)
    );
    expect(deleteEntryMutate).not.toHaveBeenCalled();
  });

  it('shows a loading state', () => {
    setAdherence({ isLoading: true });
    const screen = renderScreen();
    expect(screen.getByText('Loading adherence...')).toBeTruthy();
    expect(screen.queryByText('Adherence overview')).toBeNull();
  });

  it('shows an error with a retry', () => {
    setAdherence({ isError: true });
    const screen = renderScreen();
    expect(screen.getByText('Failed to load adherence.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when there are no medications', () => {
    setAdherence({ allMedications: [] }, [], []);
    const screen = renderScreen();
    expect(
      screen.getByText('Add a medication to start tracking adherence.')
    ).toBeTruthy();
    expect(screen.queryByText('Adherence overview')).toBeNull();
  });
});
