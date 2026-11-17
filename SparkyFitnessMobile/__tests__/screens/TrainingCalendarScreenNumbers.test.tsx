import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import type { TrainingCalendarResponse } from '@workspace/shared';
import TrainingCalendarScreen from '../../src/screens/TrainingCalendarScreen';
import { useTrainingCalendar } from '../../src/hooks/useTrainingCalendar';
import { initializeI18n } from '../../src/localization/i18n';

// Stands in for a locale with its own digits: every number the screen shows
// must go through the app's number formatter.
jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  formatLocalizedNumber: (value: number) => `‹${value}›`,
}));
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
const data = {
  start: '2026-09-28',
  end: '2026-11-01',
  today: '2026-10-14',
  planned: [],
  completed: [],
  weeks: [
    {
      start: '2026-10-12',
      plannedSessions: 4,
      doneSessions: 1,
      partialSessions: 1,
      missedSessions: 1,
      extraSessions: 2,
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

beforeAll(async () => {
  await initializeI18n('en');
});

test('formats day numbers, week totals and session counts with the app locale', () => {
  jest.mocked(useTrainingCalendar).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
  render(<TrainingCalendarScreen {...({ navigation: {} } as never)} />);
  const day = within(screen.getByTestId('calendar-day-2026-10-14'));
  expect(day.getByText('‹14›')).toBeTruthy();
  expect(screen.getByTestId('week-total-2026-10-12')).toHaveTextContent(
    '‹2›/‹4›'
  );
  expect(screen.getByText(/‹2› of ‹4› planned sessions/)).toBeTruthy();
  expect(screen.getByText(/‹2› extra/)).toBeTruthy();
});
