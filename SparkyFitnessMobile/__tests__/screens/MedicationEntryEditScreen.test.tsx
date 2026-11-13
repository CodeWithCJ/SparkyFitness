import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import MedicationEntryEditScreen from '../../src/screens/MedicationEntryEditScreen';
import { useUpdateMedicationEntry } from '../../src/hooks/useMedications';
import { useUpdateInjection } from '../../src/hooks/useGlp1';
import type { RootStackScreenProps } from '../../src/types/navigation';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import { buildEntry } from '../helpers/medicationFixtures';

type ScreenProps = RootStackScreenProps<'MedicationEntryEdit'>;

jest.mock('../../src/hooks/useMedications', () => ({
  useUpdateMedicationEntry: jest.fn(),
}));
jest.mock('../../src/hooks/useGlp1', () => ({
  useUpdateInjection: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { time_format: 'HH:mm' } }),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getDeviceTimezone: () => 'UTC',
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn(), hide: jest.fn() },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

jest.mock('../../src/components/BottomSheetPicker', () => {
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
      <View>
        <Text>{`picker-value-${value}`}</Text>
        {options.map((o) => (
          <Pressable key={o.value} onPress={() => onSelect(o.value)}>
            <Text>{`opt-${o.value}`}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

jest.mock('../../src/components/TimeSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const MockTimeSheet = React.forwardRef(
    (
      { onSelectTime }: { onSelectTime: (time: string) => void },
      _ref: unknown
    ) => (
      <Pressable onPress={() => onSelectTime('21:15')}>
        <Text>mock-time-sheet</Text>
      </Pressable>
    )
  );
  MockTimeSheet.displayName = 'MockTimeSheet';
  return { __esModule: true, default: MockTimeSheet };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const updateEntryMutate = jest.fn();
const updateInjectionMutate = jest.fn();

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function renderScreen(entry = buildEntry()) {
  const route: ScreenProps['route'] = {
    key: 'MedicationEntryEdit-key',
    name: 'MedicationEntryEdit',
    params: { entry },
  };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationEntryEditScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>
  );
}

describe('MedicationEntryEditScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useUpdateMedicationEntry as jest.Mock).mockReturnValue({
      mutate: updateEntryMutate,
      isPending: false,
    });
    (useUpdateInjection as jest.Mock).mockReturnValue({
      mutate: updateInjectionMutate,
      isPending: false,
    });
  });

  it('starts from the logged dose', () => {
    const screen = renderScreen(
      buildEntry({ notes: 'with breakfast', status: 'skipped' })
    );
    expect(screen.getByText('Lisinopril')).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByDisplayValue('with breakfast')).toBeTruthy();
    expect(screen.getByText('picker-value-skipped')).toBeTruthy();
  });

  it('saves a changed time, status and note on the same day', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('mock-time-sheet'));
    fireEvent.press(screen.getByText('opt-skipped'));
    fireEvent.changeText(screen.getByDisplayValue(''), '  late  ');

    pressAction(screen, mockNavigation, 'Save');

    expect(updateEntryMutate).toHaveBeenCalledWith(
      {
        id: 'entry-1',
        body: {
          taken_at: '2026-10-14T21:15:00.000Z',
          entry_date: '2026-10-14',
          notes: 'late',
          status: 'skipped',
        },
      },
      expect.any(Object)
    );
    expect(updateInjectionMutate).not.toHaveBeenCalled();
  });

  it('clears the note when it is emptied', () => {
    const screen = renderScreen(buildEntry({ notes: 'old' }));
    fireEvent.changeText(screen.getByDisplayValue('old'), '   ');
    pressAction(screen, mockNavigation, 'Save');
    expect(updateEntryMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ notes: null }),
      }),
      expect.any(Object)
    );
  });

  it('goes back and confirms once the change is saved', () => {
    updateEntryMutate.mockImplementation((_vars, options) =>
      options.onSuccess()
    );
    const screen = renderScreen();
    pressAction(screen, mockNavigation, 'Save');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', text1: 'Dose updated' })
    );
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('keeps the screen open and reports a failed save', () => {
    updateEntryMutate.mockImplementation((_vars, options) =>
      options.onError(new Error('boom'))
    );
    const screen = renderScreen();
    pressAction(screen, mockNavigation, 'Save');
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Failed to save: boom');
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('does not offer a status change for an as-needed dose', () => {
    const screen = renderScreen(buildEntry({ status: 'prn_taken' }));
    expect(screen.queryByText('opt-skipped')).toBeNull();
    pressAction(screen, mockNavigation, 'Save');
    const body = updateEntryMutate.mock.calls[0]![0].body;
    expect(body).not.toHaveProperty('status');
  });

  it('edits an injection through the injection endpoint, with its site', () => {
    const screen = renderScreen(
      buildEntry({
        id: 'inj-1',
        entry_type: 'injection',
        site: 'stomach_upper_left',
        med_name_snapshot: 'Wegovy',
      })
    );
    expect(screen.getByText('picker-value-stomach_upper_left')).toBeTruthy();
    expect(screen.queryByText('opt-skipped')).toBeNull();

    fireEvent.press(screen.getByText('opt-stomach_upper_right'));
    fireEvent.press(screen.getByText('mock-time-sheet'));
    pressAction(screen, mockNavigation, 'Save');

    expect(updateInjectionMutate).toHaveBeenCalledWith(
      {
        id: 'inj-1',
        body: {
          injected_at: '2026-10-14T21:15:00.000Z',
          entry_date: '2026-10-14',
          site: 'stomach_upper_right',
          notes: null,
        },
      },
      expect.any(Object)
    );
    expect(updateEntryMutate).not.toHaveBeenCalled();
  });

  it('can clear an injection site', () => {
    const screen = renderScreen(
      buildEntry({ entry_type: 'injection', site: 'stomach_upper_left' })
    );
    fireEvent.press(screen.getByText('opt-none'));
    pressAction(screen, mockNavigation, 'Save');
    expect(updateInjectionMutate.mock.calls[0]![0].body.site).toBeNull();
  });
});
