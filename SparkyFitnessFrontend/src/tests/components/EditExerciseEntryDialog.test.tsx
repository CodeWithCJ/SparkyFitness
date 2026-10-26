import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditExerciseEntryDialog from '@/pages/Diary/EditExerciseEntryDialog';
import type { ExerciseEntry } from '@/types/exercises';

const mockUpdateExerciseEntry = jest.fn();

// The published uuid build is ESM-only and ts-jest doesn't transform
// node_modules; the dialogs only need unique dnd keys.
let uuidSeq = 0;
jest.mock('uuid', () => ({ v4: () => `uuid-${++uuidSeq}` }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));

const KM_PER_MILE = 1.609344;
let mockDistanceUnit: 'km' | 'miles' = 'km';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'SILENT',
    weightUnit: 'kg',
    distanceUnit: mockDistanceUnit,
    convertDistance: (value: number, from: string, to: string) =>
      from === to
        ? value
        : from === 'km'
          ? value / KM_PER_MILE
          : value * KM_PER_MILE,
    timezone: 'UTC',
  }),
}));

jest.mock('@/utils/logging', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useUpdateExerciseEntryMutation: () => ({
    mutateAsync: mockUpdateExerciseEntry,
    isPending: false,
  }),
  exerciseDetailsOptions: (exerciseId: string) => ({
    queryKey: ['exercise', exerciseId],
    queryFn: () => ({ calories_per_hour: 600 }),
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    fetchQuery: async () => ({ calories_per_hour: 600 }),
  }),
  useQuery: () => ({ data: undefined, isLoading: false }),
}));

jest.mock('@/components/ExerciseHistoryDisplay', () => ({
  __esModule: true,
  default: () => <div data-testid="history" />,
}));

jest.mock('@/components/ExerciseActivityDetailsEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="activity-details" />,
}));

jest.mock('@/hooks/Shoes/useShoes', () => ({
  useAssignShoeMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/components/Shoes/ShoeSelect', () => ({
  ShoeSelect: () => <div data-testid="shoe-select" />,
}));

const cardioSet = {
  id: 7,
  set_number: 1,
  set_type: 'Working Set',
  reps: null,
  weight: null,
  duration: 1800,
  distance: 5.2,
  rest_time: 0,
  notes: null,
  rpe: null,
  completed_at: null,
  is_pr: false,
};

const makeEntry = (overrides?: Partial<ExerciseEntry>): ExerciseEntry =>
  ({
    id: 'entry-1',
    exercise_id: 'ex-1',
    entry_date: '2026-07-26',
    entry_time: null,
    duration_minutes: 30,
    calories_burned: 300,
    distance: 5.2,
    avg_heart_rate: null,
    notes: '',
    image_url: null,
    sets: [cardioSet],
    activity_details: [],
    exercise_snapshot: {
      id: 'ex-1',
      name: 'Running',
      category: 'Cardio',
      modality: 'duration_distance',
    },
    ...overrides,
  }) as unknown as ExerciseEntry;

const saveEntry = async () => {
  fireEvent.click(screen.getByText('Save Changes'));
  await waitFor(() => expect(mockUpdateExerciseEntry).toHaveBeenCalledTimes(1));
  return mockUpdateExerciseEntry.mock.calls[0][0] as {
    id: string;
    data: {
      distance: number | null;
      duration_minutes: number;
      calories_burned?: number;
      avg_heart_rate: number | null;
      calories_applied: number | null;
      steps: number | null;
      sets: Array<{
        duration?: number | null;
        distance?: number | null;
        rest_time?: number | null;
      }>;
    };
  };
};

const renderDialog = (entry: ExerciseEntry) =>
  render(
    <EditExerciseEntryDialog
      entry={entry}
      open
      onOpenChange={jest.fn()}
      onSave={jest.fn()}
    />
  );

