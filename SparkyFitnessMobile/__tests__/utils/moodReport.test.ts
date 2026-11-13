import { buildMoodReport, moodTagLabel } from '../../src/utils/moodReport';
import type { MoodEntry } from '../../src/services/api/moodApi';

const entry = (
  day: string,
  value: number | null,
  tags: string[] = [],
  source: MoodEntry['source'] = 'manual'
): MoodEntry => ({
  id: `${day}-${value}-${source}-${tags.join()}`,
  entry_date: day,
  entry_timestamp: `${day}T12:00:00Z`,
  source,
  mood_value: value,
  mood_tags: tags,
  notes: null,
});

describe('buildMoodReport', () => {
  it('pads the window to one point per day and leaves unlogged days at 0', () => {
    const report = buildMoodReport(
      [entry('2026-10-02', 60), entry('2026-10-04', 80)],
      '2026-10-01',
      5
    );

    expect(report.days.map((d) => d.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    expect(report.days.map((d) => d.value)).toEqual([0, 60, 0, 80, 0]);
    expect(report.loggedDays).toBe(2);
    expect(report.averageValue).toBe(70);
  });

  it('averages several entries on one day and counts tags by frequency', () => {
    const report = buildMoodReport(
      [
        entry('2026-10-01', 40, ['calm']),
        entry('2026-10-01', 60, ['calm', 'tired']),
        entry('2026-10-02', 50, ['tired']),
      ],
      '2026-10-01',
      2
    );

    expect(report.days[0]).toMatchObject({ value: 50, entries: 2 });
    expect(report.topTags).toEqual([
      { tag: 'calm', count: 2 },
      { tag: 'tired', count: 2 },
    ]);
  });

  it('reports no average for an empty window', () => {
    const report = buildMoodReport([], '2026-10-01', 3);
    expect(report.averageValue).toBeNull();
    expect(report.loggedDays).toBe(0);
  });
});

describe('buildMoodReport with check-ins that have no mood', () => {
  it('does not count a day with only null moods as logged', () => {
    const report = buildMoodReport(
      [
        entry('2026-10-05', 40),
        entry('2026-10-06', null, ['focused']),
        entry('2026-10-07', 80),
      ],
      '2026-10-05',
      3
    );
    expect(report.loggedDays).toBe(2);
    expect(report.averageValue).toBe(60);
    expect(report.best?.day).toBe('2026-10-07');
    expect(report.lowest?.day).toBe('2026-10-05');
    expect(report.weekdayAverages.map((w) => w.weekday)).toEqual([1, 3]);
    expect(report.days[1]).toMatchObject({ value: 0, entries: 0 });
  });

  it('ignores null moods when averaging a day and counts only moods', () => {
    const report = buildMoodReport(
      [
        entry('2026-10-05', 40),
        entry('2026-10-05', null),
        entry('2026-10-05', 80),
      ],
      '2026-10-05',
      1
    );
    expect(report.days[0]).toMatchObject({ value: 60, entries: 2 });
  });

  it('uses the Garmin mood when a day has no manual mood', () => {
    const report = buildMoodReport(
      [entry('2026-10-05', null), entry('2026-10-05', 70, [], 'garmin')],
      '2026-10-05',
      1
    );
    expect(report.days[0]).toMatchObject({ value: 70, entries: 0 });
    expect(report.loggedDays).toBe(1);
  });

  it('counts tags across manual rows only', () => {
    const report = buildMoodReport(
      [
        entry('2026-10-05', 50, ['calm']),
        entry('2026-10-05', null, ['calm']),
        entry('2026-10-05', 70, ['garmin-tag'], 'garmin'),
      ],
      '2026-10-05',
      1
    );
    expect(report.topTags).toEqual([{ tag: 'calm', count: 2 }]);
  });
});

describe('buildMoodReport highlights', () => {
  it('finds the best and lowest day and averages by weekday', () => {
    // 2026-10-05 is a Monday, 2026-10-12 the next Monday.
    const report = buildMoodReport(
      [
        entry('2026-10-05', 40),
        entry('2026-10-06', 90),
        entry('2026-10-12', 60),
      ],
      '2026-10-05',
      8
    );
    expect(report.best?.day).toBe('2026-10-06');
    expect(report.lowest?.day).toBe('2026-10-05');
    expect(report.weekdayAverages).toEqual([
      { weekday: 1, value: 50 },
      { weekday: 2, value: 90 },
    ]);
  });

  it('has no best or lowest day with a single logged day', () => {
    const report = buildMoodReport([entry('2026-10-05', 40)], '2026-10-05', 3);
    expect(report.best).toBeNull();
    expect(report.lowest).toBeNull();
  });
});

describe('moodTagLabel', () => {
  it('keeps a custom mood literal', () => {
    expect(moodTagLabel('my-own-mood')).toBe('my-own-mood');
  });
});
