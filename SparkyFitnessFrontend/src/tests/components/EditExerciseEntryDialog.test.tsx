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

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'SILENT',
    weightUnit: 'kg',
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
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
