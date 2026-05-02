import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ExerciseDetailScreen from '../../src/screens/ExerciseDetailScreen';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
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

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

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

describe('ExerciseDetailScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  } as any;

  const buildRoute = (overrides: Partial<Exercise> = {}) => ({
    key: 'ExerciseDetail-key',
    name: 'ExerciseDetail' as const,
    params: { item: { ...baseExercise, ...overrides } },
  });

  const renderScreen = (overrides: Partial<Exercise> = {}) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <ExerciseDetailScreen navigation={navigation} route={buildRoute(overrides) as any} />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
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
});
