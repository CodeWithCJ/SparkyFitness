import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TrainingCalendarResponse } from '@workspace/shared';
import SportLoadCard from '../../src/components/exerciseStats/SportLoadCard';
import { initializeI18n } from '../../src/localization/i18n';

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
  start: '2026-08-13',
  end: '2026-10-14',
  today: '2026-10-14',
  planned: [],
  completed: [],
  weeks: [],
  sportLoad: {
    weeks: [
      { start: '2026-10-05', bySport: { ...none, running: 100 } },
      {
        start: '2026-10-12',
        bySport: { ...none, running: 60, strength: 180 },
      },
    ],
    months: [
      {
        month: '2026-10',
        bySport: { ...none, running: 160, strength: 180 },
      },
    ],
    total: { ...none, running: 160, strength: 180 },
  },
  fitnessFatigue: {
    today: { day: '2026-10-14', load: 0, fitness: 42, fatigue: 51, form: -9 },
    status: 'tired',
  },
} as TrainingCalendarResponse;

beforeAll(async () => {
  await initializeI18n('en');
});
const onOpenCalendar = jest.fn();
beforeEach(() => jest.clearAllMocks());

test('splits the week and the month by sport and draws a bar per week', () => {
  render(
    <SportLoadCard
      data={data}
      isLoading={false}
      isError={false}
      onOpenCalendar={onOpenCalendar}
    />
  );
  expect(screen.getByText('This week')).toBeTruthy();
  expect(screen.getByText('This month')).toBeTruthy();
  // Week: strength 180 of 240 is 75%, running 25%.
  expect(screen.getByText('180 · 75%')).toBeTruthy();
  expect(screen.getByText('60 · 25%')).toBeTruthy();
  expect(screen.getAllByTestId('sport-load-bar')).toHaveLength(2);
});

test('shows the fitness, fatigue and form for context and how load is estimated', () => {
  render(
    <SportLoadCard
      data={data}
      isLoading={false}
      isError={false}
      onOpenCalendar={onOpenCalendar}
    />
  );
  expect(screen.getByText('42')).toBeTruthy();
  expect(screen.getByText('51')).toBeTruthy();
  expect(screen.getByText('-9')).toBeTruthy();
  expect(screen.getByText(/counts at a moderate weight of 2/)).toBeTruthy();
});

test('opens the training calendar', () => {
  render(
    <SportLoadCard
      data={data}
      isLoading={false}
      isError={false}
      onOpenCalendar={onOpenCalendar}
    />
  );
  fireEvent.press(screen.getByText('Open training calendar'));
  expect(onOpenCalendar).toHaveBeenCalled();
});

test('says so when the load cannot be fetched', () => {
  render(
    <SportLoadCard
      data={undefined}
      isLoading={false}
      isError
      onOpenCalendar={onOpenCalendar}
    />
  );
  expect(screen.getByText('Could not load your load by sport.')).toBeTruthy();
});

test("takes the current week and month from the response's own day", () => {
  // The device is on 2026-10-14; the person\'s day is still 30 September.
  const september = {
    ...data,
    today: '2026-09-30',
    sportLoad: {
      weeks: [{ start: '2026-09-28', bySport: { ...none, cycling: 90 } }],
      months: [{ month: '2026-09', bySport: { ...none, cycling: 90 } }],
      total: { ...none, cycling: 90 },
    },
  } as TrainingCalendarResponse;
  render(
    <SportLoadCard
      data={september}
      isLoading={false}
      isError={false}
      onOpenCalendar={onOpenCalendar}
    />
  );
  expect(screen.queryByText('No workouts logged yet.')).toBeNull();
  expect(screen.getAllByText('90 · 100%')).toHaveLength(2);
});
