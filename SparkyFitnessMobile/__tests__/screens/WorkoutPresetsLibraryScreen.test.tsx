import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutPresetsLibraryScreen from '../../src/screens/WorkoutPresetsLibraryScreen';
import { useServerConnection, useWorkoutPresetsLibrary } from '../../src/hooks';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(),
  useWorkoutPresetsLibrary: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseWorkoutPresetsLibrary = useWorkoutPresetsLibrary as jest.MockedFunction<typeof useWorkoutPresetsLibrary>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createPreset(id: string, name: string, exerciseCount = 0): WorkoutPreset {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    is_public: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    exercises: Array.from({ length: exerciseCount }).map((_, idx) => ({
      id: `${id}-ex-${idx}`,
      exercise_id: `ex-${idx}`,
      image_url: null,
      exercise_name: `Exercise ${idx}`,
      sets: [],
    })),
  };
}

type LibraryHookReturn = ReturnType<typeof useWorkoutPresetsLibrary>;

const buildHookReturn = (overrides: Partial<LibraryHookReturn> = {}): LibraryHookReturn => ({
  presets: [],
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

describe('WorkoutPresetsLibraryScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

  const route = {
    key: 'WorkoutPresetsLibrary-key',
    name: 'WorkoutPresetsLibrary' as const,
    params: undefined,
  };

  const renderScreen = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <WorkoutPresetsLibraryScreen navigation={navigation} route={route} />
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
    mockUseWorkoutPresetsLibrary.mockReturnValue(buildHookReturn());
  });

  it('lists presets from the hook with their exercise counts', async () => {
    mockUseWorkoutPresetsLibrary.mockReturnValue(
      buildHookReturn({
        presets: [createPreset('p-1', 'Push Day', 3), createPreset('p-2', 'Leg Day', 1)],
      }),
    );

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());
    expect(screen.getByText('Leg Day')).toBeTruthy();
    expect(screen.getByText('3 exercises')).toBeTruthy();
    expect(screen.getByText('1 exercise')).toBeTruthy();
  });

  it('navigates to WorkoutPresetDetail with the preset on row tap', async () => {
    const preset = createPreset('p-1', 'Push Day', 2);
    mockUseWorkoutPresetsLibrary.mockReturnValue(
      buildHookReturn({ presets: [preset] }),
    );

    const screen = renderScreen();
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    fireEvent.press(screen.getByText('Push Day'));
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPresetDetail', { preset });
  });

  it('passes the typed term through to useWorkoutPresetsLibrary', async () => {
    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search workout presets...'), 'pu');
    });

    expect(mockUseWorkoutPresetsLibrary).toHaveBeenLastCalledWith('pu', { enabled: true });
  });

  it('renders search results as the hook returns them in search mode', async () => {
    mockUseWorkoutPresetsLibrary.mockReturnValue(
      buildHookReturn({ presets: [createPreset('p-search', 'Push Day Search Result', 2)] }),
    );

    const screen = renderScreen();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Search workout presets...'), 'pu');
    });

    await waitFor(() => expect(screen.getByText('Push Day Search Result')).toBeTruthy());
    expect(screen.getByText('2 exercises')).toBeTruthy();
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
    mockUseWorkoutPresetsLibrary.mockReturnValue(
      buildHookReturn({ isError: true, refetch }),
    );

    const screen = renderScreen();

    expect(screen.getByText('Failed to load workout presets')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty-state message when there are no presets', () => {
    const screen = renderScreen();
    expect(screen.getByText('No workout presets yet')).toBeTruthy();
  });
});
