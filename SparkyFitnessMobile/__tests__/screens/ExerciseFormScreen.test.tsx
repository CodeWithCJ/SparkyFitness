import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { pressAction, expectActionPresent } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import ExerciseFormScreen, {
  buildCreatePayload,
  buildEditPayload,
  splitCsvList,
  joinCsvList,
  splitLines,
  joinLines,
} from '../../src/screens/ExerciseFormScreen';
import { useCreateExercise, useUpdateExercise } from '../../src/hooks';
import type { Exercise } from '../../src/types/exercise';

jest.mock('../../src/hooks', () => ({
  useCreateExercise: jest.fn(),
  useUpdateExercise: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, onSelect, renderTrigger, value }: any) => (
      <View>
        {renderTrigger?.({
          onPress: () => {},
          selectedOption: options.find((option: any) => option.value === value),
        })}
        {options.map((option: any) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{`opt-${option.value}`}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockUseCreateExercise = useCreateExercise as jest.MockedFunction<typeof useCreateExercise>;
const mockUseUpdateExercise = useUpdateExercise as jest.MockedFunction<typeof useUpdateExercise>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const baseExercise: Exercise = {
  id: 'ex-1',
  name: 'Bench Press',
  category: 'strength',
  equipment: ['barbell', 'bench'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  calories_per_hour: 360,
  source: 'custom',
  images: [],
  tags: [],
  instructions: ['Lie on bench', 'Press up'],
  description: 'Standard barbell bench press',
  level: 'intermediate',
  force: 'push',
  mechanic: 'compound',
  userId: 'user-1',
  isCustom: true,
};

describe('ExerciseFormScreen — helpers', () => {
  it('splitCsvList trims, dedupes, and drops empties', () => {
    expect(splitCsvList(' barbell, bench, barbell ,, ')).toEqual(['barbell', 'bench']);
  });

  it('joinCsvList round-trips', () => {
    expect(joinCsvList(['barbell', 'bench'])).toBe('barbell, bench');
  });

  it('splitLines drops blanks and trims', () => {
    expect(splitLines('Step 1\n  Step 2  \n\n')).toEqual(['Step 1', 'Step 2']);
  });

  it('joinLines uses newlines', () => {
    expect(joinLines(['a', 'b'])).toBe('a\nb');
  });
});

describe('ExerciseFormScreen — buildCreatePayload', () => {
  const blankState = {
    name: '',
    category: 'strength',
    caloriesPerHourText: '',
    description: '',
    equipment: '',
    primaryMuscles: '',
    secondaryMuscles: '',
    instructions: '',
    level: null,
    force: null,
    mechanic: null,
  };

  it('omits empty advanced fields', () => {
    expect(buildCreatePayload('Lunges', blankState, undefined)).toEqual({
      name: 'Lunges',
      category: 'strength',
      description: null,
    });
  });

  it('includes equipment, muscles, instructions, level, force, and mechanic when set', () => {
    const state = {
      ...blankState,
      caloriesPerHourText: '350',
      description: 'Notes',
      equipment: 'barbell, bench',
      primaryMuscles: 'chest',
      secondaryMuscles: 'triceps, shoulders',
      instructions: 'Lie on bench\nPress up',
      level: 'intermediate',
      force: 'push',
      mechanic: 'compound',
    };

    expect(buildCreatePayload('Bench Press', state, 350)).toEqual({
      name: 'Bench Press',
      category: 'strength',
      description: 'Notes',
      calories_per_hour: 350,
      equipment: ['barbell', 'bench'],
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps', 'shoulders'],
      instructions: ['Lie on bench', 'Press up'],
      level: 'intermediate',
      force: 'push',
      mechanic: 'compound',
    });
  });

  it('defaults missing category to "general"', () => {
    expect(
      buildCreatePayload('Lunges', { ...blankState, category: null }, undefined),
    ).toMatchObject({ category: 'general' });
  });
});

describe('ExerciseFormScreen — buildEditPayload', () => {
  it('returns an empty object when nothing changed', () => {
    const state = {
      name: baseExercise.name,
      category: baseExercise.category,
      caloriesPerHourText: String(baseExercise.calories_per_hour),
      description: baseExercise.description ?? '',
      equipment: joinCsvList(baseExercise.equipment),
      primaryMuscles: joinCsvList(baseExercise.primary_muscles),
      secondaryMuscles: joinCsvList(baseExercise.secondary_muscles),
      instructions: joinLines(baseExercise.instructions),
      level: baseExercise.level ?? null,
      force: baseExercise.force ?? null,
      mechanic: baseExercise.mechanic ?? null,
    };

    expect(buildEditPayload(baseExercise, state, baseExercise.calories_per_hour)).toEqual({});
  });

  it('includes only fields that changed', () => {
    const state = {
      name: 'Bench Press Variation',
      category: baseExercise.category,
      caloriesPerHourText: '400',
      description: baseExercise.description ?? '',
      equipment: joinCsvList(baseExercise.equipment),
      primaryMuscles: 'chest, shoulders',
      secondaryMuscles: joinCsvList(baseExercise.secondary_muscles),
      instructions: joinLines(baseExercise.instructions),
      level: baseExercise.level ?? null,
      force: baseExercise.force ?? null,
      mechanic: baseExercise.mechanic ?? null,
    };

    const payload = buildEditPayload(baseExercise, state, 400);

    expect(payload).toEqual({
      name: 'Bench Press Variation',
      calories_per_hour: 400,
      primary_muscles: ['chest', 'shoulders'],
    });
  });

  it('sends an empty string description to clear (not preserve) it', () => {
    const state = {
      name: baseExercise.name,
      category: baseExercise.category,
      caloriesPerHourText: String(baseExercise.calories_per_hour),
      description: '   ',
      equipment: joinCsvList(baseExercise.equipment),
      primaryMuscles: joinCsvList(baseExercise.primary_muscles),
      secondaryMuscles: joinCsvList(baseExercise.secondary_muscles),
      instructions: joinLines(baseExercise.instructions),
      level: baseExercise.level ?? null,
      force: baseExercise.force ?? null,
      mechanic: baseExercise.mechanic ?? null,
    };

    const payload = buildEditPayload(baseExercise, state, baseExercise.calories_per_hour);
    expect(payload).toEqual({ description: '' });
  });
});

describe('ExerciseFormScreen — create mode', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    navigate: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreateExercise.mockReturnValue({
      createExerciseAsync: jest.fn().mockResolvedValue({ id: 'ex-new', name: 'Lunges' }),
      isPending: false,
    } as any);
    mockUseUpdateExercise.mockReturnValue({
      updateExerciseAsync: jest.fn(),
      isPending: false,
    } as any);
  });

  it('shows error toast when name is missing', async () => {
    const route = {
      key: 'ExerciseForm-key',
      name: 'ExerciseForm' as const,
      params: { mode: 'create-exercise' as const },
    };
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <ExerciseFormScreen navigation={navigation} route={route as any} />
      </SafeAreaProvider>,
    );

    pressAction(screen, navigation, 'Save');

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Missing name' }),
      );
    });
  });
});

