import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { TrainingCalendarResponse } from '@workspace/shared';
import TrainingCalendarScreen from '../../src/screens/TrainingCalendarScreen';
import { useTrainingCalendar } from '../../src/hooks/useTrainingCalendar';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/useTrainingCalendar', () => ({
  useTrainingCalendar: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { first_day_of_week: 1 } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-10-14',
}));

const none = {
  running: 0,
  cycling: 0,
  walking: 0,
  cardio: 0,
  strength: 0,
  other: 0,
};
const planned = (
  id: string,
  day: string,
  status: 'done' | 'partial' | 'missed' | 'upcoming'
) => ({
  id,
  day,
  source: 'workoutPlan' as const,
  sport: 'strength' as const,
  label: id,
  programId: null,
  workoutNumber: null,
  plannedMinutes: 40,
  plannedLoad: 80,
  status,
  completedMinutes: status === 'done' ? 40 : status === 'partial' ? 20 : 0,
  completedLoad: 0,
  matchedMinutes: 0,
  matchedLoad: 0,
  entryIds: [],
});
const data = {
  start: '2026-09-28',
  end: '2026-11-01',
  today: '2026-10-14',
  planned: [
    planned('Push', '2026-10-12', 'done'),
    planned('Legs', '2026-10-13', 'missed'),
    planned('Pull', '2026-10-14', 'partial'),
    planned('Core', '2026-10-16', 'upcoming'),
  ],
  completed: [
    {
      id: 'e1',
      day: '2026-10-14',
      name: 'Evening run',
      sport: 'running' as const,
      minutes: 30,
      distanceKm: 5,
      avgHeartRate: null,
      load: 60,
      loadBasis: 'estimated' as const,
      plannedItemId: null,
    },
  ],
  weeks: [
    {
      start: '2026-10-12',
      plannedSessions: 4,
      doneSessions: 1,
      partialSessions: 1,
      missedSessions: 1,
      extraSessions: 1,
      completedSessions: 3,
      plannedMinutes: 160,
      completedMinutes: 90,
      plannedLoad: 320,
      completedLoad: 140,
      matchedMinutes: 90,
      matchedLoad: 80,
      completedDistanceKm: 5,
    },
  ],
  sportLoad: { weeks: [], months: [], total: none },
  fitnessFatigue: { today: null, status: 'noData' as const },
} as TrainingCalendarResponse;

const state = (overrides: Record<string, unknown> = {}) =>
  jest.mocked(useTrainingCalendar).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as never);
const navigate = jest.fn();
const renderScreen = () =>
  render(
    <TrainingCalendarScreen {...({ navigation: { navigate } } as never)} />
  );

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => jest.clearAllMocks());

test('asks for the month grid from the first day of the week', () => {
  state();
  renderScreen();
  expect(useTrainingCalendar).toHaveBeenCalledWith('2026-09-28', '2026-11-01');
});

test('draws a sport icon per planned item, coloured by status, and extras', () => {
  state();
  renderScreen();
  expect(screen.getAllByTestId('day-mark-done')).toHaveLength(1);
  expect(screen.getAllByTestId('day-mark-missed')).toHaveLength(1);
  expect(screen.getAllByTestId('day-mark-partial')).toHaveLength(1);
  expect(screen.getAllByTestId('day-mark-upcoming')).toHaveLength(1);
  expect(screen.getAllByTestId('day-mark-extra')).toHaveLength(1);
});

test('every icon says its sport and status to a screen reader', () => {
  state();
  renderScreen();
  expect(screen.getByLabelText('Strength, Done')).toBeTruthy();
  expect(screen.getByLabelText('Strength, Missed')).toBeTruthy();
  expect(screen.getByLabelText('Strength, Partly done')).toBeTruthy();
  expect(screen.getByLabelText('Strength, Upcoming')).toBeTruthy();
  expect(screen.getByLabelText('Running, extra, not planned')).toBeTruthy();
  expect(
    screen.getByLabelText(/^Today: Strength, Partly done; Running, extra/)
  ).toBeTruthy();
});

test('caps the icons on a day and counts the rest', () => {
  const crowded = Array.from({ length: 5 }, (_, i) =>
    planned(`P${i}`, '2026-10-20', 'upcoming')
  );
  state({ data: { ...data, planned: [...data.planned, ...crowded] } });
  renderScreen();
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-20'));
  expect(screen.getByText('+2')).toBeTruthy();
  expect(screen.getByLabelText('2 more sessions')).toBeTruthy();
});

test('today has a ring and the selected day a box, both on the same day', () => {
  state();
  renderScreen();
  expect(screen.getByTestId('calendar-today-ring')).toBeTruthy();
  expect(
    screen.getByTestId('calendar-day-2026-10-14').props.accessibilityState
  ).toMatchObject({ selected: true });
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-13'));
  expect(screen.getByTestId('calendar-today-ring')).toBeTruthy();
  expect(
    screen.getByTestId('calendar-day-2026-10-14').props.accessibilityState
  ).toMatchObject({ selected: false });
});

