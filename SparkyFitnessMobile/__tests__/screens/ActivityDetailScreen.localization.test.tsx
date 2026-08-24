import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import ActivityDetailScreen from '../../src/screens/ActivityDetailScreen';
import { useDeleteExerciseEntry, useUpdateExerciseEntry } from '../../src/hooks/useExerciseMutations';
import { useActivityForm } from '../../src/hooks/useActivityForm';

jest.mock('../../src/hooks/useExerciseMutations', () => ({
  useDeleteExerciseEntry: jest.fn(),
  useUpdateExerciseEntry: jest.fn(),
}));
jest.mock('../../src/hooks/useActivityForm', () => ({
  useActivityForm: jest.fn(),
  getActivityDraftSubmission: jest.fn(() => ({
    exerciseId: 'exercise-1', exerciseName: 'Dragon Run', durationMinutes: 30,
    caloriesBurned: 200, entryDate: '2026-07-29', distanceKm: null,
    avgHeartRate: null, notes: null, hasDuration: true, hasCalories: true,
    hasDistance: false, canSave: true,
  })),
}));
jest.mock('../../src/hooks/usePreferences', () => ({ usePreferences: jest.fn(() => ({ preferences: undefined })) }));
jest.mock('../../src/hooks/useExerciseImageSource', () => ({ useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })) }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({ useActiveWorkoutBarPadding: jest.fn(() => 0) }));
jest.mock('../../src/services/nativeTabBarPreference', () => ({ useNativeIOSHeadersActive: jest.fn(() => false) }));
jest.mock('../../src/components/EditableSetList', () => () => null);
jest.mock('../../src/components/CalendarSheet', () => { const ReactModule = require('react'); const MockCalendar = ReactModule.forwardRef(() => null); return { __esModule: true, default: MockCalendar }; });
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('../../src/components/FadeView', () => ({ children }: any) => <>{children}</>);
jest.mock('../../src/components/SafeImage', () => () => null);
jest.mock('../../src/components/FormInput', () => (props: any) => { const { Text: RNText } = require('react-native'); return <RNText testID="form-input">{props.placeholder}</RNText>; });
jest.mock('../../src/components/ui/Button', () => ({ children, onPress, disabled }: any) => { const { Text: RNText, TouchableOpacity: RNPressable } = require('react-native'); return <RNPressable onPress={onPress} disabled={disabled}><RNText>{children}</RNText></RNPressable>; });
jest.mock('../../src/hooks/useScreenHeader', () => ({
  SAVE_LABEL: 'Save', SAVING_LABEL: 'Saving...',
  useScreenHeader: (options: any) => { const { View: RNView, TouchableOpacity: RNPressable, Text: RNText } = require('react-native'); return <RNView>
      {options.right?.onPress && <RNPressable onPress={options.right.onPress}><RNText>{options.right.busy ? options.right.busyLabel : options.right.label}</RNText></RNPressable>}
      {options.left?.onPress && <RNPressable onPress={options.left.onPress}><RNText>{options.left.accessibilityLabel}</RNText></RNPressable>}
    </RNView>; },
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })) }));
jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({ syncExerciseSessionInCache: jest.fn() }));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockDelete = useDeleteExerciseEntry as jest.MockedFunction<typeof useDeleteExerciseEntry>;
const mockUpdate = useUpdateExerciseEntry as jest.MockedFunction<typeof useUpdateExerciseEntry>;
const mockForm = useActivityForm as jest.MockedFunction<typeof useActivityForm>;
const navigation = { goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn() } as any;

const session = {
  type: 'individual', id: 'entry-1', exercise_id: 'exercise-1', name: 'Dragon Run',
  duration_minutes: 30, calories_burned: 200, entry_date: '2026-07-29',
  entry_time: null, notes: null, distance: null, avg_heart_rate: null, source: 'manual',
  sets: [], exercise_snapshot: { name: 'Dragon Run', category: 'Cardio', images: [] },
  activity_details: [], superset_group: null,
} as any;

function renderScreen() {
  return render(<SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}><ActivityDetailScreen navigation={navigation} route={{ key: 'activity', name: 'ActivityDetail', params: { session } } as any} /></SafeAreaProvider>);
}

describe('ActivityDetailScreen localization', () => {
  let pending = false;
  beforeEach(async () => {
    await act(async () => { await initializeI18n('en'); await i18n.changeLanguage('en'); });
    jest.clearAllMocks(); pending = false;
    mockDelete.mockImplementation(() => ({ isPending: pending, confirmAndDelete: jest.fn() } as any));
    mockUpdate.mockReturnValue({ updateEntry: jest.fn(), isPending: false, invalidateCache: jest.fn() } as any);
    mockForm.mockReturnValue({
      state: { name: 'Dragon Run', exerciseId: 'exercise-1', exerciseName: 'Dragon Run', duration: '30', calories: '200', distance: '', avgHeartRate: '', entryDate: '2026-07-29', notes: '' }, setName: jest.fn(), setDuration: jest.fn(), setDistance: jest.fn(),
      setCalories: jest.fn(), setAvgHeartRate: jest.fn(), setDate: jest.fn(), setNotes: jest.fn(),
      populate: jest.fn(),
    } as any);
  });

  it('covers empty-note fallback, literal notes, and localized delete states', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByText('Add notes...')).toBeTruthy();
    expect(screen.getByText('Delete Activity')).toBeTruthy();

    await act(async () => { await i18n.changeLanguage('pl'); });
    expect(screen.getByText('Dodaj notatki...')).toBeTruthy();
    expect(screen.queryByText('Add notes...')).toBeNull();
    expect(screen.getByText('Usuń aktywność')).toBeTruthy();
    expect(screen.queryByText('Delete Activity')).toBeNull();

    screen.unmount();
    mockForm.mockReturnValue({
      state: { name: 'Dragon Run', exerciseId: 'exercise-1', exerciseName: 'Dragon Run', duration: '30', calories: '200', distance: '', avgHeartRate: '', entryDate: '2026-07-29', notes: 'Dragon custom note 123' }, setName: jest.fn(), setDuration: jest.fn(),
      setDistance: jest.fn(), setCalories: jest.fn(), setAvgHeartRate: jest.fn(), setDate: jest.fn(),
      setNotes: jest.fn(), populate: jest.fn(),
    } as any);
    const literal = renderScreen();
    fireEvent.press(literal.getByText('Edytuj')); 
    expect(literal.getByText('Dragon custom note 123')).toBeTruthy();
    literal.unmount();

    pending = true;
    mockDelete.mockReturnValue({ isPending: true, confirmAndDelete: jest.fn() } as any);
    const deleting = renderScreen();
    fireEvent.press(deleting.getByText('Edytuj'));
    expect(deleting.getByText('Usuwanie…')).toBeTruthy();
    expect(deleting.queryByText('Deleting...')).toBeNull();
    deleting.unmount();
    await act(async () => { await i18n.changeLanguage('en'); });
  });
});
