import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { programStatus } from '@workspace/shared';
import RunProgramCalendar from '../../src/components/recording/RunProgramCalendar';

const status = programStatus({ programId: 'beginner5k', next: 0 })!;
// 2026-10-12 is a Monday.
const today = '2026-10-12';
const days = { days: [1, 3, 5], startDay: null, endDay: null };

test('asks for run days when none are chosen', () => {
  render(
    <RunProgramCalendar
      status={status}
      schedule={{ days: [], startDay: null, endDay: null }}
      doneDay={null}
      today={today}
    />
  );
  expect(screen.getByText(/Pick your workout days/)).toBeTruthy();
});

test('lists the next runs with their dates and the finish day, and shows them all on request', () => {
  render(
    <RunProgramCalendar
      status={status}
      schedule={days}
      doneDay={null}
      today={today}
    />
  );
  expect(screen.getAllByText(/Week \d, run \d/).length).toBe(7);
  expect(screen.getByText(/Finishes on/)).toBeTruthy();
  fireEvent.press(screen.getByText('Show all 27'));
  expect(screen.getAllByText(/Week \d, run \d/).length).toBe(27);
});

test('says whether the program fits before the goal date', () => {
  const { rerender } = render(
    <RunProgramCalendar
      status={status}
      schedule={{ ...days, endDay: '2027-03-01' }}
      doneDay={null}
      today={today}
    />
  );
  expect(
    screen.getByText(/On track: you finish on .* before your goal date/)
  ).toBeTruthy();

  rerender(
    <RunProgramCalendar
      status={status}
      schedule={{ ...days, endDay: '2026-11-01' }}
      doneDay={null}
      today={today}
    />
  );
  expect(
    screen.getByText(/after your goal date. Add a workout day/)
  ).toBeTruthy();
  expect(
    screen.getByText(/workouts do not fit before your goal date/)
  ).toBeTruthy();
});

test('shows nothing once the program is finished', () => {
  render(
    <RunProgramCalendar
      status={programStatus({ programId: 'beginner5k', next: 27 })!}
      schedule={days}
      doneDay={null}
      today={today}
    />
  );
  expect(screen.queryByTestId('run-program-calendar')).toBeNull();
});