test('shows the legend with only the sports on the grid', () => {
  state();
  renderScreen();
  expect(screen.getByTestId('calendar-legend')).toBeTruthy();
  const sports = within(screen.getByTestId('calendar-sport-legend'));
  expect(sports.getByText('Running')).toBeTruthy();
  expect(sports.getByText('Strength')).toBeTruthy();
  expect(sports.queryByText('Cardio')).toBeNull();
  expect(screen.getAllByText('Extra').length).toBeGreaterThan(0);
});

test('labels the grid totals column and marks today with its weekday', () => {
  state();
  renderScreen();
  expect(screen.getByText('Total')).toBeTruthy();
  expect(screen.getByText('Wednesday')).toBeTruthy();
});

test('opens today first and a tapped day with its planned and completed work', () => {
  state();
  renderScreen();
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Pull')).toBeTruthy();
  expect(screen.getByText('Evening run')).toBeTruthy();
  expect(screen.getAllByText('Extra').length).toBeGreaterThan(1);
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-13'));
  expect(screen.getByText('Legs')).toBeTruthy();
  expect(screen.getByText(/^Missed · Strength/)).toBeTruthy();
  expect(screen.queryByText('Evening run')).toBeNull();
});

test('totals the week planned against completed', () => {
  state();
  renderScreen();
  expect(screen.getByText(/2 of 4 planned sessions/)).toBeTruthy();
  expect(screen.getByText(/1 extra/)).toBeTruthy();
  // Only the minutes and load that counted for a planned item are compared with
  // the plan; the rest shows as extra.
  expect(screen.getByText(/Time 90 of 160 min/)).toBeTruthy();
  expect(
    screen.getByText(/Training load 80 of 320 \(\+60 extra\)/)
  ).toBeTruthy();
});

const unplannedWeek = {
  start: '2026-10-05',
  plannedSessions: 0,
  doneSessions: 0,
  partialSessions: 0,
  missedSessions: 0,
  extraSessions: 2,
  completedSessions: 2,
  plannedMinutes: 0,
  completedMinutes: 233,
  plannedLoad: 0,
  completedLoad: 432,
  matchedMinutes: 0,
  matchedLoad: 0,
  completedDistanceKm: 0,
};

test('shows only what was done when nothing was planned', () => {
  state({ data: { ...data, weeks: [unplannedWeek, ...data.weeks] } });
  renderScreen();
  expect(screen.getByText(/Time 233 min/)).toBeTruthy();
  expect(screen.getByText(/Training load 432$/)).toBeTruthy();
  expect(screen.getByText('2 sessions logged')).toBeTruthy();
  expect(screen.queryByText(/of 0/)).toBeNull();
  expect(screen.queryByTestId('week-progress-2026-10-05')).toBeNull();
});

test('explains training load on a tap with the Exercise Statistics wording', () => {
  state();
  renderScreen();
  expect(screen.queryByTestId('load-help')).toBeNull();
  fireEvent.press(screen.getByTestId('load-help-2026-10-12'));
  expect(
    screen.getByText(/Workout minutes weighted by heart rate, this week/)
  ).toBeTruthy();
  fireEvent.press(screen.getByTestId('load-help-2026-10-12'));
  expect(screen.queryByTestId('load-help')).toBeNull();
});

test('draws a progress bar per planned week with done, partial and missed', () => {
  state();
  renderScreen();
  expect(screen.getByTestId('week-progress-done')).toBeTruthy();
  expect(screen.getByTestId('week-progress-partial')).toBeTruthy();
  expect(screen.getByTestId('week-progress-missed')).toBeTruthy();
  expect(screen.getByTestId('week-progress-rest')).toBeTruthy();
  expect(
    screen.getByLabelText('1 done, 1 partly done, 1 missed, of 4 planned')
  ).toBeTruthy();
});

test('puts each week total at the end of its row in the grid', () => {
  state({ data: { ...data, weeks: [unplannedWeek, ...data.weeks] } });
  renderScreen();
  expect(screen.getByTestId('week-total-2026-10-12')).toHaveTextContent('2/4');
  expect(screen.getByTestId('week-total-2026-10-05')).toHaveTextContent('2');
  expect(screen.getByLabelText('2 of 4 planned sessions done')).toBeTruthy();
  fireEvent.press(screen.getByTestId('week-total-2026-10-05'));
  expect(screen.getByTestId('week-row-2026-10-05').props.className).toContain(
    'border-accent-primary'
  );
});

const weekAt = (start: string) => ({
  ...unplannedWeek,
  start,
});

