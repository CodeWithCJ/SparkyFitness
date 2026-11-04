import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SortableExerciseItem } from '@/pages/Exercises/SortableExerciseItem';
import type { SortableExerciseItemData } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: string | ({ defaultValue?: string } & Record<string, unknown>)
    ) =>
      typeof options === 'string' || options == null
        ? options
        : (options.defaultValue ?? '').replace(/\{\{(\w+)\}\}/g, (_m, k) =>
            String(options[k])
          ),
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ distanceUnit: 'km' }),
}));

// Only rendered for non-cardio exercises, and its import chain initializes i18n.
jest.mock('@/components/ExerciseHistoryDisplay', () => ({
  __esModule: true,
  default: () => null,
}));

const createExercise = (
  fields: Record<string, unknown>
): SortableExerciseItemData =>
  ({
    id: 'entry-1',
    exercise_id: 'exercise-1',
    exercise_name: 'Test Exercise',
    ...fields,
  }) as unknown as SortableExerciseItemData;

// Pre-modality servers send only a category.
const createCardioExercise = (duration: number | undefined) =>
  createExercise({
    exercise_name: 'Treadmill Run',
    category: 'cardio',
    sets: [{ set_number: 1, duration }],
  });

const renderItem = (ex: SortableExerciseItemData, onSetChange = jest.fn()) => {
  const view = render(
    <SortableExerciseItem
      ex={ex}
      exerciseIndex={0}
      onRemoveExercise={() => {}}
      onSetChange={onSetChange}
      onDuplicateSet={() => {}}
      onRemoveSet={() => {}}
      weightUnit="kg"
    />
  );
  return { ...view, onSetChange };
};

const durationInput = () =>
  screen
    .getByText(/Duration \(min\)/)
    .closest('div')!
    .querySelector('input') as HTMLInputElement;

describe('SortableExerciseItem cardio duration boundary', () => {
  it('displays per-set duration seconds as minutes', () => {
    renderItem(createCardioExercise(300));

    expect(durationInput()).toHaveValue(5);
  });

  it('stores an entered minute value as seconds on set 0', () => {
    const { onSetChange } = renderItem(createCardioExercise(undefined));

    const input = durationInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });

    expect(onSetChange).toHaveBeenLastCalledWith(0, 0, 'duration', 300);
  });

  it('rounds a fractional minute entry to whole seconds', () => {
    const { onSetChange } = renderItem(createCardioExercise(undefined));

    const input = durationInput();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.25' } });

    expect(onSetChange).toHaveBeenLastCalledWith(0, 0, 'duration', 75);
  });

  it('uses the cardio editor when modality says so and the category does not', () => {
    renderItem(
      createExercise({
        category: 'general',
        modality: 'duration_distance',
        sets: [{ set_number: 1, duration: 600 }],
      })
    );

    expect(durationInput()).toHaveValue(10);
  });
});

describe('SortableExerciseItem set table columns', () => {
  it('shows reps and weight for a weight_reps exercise', () => {
    renderItem(
      createExercise({
        category: 'strength',
        modality: 'weight_reps',
        sets: [{ set_number: 1, reps: 10, weight: 60 }],
      })
    );

    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.getByText('weight')).toBeInTheDocument();
    expect(screen.getByText('Duration (s)')).toBeInTheDocument();
  });

  it('hides the weight column for a reps_only exercise', () => {
    renderItem(
      createExercise({
        category: 'strength',
        modality: 'reps_only',
        sets: [{ set_number: 1, reps: 12, weight: null }],
      })
    );

    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.queryByText('weight')).not.toBeInTheDocument();
  });

  it('hides the reps and weight columns for a duration exercise', () => {
    const { container } = renderItem(
      createExercise({
        category: 'isometric',
        modality: 'duration',
        sets: [{ set_number: 1, reps: null, weight: null, duration: 45 }],
      })
    );

    expect(screen.queryByText('Reps')).not.toBeInTheDocument();
    expect(screen.queryByText('weight')).not.toBeInTheDocument();
    expect(screen.getByText('Duration (s)')).toBeInTheDocument();
    // RPE, duration, rest — no reps or weight input in the row.
    expect(container.querySelectorAll('input')).toHaveLength(3);
  });

  it('shows a legacy isometric hold stored in reps as the duration', () => {
    const { container } = renderItem(
      createExercise({
        category: 'isometric',
        modality: 'duration',
        sets: [{ set_number: 1, reps: 45, weight: null, duration: null }],
      })
    );

    expect(container.querySelector('input[step="1"]')).toHaveValue(45);
  });
});