describe('EditExerciseEntryDialog cardio set write', () => {
  beforeEach(() => {
    mockUpdateExerciseEntry.mockClear();
    mockUpdateExerciseEntry.mockResolvedValue(undefined);
  });

  it('writes the entry-level duration/distance into the single cardio set', async () => {
    renderDialog(makeEntry());

    const { data } = await saveEntry();
    expect(data.sets).toHaveLength(1);
    expect(data.sets[0]).toMatchObject({
      duration: 1800, // 30 min form value
      distance: 5.2,
      rest_time: 0,
    });
    expect(data.distance).toBe(5.2);
    expect(data.duration_minutes).toBe(30);
  });

  it('fabricates one set for a legacy set-less cardio entry', async () => {
    renderDialog(makeEntry({ sets: [] }));

    const { data } = await saveEntry();
    expect(data.sets).toHaveLength(1);
    expect(data.sets[0]).toMatchObject({
      set_type: 'Working Set',
      duration: 1800,
      distance: 5.2,
      rest_time: 0,
    });
  });

  it('leaves multi-set cardio rows untouched (no truncation, no overwrite)', async () => {
    renderDialog(
      makeEntry({
        sets: [
          cardioSet,
          { ...cardioSet, id: 8, set_number: 2, duration: 600, distance: 1.5 },
        ],
      })
    );

    const { data } = await saveEntry();
    expect(data.sets).toHaveLength(2);
    expect(data.sets[0]).toMatchObject({ duration: 1800, distance: 5.2 });
    expect(data.sets[1]).toMatchObject({ duration: 600, distance: 1.5 });
  });

  it('round-trips a strength entry distance instead of wiping it', async () => {
    renderDialog(
      makeEntry({
        distance: 3,
        sets: [
          {
            ...cardioSet,
            duration: null,
            distance: null,
            weight: 100,
            reps: 5,
            rest_time: 90,
          },
        ],
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          modality: 'weight_reps',
        },
      } as unknown as Partial<ExerciseEntry>)
    );

    const { data } = await saveEntry();
    expect(data.distance).toBe(3);
    // No cardio override lands on a strength set: rest survives, distance
    // stays absent on the set.
    expect(data.sets[0]).toMatchObject({ rest_time: 90, distance: null });
  });
});

describe('EditExerciseEntryDialog untouched fields', () => {
  beforeEach(() => {
    mockUpdateExerciseEntry.mockClear();
    mockUpdateExerciseEntry.mockResolvedValue(undefined);
    mockDistanceUnit = 'km';
  });

  // A synced workout stores values with more precision than the form shows.
  // Saving without touching them must send the stored values, or the server
  // records the rounding as the user's edit.
  const syncedEntry = () =>
    makeEntry({
      distance: 5.234,
      duration_minutes: 30.4567,
      avg_heart_rate: null,
      steps: null,
    } as unknown as Partial<ExerciseEntry>);

  it('sends the stored values for fields the user left alone', async () => {
    renderDialog(syncedEntry());

    const { data } = await saveEntry();
    expect(data.distance).toBe(5.234);
    expect(data.duration_minutes).toBe(30.4567);
    expect(data.avg_heart_rate).toBeNull();
    expect(data.steps).toBeNull();
  });

  it('sends the input for a field the user changed', async () => {
    renderDialog(syncedEntry());

    fireEvent.change(screen.getByDisplayValue('5.2'), {
      target: { value: '6' },
    });
    const { data } = await saveEntry();
    expect(data.distance).toBe(6);
    expect(data.duration_minutes).toBe(30.4567);
  });

  it('sends the counted calories typed in the advanced section', async () => {
    renderDialog(makeEntry());

    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.change(screen.getByLabelText(/Calories counted in daily total/), {
      target: { value: '0' },
    });
    const { data } = await saveEntry();
    expect(data.calories_applied).toBe(0);
    expect(data.calories_burned).toBe(300);
  });

  it('clears the override with null when the field is blank', async () => {
    renderDialog(makeEntry({ calories_applied: 120 }));

    const { data } = await saveEntry();
    expect(data.calories_applied).toBe(120);

    mockUpdateExerciseEntry.mockClear();
    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.change(screen.getByLabelText(/Calories counted in daily total/), {
      target: { value: '' },
    });
    const cleared = await saveEntry();
    expect(cleared.data.calories_applied).toBeNull();
  });

  it('writes the stored values into the single cardio set too', async () => {
    renderDialog(syncedEntry());

    const { data } = await saveEntry();
    expect(data.sets[0]).toMatchObject({
      duration: Math.round(30.4567 * 60),
      distance: 5.234,
    });
  });

  it('keeps the stored distance when the form shows it in miles', async () => {
    mockDistanceUnit = 'miles';
    renderDialog(syncedEntry());

    const { data } = await saveEntry();
    expect(data.distance).toBe(5.234);
  });

  it('converts a distance the user changed in miles', async () => {
    mockDistanceUnit = 'miles';
    renderDialog(syncedEntry());

    fireEvent.change(screen.getByDisplayValue('3.3'), {
      target: { value: '4' },
    });
    const { data } = await saveEntry();
    expect(data.distance).toBeCloseTo(4 * KM_PER_MILE, 6);
  });

  it('still derives an empty duration from the sets', async () => {
    renderDialog(
      makeEntry({
        duration_minutes: null,
        distance: null,
        sets: [
          { ...cardioSet, duration: null, distance: null, rest_time: 90 },
          {
            ...cardioSet,
            id: 8,
            set_number: 2,
            duration: null,
            distance: null,
            rest_time: 90,
          },
        ],
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          modality: 'weight_reps',
        },
      } as unknown as Partial<ExerciseEntry>)
    );

    const { data } = await saveEntry();
    expect(data.duration_minutes).toBe(3);
  });
});

