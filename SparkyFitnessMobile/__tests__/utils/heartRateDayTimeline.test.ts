import {
  heartRateReadingsForDay,
  workoutBandsFromSessions,
} from '../../src/utils/heartRateDayTimeline';

const at = (day: string, hour: number, minute: number) =>
  new Date(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    hour,
    minute
  ).toISOString();

describe('heartRateReadingsForDay', () => {
  it('picks readings by the device day, whatever day the row is filed on', () => {
    const rows = [
      {
        entry_date: '2026-10-04',
        samples: [
          { t: at('2026-10-04', 23, 0), bpm: 60 },
          { t: at('2026-10-05', 0, 30), bpm: 55 },
        ],
      },
      {
        entry_date: '2026-10-05',
        samples: [
          { t: at('2026-10-05', 12, 0), bpm: 90 },
          { t: at('2026-10-06', 0, 10), bpm: 58 },
        ],
      },
    ] as never;
    expect(heartRateReadingsForDay(rows, '2026-10-05')).toEqual([
      { minutes: 30, bpm: 55 },
      { minutes: 720, bpm: 90 },
    ]);
  });
});

describe('workoutBandsFromSessions', () => {
  it('starts a preset at its earliest exercise time', () => {
    const sessions = [
      {
        type: 'preset',
        id: 'p',
        name: 'Push',
        total_duration_minutes: 30,
        exercises: [
          { entry_time: null },
          { entry_time: '18:20' },
          { entry_time: '18:05' },
        ],
      },
    ] as never;
    expect(workoutBandsFromSessions(sessions, 'Workout')).toEqual([
      { id: 'p', name: 'Push', startMinutes: 1085, endMinutes: 1115 },
    ]);
  });
});
