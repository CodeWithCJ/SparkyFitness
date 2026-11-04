import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutSettingsScreen from '../../src/screens/WorkoutSettingsScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

const mockPresent = jest.fn();
let sheetOnChange: ((seconds: number) => void) | null = null;

jest.mock('../../src/components/RestPeriodSheet', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (props: { onChange: (seconds: number) => void }, ref: unknown) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: mockPresent,
          dismiss: jest.fn(),
        }));
        sheetOnChange = props.onChange;
        return null;
      }
    ),
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/services/api/workoutCoachingApi', () => ({
  fetchWorkoutCoachingSettings: jest.fn(async () => ({
    adaptive_suggestions: true,
  })),
  saveWorkoutCoachingSettings: jest.fn(async (settings) => settings),
}));

const mockNavigation = { goBack: jest.fn(), setOptions: jest.fn() } as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const navigation = mockNavigation;
const route = { params: {} } as any;

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkoutSettingsScreen navigation={navigation} route={route} />
    </QueryClientProvider>
  );
}

describe('WorkoutSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sheetOnChange = null;
    __resetAppPreferencesStoreForTests();
  });

  it('renders the "Workout Settings" header', () => {
    const { getByText, queryByText } = renderScreen();
    if (Platform.OS === 'ios') {
      // On iOS the title is provided by the native stack header (configured in
      // App.tsx via createStackScreenOptions), so the inline title is hidden.
      expect(queryByText('Workout Settings')).toBeNull();
    } else {
      expect(getByText('Workout Settings')).toBeTruthy();
    }
  });

  it('shows the default rest period row with the current value', () => {
    const { getByText } = renderScreen();
    expect(getByText('Default rest period')).toBeTruthy();
    expect(getByText('1:30')).toBeTruthy();
  });

  it('opens the rest period sheet at the current value when the dropdown is tapped', () => {
    useAppPreferencesStore.getState().setDefaultRestSec(120);
    const { getByText } = renderScreen();
    fireEvent.press(getByText('2:00'));
    expect(mockPresent).toHaveBeenCalledWith(120);
  });

  it('persists the value picked in the sheet and updates the row', () => {
    const { getByText } = renderScreen();
    act(() => {
      sheetOnChange!(150);
    });
    expect(useAppPreferencesStore.getState().defaultRestSec).toBe(150);
    expect(getByText('2:30')).toBeTruthy();
  });

  it('toggles the rest timer sound preference from the switch', () => {
    const { getByLabelText } = renderScreen();
    const soundToggle = getByLabelText('Rest timer sound');
    expect(soundToggle.props.value).toBe(true);

    fireEvent(soundToggle, 'valueChange', false);
    expect(useAppPreferencesStore.getState().restTimerSoundEnabled).toBe(false);
  });

  it('toggles the keep screen awake preference from the switch', () => {
    const { getByLabelText } = renderScreen();
    const keepAwakeToggle = getByLabelText('Keep screen awake');
    expect(keepAwakeToggle.props.value).toBe(false);

    fireEvent(keepAwakeToggle, 'valueChange', true);
    expect(useAppPreferencesStore.getState().workoutKeepAwakeEnabled).toBe(
      true
    );
  });

  it('saves the adaptive suggestions account setting from the switch', async () => {
    const {
      saveWorkoutCoachingSettings,
    } = require('../../src/services/api/workoutCoachingApi');
    const { getByLabelText } = renderScreen();
    const adaptiveToggle = getByLabelText('Adaptive suggestions');
    expect(adaptiveToggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(adaptiveToggle, 'valueChange', false);
    });
    expect(saveWorkoutCoachingSettings).toHaveBeenCalledWith(
      { adaptive_suggestions: false },
      expect.anything()
    );
  });

  it('toggles lowering music during cues (off by default)', () => {
    const { getByLabelText } = renderScreen();
    const duckToggle = getByLabelText('Lower music during cues');
    expect(duckToggle.props.value).toBe(false);
    fireEvent(duckToggle, 'valueChange', true);
    expect(useAppPreferencesStore.getState().duckMusicDuringCues).toBe(true);
  });

  it('shows guided workout options only once guided mode is on', async () => {
    const Speech = require('expo-speech');
    const { AppState } = require('react-native');
    Object.defineProperty(AppState, 'currentState', {
      get: () => 'active',
      configurable: true,
    });
    const { getByLabelText, getAllByText, getByText, queryByText } =
      renderScreen();
    expect(queryByText('Speech rate')).toBeNull();

    const guidedToggle = getByLabelText('Guided mode');
    expect(guidedToggle.props.value).toBe(false);
    await act(async () => {
      fireEvent(guidedToggle, 'valueChange', true);
    });
    expect(useAppPreferencesStore.getState().guidedWorkoutEnabled).toBe(true);

    // Each row title also heads its picker sheet.
    expect(getAllByText('Voice').length).toBeGreaterThan(0);
    expect(getAllByText('Speech rate').length).toBeGreaterThan(0);
    expect(getAllByText('Get-ready countdown').length).toBeGreaterThan(0);
    expect(Speech.getAvailableVoicesAsync).toHaveBeenCalled();

    fireEvent.press(getByText('Test voice'));
    expect(Speech.speak).toHaveBeenCalledWith(
      'This is how your guided workouts will sound.',
      expect.objectContaining({ rate: 1 })
    );
  });

  it('says the focus view does not apply while guided mode is on', () => {
    const { queryByText, getByText } = renderScreen();
    expect(
      queryByText(
        'Guided workouts always use the list. Focus applies when guided mode is off.'
      )
    ).toBeNull();
    expect(getByText(/^List shows every exercise/)).toBeTruthy();

    act(() => {
      useAppPreferencesStore.getState().setGuidedWorkoutEnabled(true);
    });
    expect(
      getByText(
        'Guided workouts always use the list. Focus applies when guided mode is off.'
      )
    ).toBeTruthy();
    expect(queryByText(/^List shows every exercise/)).toBeNull();
  });

  it('shows the focus photo row only in the focus view and the Now card only in the list view', () => {
    const { getByText, queryByText, queryByTestId, getByTestId } =
      renderScreen();
    expect(getByTestId('workout-view-picker')).toBeTruthy();
    expect(queryByTestId('focus-media-picker')).toBeNull();
    expect(queryByText('Exercise photo')).toBeNull();
    expect(getByTestId('workout-now-card-switch')).toBeTruthy();

    fireEvent.press(getByText('Focus'));
    expect(useAppPreferencesStore.getState().activeWorkoutView).toBe('focus');
    expect(getByTestId('focus-media-picker')).toBeTruthy();
    expect(queryByTestId('workout-now-card-switch')).toBeNull();

    fireEvent.press(getByText('Small'));
    expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
      'minimized'
    );
    fireEvent.press(getByText('Large'));
    expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
      'expanded'
    );

    fireEvent.press(getByText('List'));
    expect(useAppPreferencesStore.getState().activeWorkoutView).toBe('list');
    expect(queryByTestId('focus-media-picker')).toBeNull();
  });

  it('localizes the Polish labels and rest accessibility fallback', async () => {
    const {
      default: i18n,
      initializeI18n,
    } = require('../../src/localization/i18n');
    await initializeI18n('pl');
    const { getByText, getAllByRole } = renderScreen();

    expect(getByText('Domyślny okres odpoczynku')).toBeTruthy();
    expect(getByText('Dźwięk timera odpoczynku')).toBeTruthy();
    expect(getAllByRole('switch')[0].props.accessibilityLabel).toBe(
      'Dźwięk timera odpoczynku'
    );
    expect(
      i18n.t('workoutSettings.defaultRestAccessibility', {
        defaultValue: 'Default rest period, {{duration}}',
        duration: '1:30',
      })
    ).toBe('Domyślny odpoczynek: 1:30');
  });
});