describe('SortableExerciseItem replace/duplicate exercise actions', () => {
  it('fires the replace and duplicate handlers with the entry index when clicked', () => {
    const onReplaceExercise = jest.fn();
    const onDuplicateExercise = jest.fn();
    render(
      <SortableExerciseItem
        ex={createExercise({
          category: 'strength',
          modality: 'weight_reps',
          sets: [{ set_number: 1, reps: 10, weight: 60 }],
        })}
        exerciseIndex={2}
        onRemoveExercise={() => {}}
        onSetChange={() => {}}
        onDuplicateSet={() => {}}
        onRemoveSet={() => {}}
        onReplaceExercise={onReplaceExercise}
        onDuplicateExercise={onDuplicateExercise}
        weightUnit="kg"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace exercise' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate exercise' }));

    expect(onReplaceExercise).toHaveBeenCalledWith(2);
    expect(onDuplicateExercise).toHaveBeenCalledWith(2);
  });

  it('omits the replace and duplicate buttons when their handlers are not provided', () => {
    renderItem(
      createExercise({
        category: 'strength',
        modality: 'weight_reps',
        sets: [{ set_number: 1, reps: 10, weight: 60 }],
      })
    );

    expect(
      screen.queryByRole('button', { name: 'Replace exercise' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Duplicate exercise' })
    ).not.toBeInTheDocument();
  });

  describe('per-set ramp and progression increment units', () => {
    const renderPresetItem = (
      fields: Record<string, unknown>,
      weightUnit: string
    ) => {
      const onExerciseFieldChange = jest.fn();
      render(
        <SortableExerciseItem
          ex={createExercise({
            category: 'strength',
            modality: 'weight_reps',
            sets: [{ set_number: 1, reps: 5, weight: 80 }],
            ...fields,
          })}
          exerciseIndex={0}
          onRemoveExercise={() => {}}
          onSetChange={() => {}}
          onDuplicateSet={() => {}}
          onRemoveSet={() => {}}
          onExerciseFieldChange={onExerciseFieldChange}
          weightUnit={weightUnit}
        />
      );
      return onExerciseFieldChange;
    };

    it('stores a pound ramp as kg and a negative one as a back-off', () => {
      const onExerciseFieldChange = renderPresetItem({}, 'lbs');
      const input = screen.getByLabelText('Add per set (this workout, lbs)');

      fireEvent.change(input, { target: { value: '10' } });
      expect(onExerciseFieldChange).toHaveBeenLastCalledWith(
        0,
        'ramp_increment',
        expect.closeTo(4.5359, 3)
      );

      fireEvent.change(input, { target: { value: '-10' } });
      expect(onExerciseFieldChange).toHaveBeenLastCalledWith(
        0,
        'ramp_increment',
        expect.closeTo(-4.5359, 3)
      );

      fireEvent.change(input, { target: { value: '' } });
      expect(onExerciseFieldChange).toHaveBeenLastCalledWith(
        0,
        'ramp_increment',
        null
      );
    });

    it('shows stored kg increments in the lifter unit', () => {
      renderPresetItem(
        {
          ramp_increment: 4.54,
          progression_mode: 'rep_goal',
          increment_type: 'weight',
          increment_value: 2.27,
        },
        'lbs'
      );
      expect(
        screen.getByLabelText('Add per set (this workout, lbs)')
      ).toHaveValue(10);
      expect(screen.getByPlaceholderText('+5')).toHaveValue(5);
    });

    it('stores a weight progression increment typed in pounds as kg', () => {
      const onExerciseFieldChange = renderPresetItem(
        { progression_mode: 'rep_goal', increment_type: 'weight' },
        'lbs'
      );
      fireEvent.change(screen.getByPlaceholderText('+5'), {
        target: { value: '5' },
      });
      expect(onExerciseFieldChange).toHaveBeenLastCalledWith(
        0,
        'increment_value',
        expect.closeTo(2.268, 3)
      );
    });

    // Presets have no exercise-level notes column; notes live on each set (#3110).
    it('has no exercise-level notes field', () => {
      renderPresetItem({}, 'kg');
      expect(
        screen.queryByText(/Exercise Notes \/ Cues/)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText(/Seat setting 4/)
      ).not.toBeInTheDocument();
    });

    it('omits the ramp where the edit cannot be saved', () => {
      renderItem(
        createExercise({
          category: 'strength',
          modality: 'weight_reps',
          sets: [{ set_number: 1, reps: 5, weight: 80 }],
        })
      );
      expect(screen.queryByLabelText(/Add per set/)).not.toBeInTheDocument();
    });
  });
});
