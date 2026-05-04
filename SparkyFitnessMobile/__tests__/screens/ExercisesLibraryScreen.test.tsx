import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ExercisesLibraryScreen from '../../src/screens/ExercisesLibraryScreen';
import { useExercisesLibrary, useServerConnection } from '../../src/hooks';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/hooks', () => ({
  useExercisesLibrary: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseExercisesLibrary = useExercisesLibrary as jest.MockedFunction<typeof useExercisesLibrary>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createExercise(id: string, name: string, category: string | null = 'strength'): Exercise {
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

const buildHookReturn = (overrides: Partial<LibraryHookReturn> = {}): LibraryHookReturn => ({
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
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

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
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
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
      }),
    );

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.getByText('Squat')).toBeTruthy();

    fireEvent.press(screen.getByText('Bench Press'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'ExerciseDetail',
      expect.objectContaining({
        item: expect.objectContaining({ id: 'ex-1', name: 'Bench Press' }),
      }),
    );
  });

  it('passes the typed term to useExercisesLibrary as the user types', async () => {
    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search exercises...'), 'sq');
    });

    expect(mockUseExercisesLibrary).toHaveBeenLastCalledWith('sq', { enabled: true });
  });

  it('renders the no-server state when disconnected', () => {
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('No server configured')).toBeTruthy();
    fireEvent.press(screen.getByText('Go to Settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
  });

  it('renders an error state with a working Retry button', () => {
    const refetch = jest.fn();
    mockUseExercisesLibrary.mockReturnValue(
      buildHookReturn({ isError: true, refetch }),
    );

    const screen = renderScreen();

    expect(screen.getByText('Failed to load exercises')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
