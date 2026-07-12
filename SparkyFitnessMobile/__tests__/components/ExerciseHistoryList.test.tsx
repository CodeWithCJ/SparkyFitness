import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ExerciseHistoryList from '../../src/components/ExerciseHistoryList';
import { useExerciseHistory } from '../../src/hooks/useExerciseHistory';
import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  ExerciseSessionResponse,
} from '@workspace/shared';

jest.mock('../../src/hooks/useExerciseHistory', () => ({
  useExerciseHistory: jest.fn(),
}));

const mockUseExerciseHistory = useExerciseHistory as jest.MockedFunction<
  typeof useExerciseHistory
>;

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EXERCISE_ID = '22222222-2222-4222-8222-222222222222';

let nextSetId = 1;
const makeSet = (
  overrides: Partial<ExerciseEntrySetResponse> = {},
): ExerciseEntrySetResponse => ({
  id: nextSetId++,
  set_number: 1,
  set_type: null,
  reps: 5,
  weight: 100,
  duration: null,
  rest_time: null,
  notes: null,
  rpe: null,
  completed_at: null,
  is_pr: false,
  ...overrides,
});

const makeEntry = (
  exerciseId: string,
  sets: ExerciseEntrySetResponse[],
  overrides: Partial<ExerciseEntryResponse> = {},
): ExerciseEntryResponse => ({
  id: `entry-${exerciseId}-${nextSetId++}`,
  exercise_id: exerciseId,
  duration_minutes: 0,
  calories_burned: 0,
  entry_date: '2026-01-06',
  notes: null,
  distance: null,
  avg_heart_rate: null,
  source: null,
  sets,
  exercise_snapshot: null,
  activity_details: [],
  ...overrides,
});

const makeIndividualSession = (
  sets: ExerciseEntrySetResponse[],
  overrides: Partial<ExerciseEntryResponse> = {},
): ExerciseSessionResponse => ({
  ...makeEntry(EXERCISE_ID, sets, overrides),
  type: 'individual',
  name: 'Bench Press',
});

const makePresetSession = (
  exercises: ExerciseEntryResponse[],
  name = 'Push Day',
): ExerciseSessionResponse => ({
  type: 'preset',
  id: `preset-${nextSetId++}`,
  entry_date: '2026-01-06',
  workout_preset_id: null,
  name,
  description: null,
  notes: null,
  source: 'manual',
  total_duration_minutes: 60,
  exercises,
  activity_details: [],
});

const baseHookResult = {
  sessions: [] as ExerciseSessionResponse[],
  isLoading: false,
  isLoadingMore: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
  loadMore: jest.fn(),
  hasMore: false,
};

const renderList = (
  props?: Partial<React.ComponentProps<typeof ExerciseHistoryList>>,
) =>
  render(
    <ExerciseHistoryList exerciseId={EXERCISE_ID} weightUnit="kg" {...props} />,
  );

describe('ExerciseHistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nextSetId = 1;
    mockUseExerciseHistory.mockReturnValue({ ...baseHookResult });
  });

  it('renders a chip per set with warmup prefixes', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ set_type: 'warmup', weight: 60, reps: 10 }),
          makeSet({ weight: 100, reps: 5 }),
          makeSet({ weight: null, reps: 12 }),
        ]),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('Tue, Jan 6')).toBeTruthy();
    expect(screen.getByText('W 60 × 10')).toBeTruthy();
    expect(screen.getByText('100 × 5')).toBeTruthy();
    expect(screen.getByText('12 reps')).toBeTruthy();
  });

  it('shows only the matching exercise from a preset session, with the workout name', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makePresetSession([
          makeEntry(EXERCISE_ID, [makeSet({ weight: 100, reps: 5 })]),
          makeEntry(OTHER_EXERCISE_ID, [makeSet({ weight: 60, reps: 8 })]),
        ]),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('100 × 5')).toBeTruthy();
    expect(screen.queryByText('60 × 8')).toBeNull();
  });

  it('marks chips that beat, tie, or miss the record distinctly', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ weight: 105, reps: 5, is_pr: true }),
          makeSet({ weight: 100, reps: 5 }),
          makeSet({ weight: 90, reps: 5 }),
          makeSet({ set_type: 'warmup', weight: 100, reps: 5 }),
        ]),
      ],
    });

    const screen = renderList({
      bestSet: { entryDate: '2026-01-06', weight: 100, reps: 5, setNumber: 1 },
    });

    // is_pr wins even though 105 × 5 doesn't tie the (stale) bestSet.
    expect(screen.getAllByTestId('pr-chip')).toHaveLength(1);
    // Only the exact non-warmup tie gets the match outline.
    expect(screen.getAllByTestId('pr-match-chip')).toHaveLength(1);
  });

  it('renders plain chips when no best set is provided', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [makeIndividualSession([makeSet({ weight: 100, reps: 5 })])],
    });

    const screen = renderList();

    expect(screen.queryByTestId('pr-match-chip')).toBeNull();
  });

  it('falls back to a duration/calories summary for set-less entries', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([], { duration_minutes: 30, calories_burned: 200 }),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('30 min · 200 cal')).toBeTruthy();
  });

  it('shows an empty state when there are no sessions', () => {
    const screen = renderList();
    expect(screen.getByText('No sessions logged yet.')).toBeTruthy();
  });

  it('shows a spinner while loading', () => {
    mockUseExerciseHistory.mockReturnValue({ ...baseHookResult, isLoading: true });
    const screen = renderList();
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('shows an error state with a working Retry action', () => {
    const refetch = jest.fn();
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      isError: true,
      error: new Error('boom'),
      refetch,
    });

    const screen = renderList();

    expect(screen.getByText("Couldn't load history.")).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers Load more while more pages remain', () => {
    const loadMore = jest.fn();
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [makeIndividualSession([makeSet()])],
      hasMore: true,
      loadMore,
    });

    const screen = renderList();

    fireEvent.press(screen.getByText('Load more'));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('disables Load more while the next page is loading', () => {
    const loadMore = jest.fn();
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [makeIndividualSession([makeSet()])],
      hasMore: true,
      isLoadingMore: true,
      loadMore,
    });

    const screen = renderList();

    fireEvent.press(screen.getByText('Loading…'));
    expect(loadMore).not.toHaveBeenCalled();
  });
});
