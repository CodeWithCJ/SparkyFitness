import type { TrainingConsistency } from '@workspace/shared';
import {
  monthColumnLabels,
  muscleWeekRows,
  trainingCalendarWeeks,
  weekdayRowLabels,
} from '../../src/utils/trainingConsistency';

describe('trainingCalendarWeeks', () => {
  it('lays each week out Monday to Sunday and marks days after today as future', () => {
    const weeks = trainingCalendarWeeks({
      today: '2026-10-02',
      weeks: [
        { weekStart: '2026-09-21', workoutDays: 1 },
        { weekStart: '2026-09-28', workoutDays: 1 },
      ],
      trainingDays: ['2026-09-23', '2026-10-01'],
    });

    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.cells.map((c) => c.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(weeks[0]!.cells.map((c) => c.state)).toEqual([
      'rest',
      'rest',
      'trained',
      'rest',
      'rest',
      'rest',
      'rest',
    ]);
    // Friday 10-02 is today; Saturday and Sunday have not happened.
    expect(weeks[1]!.cells.map((c) => c.state)).toEqual([
      'rest',
      'rest',
      'rest',
      'trained',
      'rest',
      'future',
      'future',
    ]);
  });
});

describe('muscleWeekRows', () => {
  const muscleSets: TrainingConsistency['muscleSets'] = {
    thisWeek: { Chest: 8, Triceps: 4 },
    lastWeek: { Chest: 10, Back: 6 },
  };

  it('lists every muscle trained in either week, most sets this week first', () => {
    expect(muscleWeekRows(muscleSets)).toEqual([
      { muscle: 'Chest', thisWeek: 8, lastWeek: 10 },
      { muscle: 'Triceps', thisWeek: 4, lastWeek: 0 },
      { muscle: 'Back', thisWeek: 0, lastWeek: 6 },
    ]);
  });

  it('is empty when neither week has sets', () => {
    expect(muscleWeekRows({ thisWeek: {}, lastWeek: {} })).toEqual([]);
  });
});

describe('weekdayRowLabels', () => {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  it('starts the rows on the first day of the week', () => {
    expect(weekdayRowLabels(1, names)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(weekdayRowLabels(0, names)[0]).toBe('Sun');
    expect(weekdayRowLabels(6, names)[1]).toBe('Sun');
  });
});

describe('monthColumnLabels', () => {
  it('labels the first column and each new month only', () => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    expect(
      monthColumnLabels(
        ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'],
        months
      )
    ).toEqual(['Sep', '', '', 'Oct']);
  });
});