test('lists the current week first and collapses older weeks', () => {
  const weeks = [
    '2026-09-07',
    '2026-09-14',
    '2026-09-21',
    '2026-09-28',
    '2026-10-05',
  ].map(weekAt);
  state({ data: { ...data, weeks: [...weeks, ...data.weeks] } });
  renderScreen();
  const order = () =>
    screen
      .getAllByTestId(/^week-row-/)
      .map((node) => node.props.testID.replace('week-row-', ''));
  expect(order()).toEqual(['2026-10-12', '2026-10-05', '2026-09-28']);
  fireEvent.press(screen.getByText('Show earlier weeks (3)'));
  expect(order()).toEqual([
    '2026-10-12',
    '2026-10-05',
    '2026-09-28',
    '2026-09-21',
    '2026-09-14',
    '2026-09-07',
  ]);
  fireEvent.press(screen.getByText('Hide earlier weeks'));
  expect(order()).toHaveLength(3);
});

test('says rest day for an empty day and keeps the plain text far ahead', () => {
  state();
  renderScreen();
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-15'));
  expect(screen.getByText('Rest day')).toBeTruthy();
  fireEvent.press(screen.getByTestId('calendar-day-2026-10-31'));
  expect(screen.getByText('Nothing planned or logged this day.')).toBeTruthy();
});

test('shows a retry when the calendar cannot be loaded', () => {
  const refetch = jest.fn();
  state({ data: undefined, isError: true, refetch });
  renderScreen();
  fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalled();
});

test('week view lists the seven days of the chosen week', () => {
  state();
  renderScreen();
  fireEvent.press(screen.getByText('Week'));
  expect(screen.getAllByText('Week of Oct 12').length).toBeGreaterThan(1);
});

test('opens the program workout from a planned run program item', () => {
  const program = {
    ...planned('program-1', '2026-10-14', 'upcoming'),
    source: 'runProgram' as const,
    sport: 'running' as const,
    programId: 'beginner5k',
    workoutNumber: 4,
    label: null,
  };
  state({ data: { ...data, planned: [...data.planned, program] } });
  renderScreen();
  fireEvent.press(screen.getByTestId('planned-program-1'));
  expect(navigate).toHaveBeenCalledWith('RunProgramWorkout', { index: 3 });
});

test('a workout plan item opens nothing', () => {
  state();
  renderScreen();
  fireEvent.press(screen.getByTestId('planned-Pull'));
  expect(navigate).not.toHaveBeenCalled();
});

test('shows time and load against the plan with the extra work apart', () => {
  state();
  renderScreen();
  expect(
    screen.getByText(/Training load 80 of 320 \(\+60 extra\)/)
  ).toBeTruthy();
});

test('tags this week and the weeks ahead, with a percentage only for weeks under way', () => {
  const ahead = {
    ...data.weeks[0]!,
    start: '2026-10-19',
    doneSessions: 0,
    partialSessions: 0,
    missedSessions: 0,
    extraSessions: 0,
    completedSessions: 0,
  };
  state({ data: { ...data, weeks: [...data.weeks, ahead] } });
  renderScreen();
  expect(screen.getByTestId('week-tag-2026-10-12')).toHaveTextContent(
    'This week'
  );
  expect(screen.getByTestId('week-percent-2026-10-12')).toHaveTextContent(
    '50%'
  );
  expect(screen.getByTestId('week-tag-2026-10-19')).toHaveTextContent(
    'Upcoming'
  );
  expect(screen.queryByTestId('week-percent-2026-10-19')).toBeNull();
  expect(screen.getByTestId('week-row-2026-10-19').props.style).toEqual({
    opacity: 0.6,
  });
});

test("follows the response's day for the ring, selection and week tags", () => {
  // The device says the 14th; the person\'s own day is already the 21st.
  state({ data: { ...data, today: '2026-10-21' } });
  renderScreen();
  expect(
    within(screen.getByTestId('calendar-day-2026-10-21')).getByTestId(
      'calendar-today-ring'
    )
  ).toBeTruthy();
  expect(
    screen.getByTestId('calendar-day-2026-10-21').props.accessibilityState
  ).toMatchObject({ selected: true });
  expect(
    screen.getByTestId('calendar-day-2026-10-14').props.accessibilityState
  ).toMatchObject({ selected: false });
  expect(screen.getByText('Wednesday')).toBeTruthy();
  // The week of the 12th is behind the person\'s today, so it is not the
  // current week.
  expect(screen.queryByTestId('week-tag-2026-10-12')).toBeNull();
});

test("opens the selected day's week when switching to the week view", () => {
  state();
  renderScreen();
  fireEvent.press(screen.getByTestId('calendar-day-2026-09-30'));
  fireEvent.press(screen.getByText('Week'));
  // The grid is asked for the month that holds the selected day.
  expect(useTrainingCalendar).toHaveBeenLastCalledWith(
    '2026-08-31',
    '2026-10-04'
  );
  expect(screen.getByText(/^Week of /)).toBeTruthy();
  expect(
    screen.getByTestId('calendar-day-2026-09-30').props.accessibilityState
  ).toMatchObject({ selected: true });
});
