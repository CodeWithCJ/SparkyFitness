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
  overrides: Partial<ExerciseEntrySetResponse> = {}
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
  overrides: Partial<ExerciseEntryResponse> = {}
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
  overrides: Partial<ExerciseEntryResponse> = {}
): ExerciseSessionResponse => ({
  ...makeEntry(EXERCISE_ID, sets, overrides),
  type: 'individual',
  name: 'Bench Press',
});

const makePresetSession = (
  exercises: ExerciseEntryResponse[],
  name = 'Push Day'
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
  props?: Partial<React.ComponentProps<typeof ExerciseHistoryList>>
) =>
  render(
    <ExerciseHistoryList exerciseId={EXERCISE_ID} weightUnit="kg" {...props} />
  );

describe('ExerciseHistoryList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nextSetId = 1;
    mockUseExerciseHistory.mockReturnValue({ ...baseHookResult });
  });

  it('renders a row per set, with warm-ups lettered and working sets numbered', () => {
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
    expect(screen.getByText('60 × 10')).toBeTruthy();
    expect(screen.getByText('100 × 5')).toBeTruthy();
    expect(screen.getByText('12 reps')).toBeTruthy();
    // The warm-up is a W, so the working sets count 1 and 2.
    expect(screen.getByText('W')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('shows each set RPE as a pill and leaves it empty without one', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ weight: 100, reps: 5, rpe: 8 }),
          makeSet({ weight: 100, reps: 5, rpe: 9.5 }),
          makeSet({ weight: 100, reps: 5 }),
        ]),
      ],
    });

    const screen = renderList();

    expect(screen.getAllByTestId('history-rpe')).toHaveLength(2);
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('9.5')).toBeTruthy();
  });

  it('letters drop and failure sets and keeps counting the working sets', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ weight: 100, reps: 5 }),
          makeSet({ set_type: 'drop', weight: 80, reps: 8 }),
          makeSet({ set_type: 'failure', weight: 100, reps: 3 }),
          makeSet({ weight: 100, reps: 4 }),
        ]),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('D')).toBeTruthy();
    expect(screen.getByText('F')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('headlines a workout by its name, with the date and start time beneath', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makePresetSession([
          makeEntry(EXERCISE_ID, [
            makeSet({
              weight: 100,
              reps: 5,
              completed_at: '2026-01-06T16:08:00',
            }),
          ]),
        ]),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText(/Tue, Jan 6 · 4:08/)).toBeTruthy();
  });

  it('opens the workout from the session header when it can', () => {
    const session = makePresetSession([
      makeEntry(EXERCISE_ID, [makeSet({ weight: 100, reps: 5 })]),
    ]);
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [session],
    });
    const onOpenSession = jest.fn();

    const screen = renderList({ onOpenSession });
    fireEvent.press(screen.getByTestId('history-session-header'));

    expect(onOpenSession).toHaveBeenCalledWith(session);
  });

  it('shows no header button without an open handler', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [makeIndividualSession([makeSet({ weight: 100, reps: 5 })])],
    });

    expect(renderList().queryByTestId('history-session-header')).toBeNull();
  });

  it('heads the value column for what the sets record', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ weight: null, reps: null, duration: 45 }),
        ]),
      ],
    });

    expect(renderList({ modality: 'duration' }).getByText('Time')).toBeTruthy();
  });

  it('shows duration-modality sets as seconds, with the legacy reps fallback', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([
          makeSet({ weight: null, reps: null, duration: 45 }),
          makeSet({ weight: null, reps: null, duration: 90 }),
          // Pre-modality isometric row: seconds stored in reps.
          makeSet({ weight: null, reps: 30, duration: null }),
        ]),
      ],
    });

    const screen = renderList({ modality: 'duration' });

    expect(screen.getByText('45s')).toBeTruthy();
    expect(screen.getByText('1:30')).toBeTruthy();
    expect(screen.getByText('30s')).toBeTruthy();
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

  it('marks sets that beat or tie the record distinctly', () => {
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
    expect(screen.getAllByTestId('pr-row')).toHaveLength(1);
    // Only the exact non-warmup tie gets the match outline.
    expect(screen.getAllByTestId('pr-match-row')).toHaveLength(1);
  });

  it('renders plain rows when no best set is provided', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [makeIndividualSession([makeSet({ weight: 100, reps: 5 })])],
    });

    const screen = renderList();

    expect(screen.queryByTestId('pr-match-row')).toBeNull();
  });

  it('falls back to a duration/calories summary for set-less entries', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      sessions: [
        makeIndividualSession([], {
          duration_minutes: 30,
          calories_burned: 200,
        }),
      ],
    });

    const screen = renderList();

    expect(screen.getByText('30 min · 200 kcal')).toBeTruthy();
  });

  it('shows an empty state when there are no sessions', () => {
    const screen = renderList();
    expect(screen.getByText('No sessions logged yet.')).toBeTruthy();
  });

  it('shows a spinner while loading', () => {
    mockUseExerciseHistory.mockReturnValue({
      ...baseHookResult,
      isLoading: true,
    });
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

    fireEvent.press(screen.getByText('Loading...'));
    expect(loadMore).not.toHaveBeenCalled();
  });

  describe('effort card', () => {
    it('shows nothing until a set has an RPE', () => {
      mockUseExerciseHistory.mockReturnValue({
        ...baseHookResult,
        sessions: [makeIndividualSession([makeSet({ rpe: null })])],
      });
      expect(renderList().queryByTestId('exercise-effort-card')).toBeNull();
    });

    it('shows the last session average, the trend and the 1RM with effort', () => {
      mockUseExerciseHistory.mockReturnValue({
        ...baseHookResult,
        sessions: [
          makeIndividualSession([makeSet({ rpe: 9, reps: 5, weight: 100 })], {
            entry_date: '2026-01-06',
          }),
          makeIndividualSession([makeSet({ rpe: 7, reps: 5, weight: 100 })], {
            entry_date: '2026-01-02',
          }),
        ],
      });
      const screen = renderList();

      expect(screen.getByTestId('exercise-effort-card')).toBeTruthy();
      expect(screen.getByText('Avg RPE, last session')).toBeTruthy();
      expect(screen.getByTestId('exercise-effort-bars')).toBeTruthy();
      // The RPE 7 session is judged as 8 reps (3 left); reps alone gives 5.
      expect(screen.getByText('Est. 1RM with effort')).toBeTruthy();
      expect(screen.getByText('126.7 kg')).toBeTruthy();
      expect(screen.getByText('116.7 kg')).toBeTruthy();
    });

    it('leaves the 1RM out for a bodyweight exercise', () => {
      mockUseExerciseHistory.mockReturnValue({
        ...baseHookResult,
        sessions: [makeIndividualSession([makeSet({ rpe: 8 })])],
      });
      const screen = renderList({ modality: 'bodyweight_reps' });
      expect(screen.getByTestId('exercise-effort-card')).toBeTruthy();
      expect(screen.queryByText('Est. 1RM with effort')).toBeNull();
    });
  });
});