describe('ExerciseFormScreen — edit mode', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const updateExerciseAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    updateExerciseAsync.mockResolvedValue({ ...baseExercise, name: 'Bench Press 2' });
    mockUseCreateExercise.mockReturnValue({
      createExerciseAsync: jest.fn(),
      isPending: false,
    } as any);
    mockUseUpdateExercise.mockReturnValue({
      updateExerciseAsync,
      isPending: false,
    } as any);
  });

  it('skips the network call and just goes back when nothing changed', async () => {
    const route = {
      key: 'ExerciseForm-key',
      name: 'ExerciseForm' as const,
      params: {
        mode: 'edit-exercise' as const,
        exercise: baseExercise,
        returnKey: 'ExerciseDetail-key',
      },
    };
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <ExerciseFormScreen navigation={navigation} route={route as any} />
      </SafeAreaProvider>,
    );

    pressAction(screen, navigation, 'Save Changes');

    await waitFor(() => {
      expect(navigation.goBack).toHaveBeenCalled();
    });
    expect(updateExerciseAsync).not.toHaveBeenCalled();
  });

  it('dispatches setParams to the returnKey after a successful update', async () => {
    const route = {
      key: 'ExerciseForm-key',
      name: 'ExerciseForm' as const,
      params: {
        mode: 'edit-exercise' as const,
        exercise: baseExercise,
        returnKey: 'ExerciseDetail-key',
      },
    };

    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <ExerciseFormScreen navigation={navigation} route={route as any} />
      </SafeAreaProvider>,
    );

    // Change the name field to force a diff. Find the Name input by its placeholder.
    const nameInput = screen.getByPlaceholderText('e.g. Bulgarian Split Squat');
    fireEvent.changeText(nameInput, 'Bench Press 2');

    pressAction(screen, navigation, 'Save Changes');

    await waitFor(() => {
      expect(updateExerciseAsync).toHaveBeenCalledWith({
        id: 'ex-1',
        payload: { name: 'Bench Press 2' },
      });
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        ...CommonActions.setParams({
          updatedItem: expect.objectContaining({ name: 'Bench Press 2' }),
        }),
        source: 'ExerciseDetail-key',
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