describe('EditExerciseEntryDialog calories after changing sets', () => {
  beforeEach(() => {
    mockUpdateExerciseEntry.mockClear();
    mockUpdateExerciseEntry.mockResolvedValue(undefined);
    mockDistanceUnit = 'km';
  });

  const strengthEntry = () =>
    makeEntry({
      duration_minutes: 2,
      calories_burned: 20,
      distance: null,
      sets: [{ ...cardioSet, duration: null, distance: null, rest_time: 120 }],
      exercise_snapshot: {
        id: 'ex-1',
        name: 'Bench Press',
        category: 'Strength',
        modality: 'weight_reps',
      },
    } as unknown as Partial<ExerciseEntry>);

  it('lets the server re-estimate when a set is added', async () => {
    renderDialog(strengthEntry());

    fireEvent.click(screen.getByText('Add Set'));
    const { data } = await saveEntry();
    expect(data.calories_burned).toBeUndefined();
    expect(data.duration_minutes).toBeGreaterThan(2);
  });

  it('sends the stored calories when the sets are untouched', async () => {
    renderDialog(strengthEntry());

    const { data } = await saveEntry();
    expect(data.calories_burned).toBe(20);
    expect(data.duration_minutes).toBe(2);
  });

  it('derives zero duration when every set is removed', async () => {
    const { container } = renderDialog(strengthEntry());

    fireEvent.click(
      container.ownerDocument
        .querySelector('svg.lucide-trash-2')!
        .closest('button')!
    );
    const { data } = await saveEntry();
    expect(data.duration_minutes).toBe(0);
    expect(data.calories_burned).toBeUndefined();
  });

  it('recalculates the total when a two-set cardio entry drops to one set', async () => {
    const { container } = renderDialog(
      makeEntry({
        sets: [
          cardioSet,
          { ...cardioSet, id: 8, set_number: 2, duration: 600, distance: 1.5 },
        ],
      })
    );

    fireEvent.click(
      container.ownerDocument
        .querySelectorAll('svg.lucide-trash-2')[1]!
        .closest('button')!
    );
    const { data } = await saveEntry();
    expect(data.calories_burned).toBeUndefined();
    expect(data.duration_minutes).toBe(30);
    expect(data.sets).toHaveLength(1);
    expect(data.sets[0]).toMatchObject({ duration: 1800 });
  });

  it('keeps an explicitly entered zero-calorie override', async () => {
    renderDialog(strengthEntry());

    fireEvent.click(screen.getByText('Add Set'));
    fireEvent.click(screen.getByText('Advanced'));
    fireEvent.change(screen.getByDisplayValue('20'), {
      target: { value: '0' },
    });
    const { data } = await saveEntry();
    expect(data.calories_burned).toBe(0);
  });

  it('sends a stored zero back when the sets are untouched', async () => {
    renderDialog(
      makeEntry({
        calories_burned: 0,
        sets: [
          { ...cardioSet, duration: null, distance: null, rest_time: 120 },
        ],
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          modality: 'weight_reps',
        },
      } as unknown as Partial<ExerciseEntry>)
    );

    const { data } = await saveEntry();
    expect(data.calories_burned).toBe(0);
  });

  it('keeps the stored duration when added strength sets carry no timing', async () => {
    renderDialog(
      makeEntry({
        duration_minutes: 45,
        calories_burned: 200,
        sets: [{ ...cardioSet, duration: null, distance: null, rest_time: 0 }],
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          modality: 'weight_reps',
        },
      } as unknown as Partial<ExerciseEntry>)
    );

    fireEvent.click(screen.getByText('Add Set'));
    const { data } = await saveEntry();
    expect(data.duration_minutes).toBe(45);
    expect(data.calories_burned).toBeUndefined();
  });
});
