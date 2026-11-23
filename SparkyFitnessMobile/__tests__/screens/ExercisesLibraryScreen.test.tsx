import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExercisesLibraryScreen from '../../src/screens/ExercisesLibraryScreen';
import { useExercisesLibrary, useServerConnection } from '../../src/hooks';
import type { Exercise } from '../../src/types/exercise';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { pressHeaderMenuAction } from './helpers/nativeHeaderTestUtils';

jest.mock('../../src/offline/offlineImages', () => ({
  setExercisesKeptOffline: jest.fn(async () => {}),
  refreshOfflineImages: jest.fn(async () => {}),
}));
jest.mock('../../src/hooks/useKeptExercises', () => ({
  useKeptExercises: jest.fn(() => new Set(['ex-2'])),
}));
jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));

jest.mock('../../src/hooks', () => ({
  useExercisesLibrary: jest.fn(),
  useServerConnection: jest.fn(),
  useProfile: jest.fn(() => ({ profile: undefined, isLoading: false })),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

// The row thumbnail's hook calls useFocusEffect, which needs a navigation
// context this screen's tests don't mount. Mocked the same way
// ExerciseSearchScreen's tests do.
jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({
    getImageSource: jest.fn((path: string) => ({ uri: path, headers: {} })),
  })),
}));

const mockUseExercisesLibrary = useExercisesLibrary as jest.MockedFunction<
  typeof useExercisesLibrary
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createExercise(
  id: string,
  name: string,
  category: string | null = 'strength'
): Exercise {
  return {
    id,
    name,
    category,
    equipment: ['barbell'],
    primary_muscles: ['chest'],
    secondary_muscles: ['triceps'],
    calories_per_hour: 300,
    source: 'sparky',
    images: [],
    tags: [],
  };
}

type LibraryHookReturn = ReturnType<typeof useExercisesLibrary>;

const buildHookReturn = (
  overrides: Partial<LibraryHookReturn> = {}
): LibraryHookReturn => ({
  exercises: [],
  isLoading: false,
  isSearching: false,
  isError: false,
  isFetchNextPageError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: jest.fn(),
  refetch: jest.fn(),
  ...overrides,
});

describe('ExercisesLibraryScreen', () => {
  const navigation = mockNavigation;

  const route = {
    key: 'ExercisesLibrary-key',
    name: 'ExercisesLibrary' as const,
    params: undefined,
  };

  const renderScreen = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <ExercisesLibraryScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseExercisesLibrary.mockReturnValue(buildHookReturn());
  });

  it('lists exercises from the library hook and navigates to ExerciseDetail', async () => {
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({
        exercises: [
          createExercise('ex-1', 'Bench Press'),
          createExercise('ex-2', 'Squat'),
        ],
      })
    );

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getByText('Squat')).toBeTruthy();

    fireEvent.press(screen.getByText('Bench Press'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'ExerciseDetail',
      expect.objectContaining({
        item: expect.objectContaining({ id: 'ex-1', name: 'Bench Press' }),
      })
    );
  });

  it('passes the typed term to useExercisesLibrary as the user types', async () => {
    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Search exercises...'),
        'sq'
      );
    });

    expect(mockUseExercisesLibrary).toHaveBeenLastCalledWith('sq', {
      enabled: true,
    });
  });

  it('persists an ownership filter chosen from the header menu and filters the list', async () => {
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({
        exercises: [
          createExercise('ex-1', 'Bench Press'),
          {
            ...createExercise('ex-2', 'Community Squat'),
            sharedWithPublic: true,
          } as Exercise,
        ],
      })
    );

    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());

    pressHeaderMenuAction(navigation, 'Public');

    expect(
      useAppPreferencesStore.getState().exercisesLibraryOwnershipFilter
    ).toBe('public');
    expect(screen.getByText('Community Squat')).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  it('renders the no-server state when disconnected', () => {
    mockUseServerConnection.mockReturnValue({
      status: 'notConfigured',
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('No server configured')).toBeTruthy();
    fireEvent.press(screen.getByText('Go to Settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Settings',
    });
  });

  it('renders an error state with a working Retry button', () => {
    const refetch = jest.fn();
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({ isError: true, refetch })
    );

    const screen = renderScreen();

    expect(screen.getByText('Failed to load exercises')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
  it('selects exercises with a long press and keeps their pictures offline', async () => {
    const { setExercisesKeptOffline } = jest.requireMock(
      '../../src/offline/offlineImages'
    ) as { setExercisesKeptOffline: jest.Mock };
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({
        exercises: [
          createExercise('ex-1', 'Bench Press'),
          createExercise('ex-2', 'Squat'),
        ],
      })
    );
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    // Already kept: marked in the list.
    expect(screen.getByLabelText('Kept offline')).toBeTruthy();

    fireEvent(screen.getByTestId('exercise-row-ex-1'), 'longPress');
    // While selecting, a tap selects instead of opening the exercise.
    fireEvent.press(screen.getByText('Squat'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('exercise-selection-count')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('exercise-selection-keep'));
    });

    expect(setExercisesKeptOffline).toHaveBeenCalledWith(
      's1',
      ['ex-1', 'ex-2'],
      true
    );
    expect(screen.queryByTestId('exercise-selection-count')).toBeNull();
  });

  it('leaves selection without changing anything on Cancel', async () => {
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({ exercises: [createExercise('ex-1', 'Bench Press')] })
    );
    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());

    fireEvent(screen.getByTestId('exercise-row-ex-1'), 'longPress');
    fireEvent.press(screen.getByTestId('exercise-selection-cancel'));

    expect(screen.queryByTestId('exercise-selection-count')).toBeNull();
    fireEvent.press(screen.getByText('Bench Press'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'ExerciseDetail',
      expect.anything()
    );
  });
});
