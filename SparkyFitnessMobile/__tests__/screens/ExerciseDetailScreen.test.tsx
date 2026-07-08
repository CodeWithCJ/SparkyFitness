import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { pressAction, expectActionPresent } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ExerciseDetailScreen from '../../src/screens/ExerciseDetailScreen';
import {
  useDeleteExerciseLibrary,
  useProfile,
  useServerConnection,
} from '../../src/hooks';
import { fetchExerciseById } from '../../src/services/api/exerciseApi';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/hooks', () => ({
  useDeleteExerciseLibrary: jest.fn(),
  useProfile: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseById: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
}));

jest.mock('../../src/hooks/useStartLiveWorkout', () => ({
  useStartLiveWorkout: jest.fn(() => ({ startLiveWorkout: jest.fn(), isStarting: false })),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockUseDeleteExerciseLibrary =
  useDeleteExerciseLibrary as jest.MockedFunction<typeof useDeleteExerciseLibrary>;
const mockFetchExerciseById = fetchExerciseById as jest.MockedFunction<
  typeof fetchExerciseById
>;
const mockConfirmAndDelete = jest.fn();

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

let queryClient: QueryClient;

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <SafeAreaProvider initialMetrics={{ insets, frame }}>{children}</SafeAreaProvider>
  </QueryClientProvider>
);

const baseExercise: Exercise = {
  id: 'ex-1',
  name: 'Bench Press',
  category: 'strength',
  equipment: ['barbell', 'bench'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps', 'shoulders'],
  calories_per_hour: 360,
  source: 'sparky',
  images: [],
  tags: [],
};

const ownedCustomExercise: Exercise = {
  ...baseExercise,
  source: 'custom',
  userId: 'user-1',
  isCustom: true,
};

describe('ExerciseDetailScreen', () => {
  const navigation = mockNavigation;

  const buildRoute = (overrides: Partial<Exercise> = {}) => ({
    key: 'ExerciseDetail-key',
    name: 'ExerciseDetail' as const,
    params: { item: { ...baseExercise, ...overrides } },
  });

  const renderScreen = (overrides: Partial<Exercise> = {}) =>
    render(
      <Providers>
        <ExerciseDetailScreen navigation={navigation} route={buildRoute(overrides) as any} />
      </Providers>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-1' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    mockUseDeleteExerciseLibrary.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      isPending: false,
    });
  });

  it('renders the exercise fields from the route param', () => {
    const screen = renderScreen();

    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('strength')).toBeTruthy();
    expect(screen.getByText('360')).toBeTruthy();
    expect(screen.getByText('Barbell, Bench')).toBeTruthy();
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Triceps, Shoulders')).toBeTruthy();

    fireEvent.press(screen.getByText('Exercise details'));
    expect(screen.getByText('sparky')).toBeTruthy();
  });

  it('navigates to ActivityAdd with the selected exercise when Log Exercise is pressed', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Log Exercise'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'ActivityAdd',
      expect.objectContaining({
        selectedExercise: expect.objectContaining({ id: 'ex-1', name: 'Bench Press' }),
        selectionNonce: expect.any(Number),
      }),
    );
  });

  it('shows Start Workout and Log Exercise by default', () => {
    const screen = renderScreen();

    expect(screen.queryByText('Start Workout')).toBeTruthy();
    expect(screen.queryByText('Log Exercise')).toBeTruthy();
  });

  it('hides Start Workout and Log Exercise when hideWorkoutActions is set', () => {
    const route = {
      key: 'ExerciseDetail-key',
      name: 'ExerciseDetail' as const,
      params: { item: baseExercise, hideWorkoutActions: true },
    };
    const screen = render(
      <Providers>
        <ExerciseDetailScreen navigation={navigation} route={route as any} />
      </Providers>,
    );

    expect(screen.queryByText('Start Workout')).toBeNull();
    expect(screen.queryByText('Log Exercise')).toBeNull();
  });

  it('hides empty optional sections', () => {
    const screen = renderScreen({
      equipment: [],
      primary_muscles: [],
      secondary_muscles: [],
      calories_per_hour: 0,
    });

    expect(screen.queryByText('Equipment')).toBeNull();
    expect(screen.queryByText('Primary muscles')).toBeNull();
    expect(screen.queryByText('Secondary muscles')).toBeNull();
    expect(screen.queryByText('Calories / hour')).toBeNull();
  });

  it('shows Edit and Delete for non-custom exercises even when the user matches', () => {
    const screen = renderScreen({ source: 'sparky', userId: 'user-1', isCustom: true });

    expectActionPresent(screen, navigation, 'Edit');
    expect(screen.queryByText('Delete Exercise')).toBeTruthy();
    
  });


  it('hides Edit and Delete when the user does not own the exercise', () => {
    const screen = renderScreen({ source: 'custom', userId: 'someone-else', isCustom: true });

    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete Exercise')).toBeNull();
  });

  it('hides Edit and Delete when offline', () => {
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const screen = renderScreen(ownedCustomExercise);

    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete Exercise')).toBeNull();
  });

  it('shows Edit and navigates to ExerciseForm in edit mode for an owned custom exercise', () => {
    const screen = renderScreen(ownedCustomExercise);

    pressAction(screen, navigation, 'Edit');

    expect(navigation.navigate).toHaveBeenCalledWith(
      'ExerciseForm',
      expect.objectContaining({
        mode: 'edit-exercise',
        returnKey: 'ExerciseDetail-key',
        exercise: expect.objectContaining({ id: 'ex-1' }),
      }),
    );
  });

  it('shows Delete and triggers confirmAndDelete', () => {
    const screen = renderScreen(ownedCustomExercise);

    fireEvent.press(screen.getByText('Delete Exercise'));

    expect(mockConfirmAndDelete).toHaveBeenCalledTimes(1);
  });

  it('reflects updatedItem when route params change', () => {
    const route = {
      key: 'ExerciseDetail-key',
      name: 'ExerciseDetail' as const,
      params: { item: ownedCustomExercise },
    };
    const screen = render(
      <Providers>
        <ExerciseDetailScreen navigation={navigation} route={route as any} />
      </Providers>,
    );
    expect(screen.getByText('Bench Press')).toBeTruthy();

    screen.rerender(
      <Providers>
        <ExerciseDetailScreen
          navigation={navigation}
          route={
            {
              ...route,
              params: {
                item: ownedCustomExercise,
                updatedItem: { ...ownedCustomExercise, name: 'Bench Press 2' },
              },
            } as any
          }
        />
      </Providers>,
    );

    expect(screen.getByText('Bench Press 2')).toBeTruthy();
  });

  describe('hydration by id', () => {
    const uuidId = '11111111-1111-4111-8111-111111111111';

    it('hydrates a sparse item with the full catalog record fetched by id', async () => {
      mockFetchExerciseById.mockResolvedValue({
        ...baseExercise,
        id: uuidId,
        name: 'Hydrated Bench Press',
        primary_muscles: ['pectorals'],
      });

      // Sparse item: only id/name known, no muscles.
      const screen = renderScreen({
        id: uuidId,
        name: 'Sparse Bench',
        equipment: [],
        primary_muscles: [],
        secondary_muscles: [],
      });

      expect(screen.getByText('Sparse Bench')).toBeTruthy();

      await waitFor(() => expect(screen.getByText('Hydrated Bench Press')).toBeTruthy());
      expect(mockFetchExerciseById).toHaveBeenCalledWith(uuidId);
      expect(screen.getByText('Pectorals')).toBeTruthy();
    });

    it('does not fetch for a non-UUID id', () => {
      renderScreen({ id: 'not-a-uuid' });
      expect(mockFetchExerciseById).not.toHaveBeenCalled();
    });

    it('does not fetch while offline', () => {
      mockUseServerConnection.mockReturnValue({
        isConnected: false,
        isLoading: false,
        isError: false,
        error: null,
      } as any);
      renderScreen({ id: uuidId });
      expect(mockFetchExerciseById).not.toHaveBeenCalled();
    });
  });
});
