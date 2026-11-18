import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_PRESETS,
  addDays,
  challengeCountedEntries,
  challengeDailyCalories,
  challengeDayEffort,
  challengeEntryRate,
  challengeGoalType,
  challengePeriodTotal,
  challengePrsForDay,
  challengePeriodWindow,
  challengePeriodsUpTo,
  challengePreset,
  challengePresetEndDate,
  challengeRulesEffectiveFrom,
  challengeRulesSchema,
  challengeStepPoints,
  challengeEntryClass,
  challengeFilterSport,
  challengeWeekGoal,
  defaultPointsRules,
  heartRateZoneFor,
  isDayString,
  isManualEntry,
  isStrengthEntry,
  isoWeekday,
  mergeChallengeDuplicates,
  parseChallengeRules,
  percentMaxFloors,
  rankChallengeStandings,
  resolveHeartRateZones,
  scoreChallengeDays,
  weekStartOf,
  type ChallengeEntry,
  type ChallengeMemberZones,
  type ChallengeRules,
  type ChallengeRulesInput,
} from '@workspace/shared';

// A member with a 190 bpm max and the default percent-of-max zones:
// zone floors 95, 114, 133, 152, 171 (50, 60, 70, 80, 90 %).
const zones: ChallengeMemberZones = {
  maxHr: 190,
  floors: percentMaxFloors(190),
};
const pts = defaultPointsRules();
const allRounder: ChallengeRules = challengePreset('all_rounder').rules;

const e = (
  id: string,
  date: string,
  durationMin: number,
  avgHr: number | null = null
): ChallengeEntry => ({ id, date, durationMin, avgHr });

const score = (
  entries: ChallengeEntry[],
  from: string,
  to: string,
  steps: Record<string, number> = {},
  rules: ChallengeRules = allRounder
) => scoreChallengeDays({ entries, steps, zones }, from, to, rules);

const rulesWith = (input: Partial<ChallengeRulesInput>): ChallengeRules =>
  challengeRulesSchema.parse({ version: 1, metric: 'steps', ...input });

describe('challenge scoring (All-Rounder points)', () => {
  it("uses the member's own zones: percent of max gives floors 95-171 for 190", () => {
    const resolved = resolveHeartRateZones({
      settings: { maxHeartRate: 190 },
      today: '2026-11-12',
    });
    expect(resolved.maxHr).toBe(190);
    expect(resolved.floors).toEqual([95, 114, 133, 152, 171]);
  });

  it('average HR: below zone 1 pays 0.5/min, zones 1-2 pay 1/min, zones 3-5 pay 2/min', () => {
    const rate = (hr: number, min = 30) =>
      challengeEntryRate(e('a', '2026-11-02', min, hr), zones, pts);
    expect(rate(94).perMin).toBe(0.5);
    expect(rate(95).perMin).toBe(1);
    expect(rate(132).perMin).toBe(1);
    expect(rate(133).perMin).toBe(2);
    expect(rate(150).points).toBe(60);
    expect(rate(80, 40).points).toBe(20);
  });

  it('a zone breakdown wins over the average HR, and uncovered time pays the below-zone rate', () => {
    const entry: ChallengeEntry = {
      ...e('z', '2026-11-02', 40, 80),
      zoneSeconds: [600, 0, 1200, 0, 0], // 10 min zone 1, 20 min zone 3
    };
    const rate = challengeEntryRate(entry, zones, pts);
    expect(rate.basis).toBe('zones');
    // 10 x 1 + 20 x 2 + 10 uncovered x 0.5
    expect(rate.points).toBe(55);
  });

  it('no-HR workouts pay 0.75/min', () => {
    const day = challengeDayEffort([e('a', '2026-11-02', 40)], zones, pts);
    expect(day.effort).toBe(30);
  });

  it('daily minutes: first 60 full, next 30 half, rest nothing, best-paying first', () => {
    // 120 min at 2/min: 60*2 + 30*2*0.5 = 150; 30 min unpaid
    let day = challengeDayEffort([e('a', 'x', 120, 150)], zones, pts);
    expect(day.effort).toBe(150);
    expect(day.rawEffort).toBe(240);
    expect(day.unpaidMinutes).toBe(30);
    // 60 min manual (0.75) + 60 min hard (2): hard counted first -> 120 + 30*0.75*0.5
    day = challengeDayEffort(
      [e('m', 'x', 60), e('h', 'x', 60, 150)],
      zones,
      pts
    );
    expect(day.effort).toBe(131.25);
    expect(day.detail.find((x) => x.id === 'h')!.fullMinutes).toBe(60);
    expect(day.detail.find((x) => x.id === 'm')!.halfMinutes).toBe(30);
  });

  it('lifting floor: strength earns at least 1.5/min', () => {
    const lift: ChallengeEntry = {
      id: 'l',
      date: '2026-11-02',
      durationMin: 60,
      avgHr: 110,
      name: 'Bench press',
      category: 'Strength',
    };
    expect(challengeEntryRate(lift, zones, pts).perMin).toBe(1.5); // zone 1, floored
    expect(challengeEntryRate({ ...lift, avgHr: 150 }, zones, pts).perMin).toBe(
      2
    );
    expect(
      challengeEntryRate({ ...lift, avgHr: null }, zones, pts).perMin
    ).toBe(1.5);
    expect(
      isStrengthEntry({ id: 'x', date: 'x', durationMin: 1, name: 'Push day' })
    ).toBe(true);
    expect(
      isStrengthEntry({
        id: 'x',
        date: 'x',
        durationMin: 1,
        name: 'Leg day',
        bestE1rm: 100,
      })
    ).toBe(true);
    // The category decides first: Strength is lifting whatever the name says
    expect(
      isStrengthEntry({
        id: 'x',
        date: 'x',
        durationMin: 1,
        name: 'Treadmill run',
        category: 'Strength',
      })
    ).toBe(true);
    expect(
      isStrengthEntry({
        id: 'x',
        date: 'x',
        durationMin: 1,
        name: 'Treadmill run',
      })
    ).toBe(false);
    expect(
      isStrengthEntry({
        id: 'x',
        date: 'x',
        durationMin: 1,
        name: 'Yoga',
        category: 'Cardio',
      })
    ).toBe(false);
  });

  it('steps: 1 per 1000, rounded down, at most 10', () => {
    expect(challengeStepPoints(999, pts)).toBe(0);
    expect(challengeStepPoints(1000, pts)).toBe(1);
    expect(challengeStepPoints(7999, pts)).toBe(7);
    expect(challengeStepPoints(25000, pts)).toBe(10);
    expect(challengeStepPoints(null, pts)).toBe(0);
  });

  it('streak bonus from the 3rd active day in a row', () => {
    const entries = [
      e('1', '2026-11-02', 10),
      e('2', '2026-11-03', 10),
      e('3', '2026-11-04', 10),
      e('4', '2026-11-06', 10),
    ];
    const days = score(entries, '2026-11-02', '2026-11-06');
    expect(days.map((x) => x.streakBonus)).toEqual([0, 0, 5, 0, 0]);
    expect(days.map((x) => x.streakDays)).toEqual([1, 2, 3, 0, 1]);
  });

  it('a streak counts days before the scored window', () => {
    const entries = [
      e('1', '2026-11-01', 10),
      e('2', '2026-10-31', 10),
      e('3', '2026-11-02', 10),
    ];
    const [mon] = score(entries, '2026-11-02', '2026-11-02');
    expect(mon!.streakBonus).toBe(5);
  });

  it('beat your average: +10 over the 28-day average, needs 7 active days', () => {
    // 6 earlier active days of 10 min no-HR = 7.5 pts each -> not eligible
    const base: ChallengeEntry[] = [];
    for (let i = 1; i <= 6; i++)
      base.push(e(`b${i}`, addDays('2026-11-06', -i * 3), 10));
    let [day] = score(
      [...base, e('t', '2026-11-06', 20)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.averageActiveDays).toBe(6);
    expect(day!.beatAverageBonus).toBe(0);
    // 7th earlier active day -> eligible; avg = 7*7.5/28 = 1.875; today 15 > avg
    const seven = [...base, e('b7', '2026-10-09', 10)];
    [day] = score(
      [...seven, e('t', '2026-11-06', 20)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.averageActiveDays).toBe(7);
    expect(day!.average).toBe(1.9);
    expect(day!.beatAverageBonus).toBe(10);
    // an entry 29 days back is outside the window
    [day] = score(
      [...base, e('old', '2026-10-08', 10), e('t', '2026-11-06', 20)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.averageActiveDays).toBe(6);
  });

  it('beat your average is not paid for matching it or for a rest day', () => {
    const entries: ChallengeEntry[] = [];
    for (let i = 1; i <= 28; i++)
      entries.push(e(`b${i}`, addDays('2026-11-06', -i), 40)); // 30 pts a day
    let [day] = score(
      [...entries, e('t', '2026-11-06', 40)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.average).toBe(30);
    expect(day!.beatAverageBonus).toBe(0);
    [day] = score(
      [...entries, e('t', '2026-11-06', 41)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.beatAverageBonus).toBe(10);
    [day] = score(entries, '2026-11-06', '2026-11-06', { '2026-11-06': 5000 });
    expect(day!.beatAverageBonus).toBe(0);
    expect(day!.total).toBe(5);
  });

  it('a day adds effort, steps, streak and the average bonus', () => {
    const entries = [
      e('1', '2026-11-04', 30),
      e('2', '2026-11-05', 30),
      e('3', '2026-11-06', 30, 150),
    ];
    const [day] = score(entries, '2026-11-06', '2026-11-06', {
      '2026-11-06': 12345,
    });
    // 30 min in zone 3 = 60; steps 10 (capped); streak +5; average: only 2 active days -> 0
    expect(day!.total).toBe(75);
  });

  it('PRs: lift, distance and pace need 2 earlier tries; at most 2 a day', () => {
    const lift = (id: string, date: string, e1: number): ChallengeEntry => ({
      id,
      date,
      durationMin: 30,
      name: 'Squat',
      exerciseKey: 'sq',
      bestE1rm: e1,
    });
    let [day] = score(
      [lift('a', '2026-10-20', 100), lift('t', '2026-11-06', 110)],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prBonus).toBe(0); // only one earlier squat
    [day] = score(
      [
        lift('a', '2026-10-20', 100),
        lift('b', '2026-10-27', 105),
        lift('t', '2026-11-06', 110),
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prBonus).toBe(15);
    expect(day!.prs[0]!.type).toBe('lift');
    [day] = score(
      [
        lift('a', '2026-10-20', 100),
        lift('b', '2026-10-27', 110),
        lift('t', '2026-11-06', 110),
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prBonus).toBe(0); // equal is not a record
    [day] = score(
      [
        lift('a', '2026-08-01', 100),
        lift('b', '2026-10-27', 105),
        lift('t', '2026-11-06', 110),
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prBonus).toBe(0); // more than 90 days back is not an earlier try

    const run = (
      id: string,
      date: string,
      km: number,
      min: number
    ): ChallengeEntry => ({
      id,
      date,
      durationMin: min,
      distanceM: km * 1000,
      name: 'Morning Run',
    });
    const runs = [
      run('r1', '2026-10-20', 5, 30),
      run('r2', '2026-10-27', 6, 37),
      run('rt', '2026-11-06', 8, 44),
    ];
    [day] = score(runs, '2026-11-06', '2026-11-06');
    // 8 km > 6 km (distance), 5.5 min/km < 6.0 (pace) -> 2 PRs = 30
    expect(day!.prs.map((x) => x.type).sort()).toEqual(['distance', 'pace']);
    expect(day!.prBonus).toBe(30);
    // a third PR the same day still pays only 2
    [day] = score(
      [
        ...runs,
        lift('a', '2026-10-20', 100),
        lift('b', '2026-10-27', 105),
        lift('t', '2026-11-06', 110),
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prs.length).toBe(3);
    expect(day!.prBonus).toBe(30);
    // walks are a separate kind from runs
    [day] = score(
      [
        ...runs.slice(0, 2),
        {
          id: 'w',
          date: '2026-11-06',
          durationMin: 120,
          distanceM: 9000,
          name: 'Walk',
        },
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.prBonus).toBe(0);
  });

  it('goals: target from own last 4 weeks + 5%, within floor and ceiling; bonus pro rata', () => {
    let g = challengeWeekGoal([], null, '2026-11-02', '2026-11-06', pts)!;
    expect(g.goal).toBe('stay_active');
    expect(g.target).toBe(3);
    expect(g.bonus).toBe(0);
    // lose_weight: 4 earlier weeks of 200 min -> 210 target; 105 done -> half the bonus
    const hist: ChallengeEntry[] = [];
    for (let w = 1; w <= 4; w++)
      hist.push(e(`h${w}`, addDays('2026-11-02', -7 * w + 2), 200));
    g = challengeWeekGoal(
      [...hist, e('t', '2026-11-03', 105)],
      'lose_weight',
      '2026-11-02',
      '2026-11-06',
      pts
    )!;
    expect(g.baseline).toBe(200);
    expect(g.target).toBe(210);
    expect(g.pct).toBe(50);
    expect(g.bonus).toBe(25);
    g = challengeWeekGoal(
      [...hist, e('t', '2026-11-03', 400)],
      'lose_weight',
      '2026-11-02',
      '2026-11-06',
      pts
    )!;
    expect(g.bonus).toBe(50);
    // ceiling: a huge baseline is capped (endurance at most 60 km)
    const far: ChallengeEntry[] = [];
    for (let w = 1; w <= 4; w++)
      far.push({
        id: `f${w}`,
        date: addDays('2026-11-02', -7 * w),
        durationMin: 600,
        distanceM: 100000,
        name: 'Run',
      });
    g = challengeWeekGoal(far, 'endurance', '2026-11-02', '2026-11-06', pts)!;
    expect(g.target).toBe(60);
    // build_muscle counts strength minutes only
    g = challengeWeekGoal(
      [
        { id: 'x', date: '2026-11-03', durationMin: 45, name: 'Bench press' },
        { id: 'y', date: '2026-11-04', durationMin: 45, name: 'Run' },
      ],
      'build_muscle',
      '2026-11-02',
      '2026-11-06',
      pts
    )!;
    expect(g.done).toBe(45);
    // entries after upTo are not counted yet; an unknown goal falls back
    g = challengeWeekGoal(
      [e('t', '2026-11-07', 30)],
      'nonsense',
      '2026-11-02',
      '2026-11-06',
      pts
    )!;
    expect(g.goal).toBe('stay_active');
    expect(g.done).toBe(0);
    expect(challengeGoalType('endurance')).toBe('endurance');
  });

  it('only the best 5 days of a week count; the goal bonus is added', () => {
    const entries: ChallengeEntry[] = [];
    for (let i = 0; i < 7; i++)
      entries.push(e(`d${i}`, addDays('2026-11-02', i), 8 + 4 * i)); // 6, 9, 12 ... 24 pts
    const days = score(entries, '2026-11-02', '2026-11-08');
    const goal = challengeWeekGoal(
      entries,
      'stay_active',
      '2026-11-02',
      '2026-11-08',
      pts
    );
    const t = challengePeriodTotal(days, allRounder, '2026-11-08', [goal]);
    expect(days.map((x) => x.counted)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
    // counted Wed..Sun effort 12+15+18+21+24 = 90; streak +5 on each = 25
    expect(t.effort).toBe(90);
    expect(goal!.bonus).toBe(50);
    expect(t.goalBonus).toBe(50);
    expect(t.total).toBe(90 + 25 + 50);
    expect(t.droppedPoints).toBe(6 + 9);
    expect(t.workouts).toBe(7);
  });

  it('ranking: points, then workout minutes, then name; ties share a rank', () => {
    const { rows } = rankChallengeStandings(
      [
        { userId: 'b', name: 'B', total: 50, minutes: 30 },
        { userId: 'a', name: 'A', total: 50, minutes: 45 },
        { userId: 'c', name: 'C', total: 80, minutes: 10 },
        { userId: 'd', name: 'D', total: 50, minutes: 30 },
      ],
      allRounder
    );
    expect(rows.map((r) => [r.name, r.rank])).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 3],
      ['D', 3],
    ]);
    expect(rows.filter((r) => r.winner).map((r) => r.name)).toEqual(['C']);
  });

  it('a period total ignores days after today', () => {
    const days = score(
      [e('1', '2026-11-05', 20), e('2', '2026-11-07', 20)],
      '2026-11-02',
      '2026-11-08'
    );
    const t = challengePeriodTotal(days, allRounder, '2026-11-06');
    expect(t.total).toBe(15);
    expect(t.workouts).toBe(1);
  });

  it('days: Monday-to-Sunday weeks and months', () => {
    // Weeks come from the shared weekStartOf, Monday first
    const week = (day: string) =>
      challengePeriodWindow('week', day, '2026-01-01', null).start;
    expect(week('2026-11-06')).toBe('2026-11-02'); // Friday -> Monday
    expect(week('2026-11-08')).toBe('2026-11-02'); // Sunday -> the Monday before
    expect(week('2026-11-02')).toBe('2026-11-02');
    expect(week('2026-11-08')).toBe(weekStartOf('2026-11-08', 1));
    expect(
      challengePeriodWindow('month', '2026-02-10', '2026-01-01', null)
    ).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isoWeekday('2026-11-08')).toBe(7);
    expect(isoWeekday('2026-11-02')).toBe(1);
  });

  it('duplicates from two sync sources are merged, keeping the heart-rate copy', () => {
    const hc = (
      id: string,
      name: string,
      min: number,
      extra: Partial<ChallengeEntry> = {}
    ): ChallengeEntry => ({
      id,
      date: '2026-10-29',
      durationMin: min,
      name,
      source: 'health_connect',
      ...extra,
    });
    const fb = (
      id: string,
      name: string,
      min: number,
      hr: number
    ): ChallengeEntry => ({
      id,
      date: '2026-10-29',
      durationMin: min,
      name,
      avgHr: hr,
      source: 'fitbit',
    });
    const out = mergeChallengeDuplicates([
      hc('h1', 'Walking', 15.7, { time: '21:46', distanceM: 390 }),
      hc('h2', 'Walking', 20, { time: '11:39' }),
      hc('h3', 'Traditional Strength Training', 19.3, { time: '08:41' }),
      fb('f1', 'Walk', 20, 101),
      fb('f2', 'Walk', 16, 105),
      fb('f3', 'Strength training', 19, 104),
      fb('f4', 'Racket sports', 50, 125),
      hc('h4', 'Walking', 50), // as long as racket sports but another class: kept
    ]);
    expect(out.map((x) => x.id).sort()).toEqual(['f1', 'f2', 'f3', 'f4', 'h4']);
    const f2 = out.find((x) => x.id === 'f2')!;
    expect(f2.time).toBe('21:46');
    expect(f2.distanceM).toBe(390);
    // two walks from the same source are never merged
    expect(
      mergeChallengeDuplicates([hc('a', 'Walk', 20), hc('b', 'Walk', 20)])
        .length
    ).toBe(2);
  });

  it('merged duplicates count once in a day', () => {
    const [day] = score(
      [
        {
          id: 'p',
          date: '2026-11-06',
          durationMin: 30,
          name: 'Walking',
          source: 'health_connect',
        },
        {
          id: 'w',
          date: '2026-11-06',
          durationMin: 30,
          name: 'Walk',
          source: 'fitbit',
          avgHr: 100,
        },
      ],
      '2026-11-06',
      '2026-11-06'
    );
    expect(day!.workouts).toBe(1);
    expect(day!.effort).toBe(30); // zone 1 x 30 min, not 30 + 22.5
  });
});

describe('challenge rules and presets', () => {
  it('every preset parses and the default is All-Rounder', () => {
    expect(CHALLENGE_PRESETS.length).toBeGreaterThanOrEqual(7);
    for (const preset of CHALLENGE_PRESETS) {
      expect(challengeRulesSchema.safeParse(preset.rules).success).toBe(true);
    }
    expect(challengePreset('all_rounder').name).toBe('All-Rounder');
    expect(CHALLENGE_PRESETS.map((p) => p.name)).toEqual([
      'All-Rounder',
      'Workweek Hustle',
      'Weekend Warrior',
      'Daily Showdown',
      'Race to 100k steps',
      'Most km this month',
      '30-day consistency',
    ]);
    expect(allRounder.metric).toBe('points');
    expect(allRounder.bestDaysPerWeek).toBe(5);
    expect(allRounder.points).toEqual(defaultPointsRules());
  });

  it('fills defaults and refuses incomplete rules', () => {
    const parsed = challengeRulesSchema.parse({ version: 1, metric: 'steps' });
    expect(parsed.format).toBe('leaderboard');
    expect(parsed.period).toBe('week');
    expect(parsed.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      challengeRulesSchema.safeParse({ version: 1, metric: 'points' }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        version: 1,
        metric: 'steps',
        format: 'race',
      }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({ version: 2, metric: 'steps' }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        version: 1,
        metric: 'steps',
        days: [1, 1],
      }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        version: 1,
        metric: 'steps',
        timeWindow: { start: '05:00', end: '05:00' },
      }).success
    ).toBe(false);
  });

  it('every points part can be turned off', () => {
    const rules = challengeRulesSchema.parse({
      version: 1,
      metric: 'points',
      points: {
        steps: null,
        pr: null,
        streak: null,
        beatAverage: null,
        goal: null,
        strengthFloor: null,
        minuteTiers: null,
      },
    });
    const entries: ChallengeEntry[] = [];
    for (let i = 0; i < 10; i++)
      entries.push(e(`d${i}`, addDays('2026-11-06', -i), 120, 150));
    const [day] = score(
      entries,
      '2026-11-06',
      '2026-11-06',
      { '2026-11-06': 20000 },
      rules
    );
    expect(day!.total).toBe(240); // 120 min x 2, nothing else
  });
});

describe('challenge metrics and filters', () => {
  it('steps: the day value is the step count; weekdays outside the challenge count zero', () => {
    const rules = challengePreset('weekend_warrior').rules;
    const days = score(
      [],
      '2026-11-06',
      '2026-11-08',
      { '2026-11-06': 9000, '2026-11-07': 12000, '2026-11-08': 8000 },
      rules
    );
    expect(days.map((d) => [d.eligible, d.total])).toEqual([
      [false, 0],
      [true, 12000],
      [true, 8000],
    ]);
    expect(challengePeriodTotal(days, rules).total).toBe(20000);
  });

  it('a daily cap limits what one day adds', () => {
    const rules = rulesWith({ dailyCap: 10000 });
    const [day] = score(
      [],
      '2026-11-06',
      '2026-11-06',
      { '2026-11-06': 25000 },
      rules
    );
    expect(day!.total).toBe(10000);
  });

  it('distance counts only the chosen sports, in metres', () => {
    const rules = rulesWith({
      metric: 'distance',
      activities: { includeSports: ['running'] },
    });
    const [day] = score(
      [
        {
          id: 'r',
          date: '2026-11-06',
          durationMin: 30,
          distanceM: 5000,
          name: 'Run',
        },
        {
          id: 'b',
          date: '2026-11-06',
          durationMin: 60,
          distanceM: 20000,
          name: 'Cycling',
        },
      ],
      '2026-11-06',
      '2026-11-06',
      {},
      rules
    );
    expect(day!.total).toBe(5000);
  });

  it('workout days, short workouts and the time window', () => {
    const rules = rulesWith({
      metric: 'workout_days',
      activities: { minMinutes: 20 },
      timeWindow: { start: '05:00', end: '09:00' },
    });
    const days = score(
      [
        {
          id: 'a',
          date: '2026-11-04',
          durationMin: 30,
          time: '06:30',
          name: 'Run',
        },
        {
          id: 'b',
          date: '2026-11-05',
          durationMin: 10,
          time: '06:30',
          name: 'Run',
        }, // too short
        {
          id: 'c',
          date: '2026-11-06',
          durationMin: 30,
          time: '18:00',
          name: 'Run',
        }, // outside the window
        { id: 'd', date: '2026-11-07', durationMin: 30, name: 'Run' }, // no start time
      ],
      '2026-11-04',
      '2026-11-07',
      {},
      rules
    );
    expect(days.map((d) => d.total)).toEqual([1, 0, 0, 0]);
  });

  it('manual entries can be ignored or capped per day', () => {
    const manual = (id: string, min: number): ChallengeEntry => ({
      id,
      date: '2026-11-06',
      durationMin: min,
      name: 'Run',
    });
    const synced: ChallengeEntry = {
      id: 's',
      date: '2026-11-06',
      durationMin: 20,
      name: 'Run',
      source: 'garmin',
      avgHr: 140,
    };
    const ignore = rulesWith({
      metric: 'active_minutes',
      activities: { manualEntries: 'ignore' },
    });
    expect(
      score(
        [manual('m', 45), synced],
        '2026-11-06',
        '2026-11-06',
        {},
        ignore
      )[0]!.total
    ).toBe(20);
    const cap = rulesWith({
      metric: 'active_minutes',
      activities: { manualEntries: 'cap', manualMinutesCap: 30 },
    });
    expect(
      score(
        // 25 and 15 manual minutes are capped at 30 together; the synced 20 stay
        [manual('m1', 25), manual('m2', 15), synced],
        '2026-11-06',
        '2026-11-06',
        {},
        cap
      )[0]!.total
    ).toBe(50);
  });

  it('an average heart rate is put in a zone by the shared heartRateZoneFor', () => {
    for (const bpm of [60, 94, 95, 113, 114, 133, 151, 152, 170, 171, 200]) {
      const rate = challengeEntryRate(
        { id: 'a', date: '2026-11-06', durationMin: 30, avgHr: bpm },
        zones,
        pts
      );
      expect(rate.zone, String(bpm)).toBe(heartRateZoneFor(bpm, zones.floors));
    }
  });

  it("diary rows stored as 'Manual' (any casing) are manual entries", () => {
    const row = (source: string | null): ChallengeEntry => ({
      id: 'r',
      date: '2026-11-06',
      durationMin: 30,
      name: 'Run',
      source,
    });
    for (const source of [
      null,
      '',
      'Manual',
      ' MANUAL ',
      'manual',
      'Workout Preset',
      'Workout Plan',
    ]) {
      expect(isManualEntry(row(source)), String(source)).toBe(true);
    }
    // Synced, or timed live in the app
    for (const source of ['garmin', 'HealthKit', 'sparky']) {
      expect(isManualEntry(row(source)), source).toBe(false);
    }
    // The source alone decides: a heart rate typed into the diary form
    // does not make the entry measured
    expect(isManualEntry({ ...row('Manual'), avgHr: 140 })).toBe(true);

    const diary = (id: string, min: number): ChallengeEntry => ({
      ...row('Manual'),
      id,
      durationMin: min,
    });
    const synced: ChallengeEntry = {
      id: 's',
      date: '2026-11-06',
      durationMin: 20,
      name: 'Run',
      source: 'garmin',
      avgHr: 140,
    };
    const ignore = rulesWith({
      metric: 'active_minutes',
      activities: { manualEntries: 'ignore' },
    });
    expect(
      score(
        [diary('m', 45), synced],
        '2026-11-06',
        '2026-11-06',
        {},
        ignore
      )[0]!.total
    ).toBe(20);
    const cap = rulesWith({
      metric: 'active_minutes',
      activities: { manualEntries: 'cap', manualMinutesCap: 30 },
    });
    expect(
      score(
        [diary('m1', 25), diary('m2', 15), synced],
        '2026-11-06',
        '2026-11-06',
        {},
        cap
      )[0]!.total
    ).toBe(50);
  });

  it('heart-rate zone minutes count from the chosen zone up', () => {
    const rules = rulesWith({
      metric: 'hr_zone_minutes',
      zoneMinutesFromZone: 3,
    });
    const [day] = score(
      [
        {
          id: 'z',
          date: '2026-11-06',
          durationMin: 40,
          zoneSeconds: [600, 600, 600, 300, 0],
        },
      ],
      '2026-11-06',
      '2026-11-06',
      {},
      rules
    );
    expect(day!.total).toBe(15);
  });
});

describe('challenge formats', () => {
  it('race: the first to reach the target wins; finishers rank by finish day', () => {
    const rules = challengePreset('race_to_100k_steps').rules;
    const totalFor = (steps: Record<string, number>) => {
      const days = score([], '2026-11-01', '2026-11-10', steps, rules);
      return challengePeriodTotal(days, rules, '2026-11-10');
    };
    const early = totalFor({ '2026-11-01': 60000, '2026-11-02': 45000 });
    const late = totalFor({ '2026-11-01': 50000, '2026-11-05': 80000 });
    const short = totalFor({ '2026-11-01': 90000 });
    expect(early.reachedOn).toBe('2026-11-02');
    expect(late.reachedOn).toBe('2026-11-05');
    const { rows } = rankChallengeStandings(
      [
        {
          userId: 'l',
          name: 'Late',
          total: late.total,
          minutes: 0,
          reachedOn: late.reachedOn,
        },
        {
          userId: 's',
          name: 'Short',
          total: short.total,
          minutes: 0,
          reachedOn: short.reachedOn,
        },
        {
          userId: 'e',
          name: 'Early',
          total: early.total,
          minutes: 0,
          reachedOn: early.reachedOn,
        },
      ],
      rules
    );
    expect(rows.map((r) => [r.name, r.rank, r.winner])).toEqual([
      ['Early', 1, true],
      ['Late', 2, false],
      ['Short', 3, false],
    ]);
  });

  it('hit the goal each day: everyone who hit it every eligible day wins', () => {
    const rules = rulesWith({
      format: 'hit_goal',
      target: 8000,
      targetPer: 'day',
    });
    const member = (steps: Record<string, number>) => {
      const t = challengePeriodTotal(
        score([], '2026-11-02', '2026-11-04', steps, rules),
        rules,
        '2026-11-04'
      );
      return {
        total: t.total,
        minutes: 0,
        daysHit: t.daysHit,
        daysEligible: t.daysEligible,
      };
    };
    const { rows } = rankChallengeStandings(
      [
        {
          userId: 'a',
          name: 'A',
          ...member({
            '2026-11-02': 9000,
            '2026-11-03': 8000,
            '2026-11-04': 8500,
          }),
        },
        {
          userId: 'b',
          name: 'B',
          ...member({
            '2026-11-02': 20000,
            '2026-11-03': 100,
            '2026-11-04': 20000,
          }),
        },
      ],
      rules
    );
    expect(rows.find((r) => r.userId === 'a')!.winner).toBe(true);
    expect(rows.find((r) => r.userId === 'b')!.winner).toBe(false);
  });

  it('group goal: everyone wins once the shared total reaches the target', () => {
    const rules = rulesWith({ format: 'group_goal', target: 100 });
    const reached = rankChallengeStandings(
      [
        { userId: 'a', name: 'A', total: 60, minutes: 0 },
        { userId: 'b', name: 'B', total: 45, minutes: 0 },
      ],
      rules
    );
    expect(reached.groupTotal).toBe(105);
    expect(reached.groupReached).toBe(true);
    expect(reached.rows.every((r) => r.winner)).toBe(true);
    const short = rankChallengeStandings(
      [{ userId: 'a', name: 'A', total: 60, minutes: 0 }],
      rules
    );
    expect(short.groupReached).toBe(false);
    expect(short.rows[0]!.winner).toBe(false);
  });
});

describe('challenge periods', () => {
  it('clips periods to the challenge dates', () => {
    expect(
      challengePeriodWindow('week', '2026-11-12', '2026-11-11', '2026-11-30')
    ).toEqual({ start: '2026-11-11', end: '2026-11-15' });
    expect(
      challengePeriodWindow(
        'challenge',
        '2026-11-20',
        '2026-11-11',
        '2026-11-30'
      )
    ).toEqual({ start: '2026-11-11', end: '2026-11-30' });
    expect(
      challengePeriodWindow('day', '2026-11-20', '2026-11-11', null)
    ).toEqual({ start: '2026-11-20', end: '2026-11-20' });
    expect(
      challengePeriodsUpTo('week', '2026-11-11', null, '2026-11-24').map(
        (w) => w.start
      )
    ).toEqual(['2026-11-11', '2026-11-16', '2026-11-23']);
    expect(
      challengePeriodsUpTo('week', '2026-11-11', null, '2026-11-01')
    ).toEqual([]);
  });

  it('a rules change applies from the start before it, and from the next period after it', () => {
    expect(
      challengeRulesEffectiveFrom('week', '2026-11-05', '2026-11-09', null)
    ).toBe('2026-11-09');
    expect(
      challengeRulesEffectiveFrom('week', '2026-11-12', '2026-11-09', null)
    ).toBe('2026-11-16');
    expect(
      challengeRulesEffectiveFrom('day', '2026-11-12', '2026-11-09', null)
    ).toBe('2026-11-13');
    expect(
      challengeRulesEffectiveFrom('month', '2026-11-12', '2026-11-01', null)
    ).toBe('2026-12-01');
    // a one-period challenge cannot change once running
    expect(
      challengeRulesEffectiveFrom(
        'challenge',
        '2026-11-12',
        '2026-11-01',
        '2026-11-30'
      )
    ).toBe('2026-12-01');
  });
});

describe('review fixes (PR #3585)', () => {
  it('minute tiers apply zone by zone, so splitting a workout does not change its points', () => {
    // 60 min in zone 1 (1/min) + 60 min in zone 3 (2/min)
    const one = challengeDayEffort(
      [
        {
          id: 'w',
          date: 'x',
          durationMin: 120,
          zoneSeconds: [3600, 0, 3600, 0, 0],
        },
      ],
      zones,
      pts
    );
    const split = challengeDayEffort(
      [
        {
          id: 'a',
          date: 'x',
          durationMin: 60,
          zoneSeconds: [3600, 0, 0, 0, 0],
        },
        {
          id: 'b',
          date: 'x',
          durationMin: 60,
          zoneSeconds: [0, 0, 3600, 0, 0],
        },
      ],
      zones,
      pts
    );
    // zone 3 first: 60 x 2 = 120 in full, then 30 zone-1 minutes at half = 15
    expect(one.effort).toBe(135);
    expect(split.effort).toBe(135);
    expect(one.detail[0]!.fullMinutes).toBe(60);
    expect(one.detail[0]!.halfMinutes).toBe(30);
    expect(one.detail[0]!.unpaidMinutes).toBe(30);
    expect(one.detail[0]!.perMin).toBe(1.5);
  });

  it('two same-length workouts hours apart are not merged as duplicates', () => {
    const run = (
      id: string,
      time: string,
      source: string,
      avgHr: number | null
    ): ChallengeEntry => ({
      id,
      date: '2026-11-06',
      time,
      durationMin: 30,
      name: 'Run',
      source,
      avgHr,
    });
    expect(
      mergeChallengeDuplicates([
        run('am', '07:00', 'health_connect', null),
        run('pm', '18:00', 'garmin', 150),
      ]).map((x) => x.id)
    ).toEqual(['am', 'pm']);
    expect(
      mergeChallengeDuplicates([
        run('phone', '07:00', 'health_connect', null),
        run('watch', '07:05', 'garmin', 150),
      ]).map((x) => x.id)
    ).toEqual(['watch']);
  });

  it('the manual-minute cap does not make a manual run look faster', () => {
    const rules = challengeRulesSchema.parse({
      ...allRounder,
      activities: { manualEntries: 'cap', manualMinutesCap: 10 },
    });
    const synced = (id: string, date: string, min: number): ChallengeEntry => ({
      id,
      date,
      durationMin: min,
      name: 'Morning Run',
      source: 'garmin',
      avgHr: 150,
      distanceM: 5000,
    });
    const [day] = score(
      [
        synced('a', '2026-10-30', 30),
        synced('b', '2026-11-02', 29),
        // 5 km in 40 minutes, logged by hand: capped to 10 scoring minutes
        {
          id: 't',
          date: '2026-11-06',
          durationMin: 40,
          name: 'Morning Run',
          distanceM: 5000,
        },
      ],
      '2026-11-06',
      '2026-11-06',
      {},
      rules
    );
    expect(day!.minutes).toBe(10);
    expect(day!.prs.filter((p) => p.type === 'pace')).toEqual([]);
  });

  it('zone minutes: the average heart rate is not used when a breakdown exists', () => {
    const rules = rulesWith({
      metric: 'hr_zone_minutes',
      zoneMinutesFromZone: 3,
    });
    const [day] = score(
      [
        {
          id: 'z',
          date: '2026-11-06',
          durationMin: 30,
          avgHr: 140, // zone 3 on its own
          zoneSeconds: [1800, 0, 0, 0, 0],
        },
      ],
      '2026-11-06',
      '2026-11-06',
      {},
      rules
    );
    expect(day!.total).toBe(0);
  });

  it('a steps challenge scores steps even when a points object is present', () => {
    const rules = rulesWith({ metric: 'steps', points: {} });
    const [day] = score(
      [e('w', '2026-11-06', 40)],
      '2026-11-06',
      '2026-11-06',
      { '2026-11-06': 10000 },
      rules
    );
    expect(day!.total).toBe(10000);
  });

  it('race: members who finish on the same day share the win, whatever they add later', () => {
    const rules = challengePreset('race_to_100k_steps').rules;
    const { rows } = rankChallengeStandings(
      [
        {
          userId: 'a',
          name: 'Ann',
          total: 101000,
          minutes: 0,
          reachedOn: '2026-11-05',
        },
        {
          userId: 'b',
          name: 'Bo',
          total: 140000,
          minutes: 0,
          reachedOn: '2026-11-05',
        },
        {
          userId: 'c',
          name: 'Cy',
          total: 150000,
          minutes: 0,
          reachedOn: '2026-11-06',
        },
        { userId: 'd', name: 'Di', total: 90000, minutes: 0, reachedOn: null },
      ],
      rules
    );
    expect(rows.map((r) => [r.name, r.rank, r.winner])).toEqual([
      ['Bo', 1, true],
      ['Ann', 1, true],
      ['Cy', 3, false],
      ['Di', 4, false],
    ]);
  });

  it('rule arrays have a maximum length', () => {
    const many = Array(10).fill('running');
    expect(
      challengeRulesSchema.safeParse({
        ...allRounder,
        activities: { includeSports: many },
      }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        ...allRounder,
        activities: { excludeSports: many },
      }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        ...allRounder,
        points: {
          ...allRounder.points,
          pr: { types: ['lift', 'lift', 'lift', 'lift'] },
        },
      }).success
    ).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        ...allRounder,
        activities: { includeSports: ['running', 'cycling'] },
      }).success
    ).toBe(true);
  });
});

describe('bot review follow-ups (PRs #3594 and #3595)', () => {
  it('the lifting floor applies minute by minute, so a split workout scores the same', () => {
    const lift = (id: string, zoneSeconds: number[]): ChallengeEntry => ({
      id,
      date: '2026-11-06',
      durationMin: zoneSeconds.reduce((s, x) => s + x, 0) / 60,
      name: 'Bench Press',
      category: 'Strength',
      zoneSeconds,
    });
    const whole = score(
      [lift('w', [1800, 0, 1800, 0, 0])],
      '2026-11-06',
      '2026-11-06'
    )[0]!;
    const split = score(
      [lift('a', [1800, 0, 0, 0, 0]), lift('b', [0, 0, 1800, 0, 0])],
      '2026-11-06',
      '2026-11-06'
    )[0]!;
    // 30 min in zone 1 raised to 1.5, 30 min in zone 3 at 2
    expect(whole.effort).toBe(105);
    expect(split.effort).toBe(105);
  });

  it('one workout synced from three sources counts once', () => {
    const copy = (
      id: string,
      source: string,
      extra: Partial<ChallengeEntry> = {}
    ): ChallengeEntry => ({
      id,
      date: '2026-11-06',
      durationMin: 30,
      name: 'Run',
      time: '07:00',
      source,
      ...extra,
    });
    const out = mergeChallengeDuplicates([
      copy('hc', 'health_connect', { distanceM: 5000 }),
      copy('gm', 'garmin', { avgHr: 150 }),
      copy('st', 'strava'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'gm', distanceM: 5000 });
    expect(out[0]!.mergedFrom!.split(',').sort()).toEqual(['hc', 'st']);
    // Two runs from one source stay two, even with a third copy around
    expect(
      mergeChallengeDuplicates([
        copy('g1', 'garmin'),
        copy('g2', 'garmin', { time: '07:05' }),
        copy('s1', 'strava'),
      ])
    ).toHaveLength(2);
    // A middle copy that matches both ends does not chain two workouts
    expect(
      mergeChallengeDuplicates([
        copy('w', 'watch', { durationMin: 30, time: '10:00' }),
        copy('p', 'phone', { durationMin: 33, time: '10:14' }),
        copy('s', 'strava', { durationMin: 36, time: '10:28' }),
      ])
    ).toHaveLength(2);
  });

  it('a race finish is the first day the total got there, even when a better day later replaces it', () => {
    const rules = challengeRulesSchema.parse({
      version: 1,
      metric: 'steps',
      format: 'race',
      target: 50,
      bestDaysPerWeek: 1,
    });
    const days = score(
      [],
      '2026-11-02',
      '2026-11-03',
      { '2026-11-02': 60, '2026-11-03': 100 },
      rules
    );
    const t = challengePeriodTotal(days, rules, '2026-11-03');
    expect(t.total).toBe(100); // only Tuesday counts in the end
    expect(t.reachedOn).toBe('2026-11-02'); // but Monday already finished
  });
});

describe('preset windows', () => {
  it('a preset scored on some weekdays runs until it holds its length in those days', () => {
    // Monday 2026-11-16
    expect(challengePresetEndDate('weekend_warrior', '2026-11-16')).toBe(
      '2026-11-22'
    );
    expect(challengePresetEndDate('weekend_warrior', '2026-11-21')).toBe(
      '2026-11-22'
    );
    expect(challengePresetEndDate('workweek_hustle', '2026-11-16')).toBe(
      '2026-11-20'
    );
    expect(challengePresetEndDate('workweek_hustle', '2026-11-18')).toBe(
      '2026-11-24'
    );
    expect(challengePresetEndDate('daily_showdown', '2026-11-16')).toBe(
      '2026-11-16'
    );
    expect(challengePresetEndDate('all_rounder', '2026-11-16')).toBeNull();
  });
});

describe('duplicate merge, second round', () => {
  const run = (
    id: string,
    source: string,
    extra: Partial<ChallengeEntry> = {}
  ): ChallengeEntry => ({
    id,
    date: '2026-11-06',
    durationMin: 30,
    name: 'Run',
    source,
    ...extra,
  });

  it("'Manual' and ' manual ' are one source, so two such runs stay two", () => {
    expect(
      mergeChallengeDuplicates([run('a', 'Manual'), run('b', ' manual ')])
    ).toHaveLength(2);
  });

  it('the kept copy takes calories and elevation from the other', () => {
    const [kept] = mergeChallengeDuplicates([
      run('hc', 'health_connect', { activeCalories: 200, elevationM: 50 }),
      run('gm', 'garmin', { avgHr: 150 }),
    ]);
    expect(kept).toMatchObject({
      id: 'gm',
      activeCalories: 200,
      elevationM: 50,
    });
  });

  it('with manual entries ignored, the timed copy of the same workout is kept', () => {
    const rules = rulesWith({
      metric: 'active_minutes',
      activities: { manualEntries: 'ignore' },
    });
    const counted = challengeCountedEntries(
      [run('m', 'Manual'), run('s', 'sparky', { durationMin: 29 })],
      rules
    );
    expect(counted.map((e) => e.id)).toEqual(['s']);
  });
});

describe('period totals up to a day', () => {
  it('goal progress dated after upTo does not count, so total and finish agree', () => {
    const rules = challengeRulesSchema.parse({
      version: 1,
      metric: 'steps',
      format: 'race',
      target: 50,
    });
    const days = score(
      [],
      '2026-11-02',
      '2026-11-03',
      { '2026-11-02': 10, '2026-11-03': 10 },
      rules
    );
    const t = challengePeriodTotal(days, rules, '2026-11-03', [
      { weekStart: '2026-11-02', asOf: '2026-11-04', rawBonus: 50 },
    ]);
    expect(t.total).toBe(20);
    expect(t.reachedOn).toBeNull();
  });
});

describe('CodeWithCJ review (PR #3585)', () => {
  const day = '2026-11-06';
  const entry = (
    id: string,
    name: string,
    category: string | null,
    extra: Partial<ChallengeEntry> = {}
  ): ChallengeEntry => ({
    id,
    date: day,
    durationMin: 30,
    name,
    category,
    source: 'garmin',
    ...extra,
  });

  it('the category decides lifting first: Indoor Row (Cardio) is not lifting, Barbell, Seated Cable and Bent Over Rows are', () => {
    const indoor = entry('indoor', 'Indoor Row', 'Cardio');
    const barbell = entry('barbell', 'Barbell Row', 'Strength');
    const cable = entry('cable', 'Seated Cable Row', 'Strength');
    const bentOver = entry('bent', 'Bent Over Row', null);
    expect(isStrengthEntry(indoor)).toBe(false);
    expect(challengeEntryClass(indoor)).toBe('other');
    // No lifting floor: a no-HR Indoor Row pays the no-HR rate
    expect(challengeEntryRate(indoor, zones, pts).perMin).toBe(0.75);
    expect(challengeEntryRate(indoor, zones, pts).strengthFloored).toBe(false);
    for (const lift of [barbell, cable, bentOver]) {
      expect(isStrengthEntry(lift), lift.name!).toBe(true);
      expect(challengeEntryClass(lift), lift.name!).toBe('strength');
      expect(challengeFilterSport(lift), lift.name!).toBe('strength');
    }
    expect(challengeFilterSport(indoor)).toBe('rowing');
    // A bare "Row" with no category is still rowing
    expect(challengeFilterSport(entry('row', 'Row', null))).toBe('rowing');
  });

  it('the sport filter follows the category: lifting rows count in a strength challenge, not a rowing one', () => {
    const list = [
      entry('indoor', 'Indoor Row', 'Cardio'),
      entry('barbell', 'Barbell Row', 'Strength'),
      entry('cable', 'Seated Cable Row', 'Strength'),
      entry('bent', 'Bent Over Row', null),
    ];
    const ids = (sports: ChallengeRulesInput['activities']) =>
      challengeCountedEntries(
        list,
        rulesWith({ metric: 'active_minutes', activities: sports })
      )
        .map((x) => x.id)
        .sort();
    expect(ids({ includeSports: ['strength'] })).toEqual([
      'barbell',
      'bent',
      'cable',
    ]);
    expect(ids({ includeSports: ['rowing'] })).toEqual(['indoor']);
    expect(ids({ excludeSports: ['strength'] })).toEqual(['indoor']);
  });

  it('a manual entry stays manual with a typed-in heart rate, so ignore and cap still apply', () => {
    const typed = entry('typed', 'Run', null, {
      source: 'Manual',
      durationMin: 90,
      avgHr: 160,
    });
    const minutes = (mode: 'ignore' | 'cap') =>
      score(
        [typed],
        day,
        day,
        {},
        rulesWith({
          metric: 'active_minutes',
          activities: { manualEntries: mode, manualMinutesCap: 30 },
        })
      )[0]!.total;
    expect(minutes('ignore')).toBe(0);
    expect(minutes('cap')).toBe(30);
    // In a points challenge with the cap it is paid for 30 minutes, not 90
    const points = challengeRulesSchema.parse({
      ...allRounder,
      activities: { manualEntries: 'cap', manualMinutesCap: 30 },
    });
    expect(score([typed], day, day, {}, points)[0]!.minutes).toBe(30);
  });

  it('a capped copy cuts distance, calories and elevation by the same fraction as its minutes', () => {
    // 100 km typed in over 60 minutes, capped to 15: a quarter of it counts
    const typed = entry('typed', 'Ride', 'Cardio', {
      source: 'Manual',
      durationMin: 60,
      distanceM: 100_000,
      activeCalories: 800,
      elevationM: 400,
    });
    const total = (metric: ChallengeRules['metric']) =>
      score(
        [typed],
        day,
        day,
        {},
        rulesWith({
          metric,
          activities: { manualEntries: 'cap', manualMinutesCap: 15 },
        })
      )[0]!.total;
    expect(total('distance')).toBe(25_000);
    expect(total('active_calories')).toBe(200);
    expect(total('elevation')).toBe(100);
    expect(total('active_minutes')).toBe(15);
    const [copy] = challengeCountedEntries(
      [typed],
      rulesWith({
        metric: 'distance',
        activities: { manualEntries: 'cap', manualMinutesCap: 15 },
      })
    );
    // Pace stays the measured 0.6 min/km
    expect(copy!.durationMin / (copy!.distanceM! / 1000)).toBeCloseTo(0.6);
    // An entry under the cap is kept as it is
    const short = { ...typed, durationMin: 10 };
    expect(
      challengeCountedEntries(
        [short],
        rulesWith({
          metric: 'distance',
          activities: { manualEntries: 'cap', manualMinutesCap: 15 },
        })
      )[0]
    ).toBe(short);
  });

  it('the weekly goal is refused on a daily points challenge', () => {
    const daily = { ...allRounder, period: 'day' as const };
    expect(challengeRulesSchema.safeParse(daily).success).toBe(false);
    expect(
      challengeRulesSchema.safeParse({
        ...daily,
        points: { ...allRounder.points, goal: null },
      }).success
    ).toBe(true);
    // Weekly, monthly and whole-challenge periods keep it
    for (const period of ['week', 'month', 'challenge'] as const) {
      expect(
        challengeRulesSchema.safeParse({ ...allRounder, period }).success,
        period
      ).toBe(true);
    }
  });

  it('a week cut by the period counts its own days against its share of the target', () => {
    const runs = [
      // Monday to Wednesday, before a challenge that starts on Thursday
      entry('mon', 'Run', 'Cardio', { date: '2026-11-02' }),
      entry('tue', 'Run', 'Cardio', { date: '2026-11-03' }),
      entry('wed', 'Run', 'Cardio', { date: '2026-11-04' }),
      entry('thu', 'Run', 'Cardio', { date: '2026-11-05' }),
      entry('fri', 'Run', 'Cardio', { date: '2026-11-06' }),
    ];
    const all = [1, 2, 3, 4, 5, 6, 7];
    const full = challengeWeekGoal(
      runs,
      'stay_active',
      '2026-11-02',
      '2026-11-08',
      pts
    )!;
    expect(full.target).toBe(3); // the stay-active floor
    expect(full.done).toBe(5);
    const part = challengeWeekGoal(
      runs,
      'stay_active',
      '2026-11-02',
      '2026-11-08',
      pts,
      { start: '2026-11-05', end: '2026-11-08', days: all }
    )!;
    // Thursday to Sunday is 4 of 7 days: the target is 3 x 4/7
    expect(part.target).toBe(1.7);
    // Only Thursday and Friday count, not the days before the start
    expect(part.done).toBe(2);
    // Met in full, it pays its share of the bonus: 4/7 of 50
    expect(part.rawBonus).toBeCloseTo((pts.goal!.maxBonus * 4) / 7);
    // A one-day slice (a month starting on a Sunday) pays a seventh at most
    const sunday = challengeWeekGoal(
      [entry('sun', 'Run', 'Cardio', { date: '2026-11-08' })],
      'stay_active',
      '2026-11-02',
      '2026-11-08',
      pts,
      { start: '2026-11-08', end: '2026-11-30', days: all }
    )!;
    expect(sunday.rawBonus).toBeCloseTo(pts.goal!.maxBonus / 7);
    // Weekdays only (Mon-Fri), starting on a Saturday: no counted day left
    const weekend = challengeWeekGoal(
      runs,
      'stay_active',
      '2026-11-02',
      '2026-11-08',
      pts,
      { start: '2026-11-07', end: '2026-11-08', days: [1, 2, 3, 4, 5] }
    )!;
    expect(weekend.rawBonus).toBe(0);
  });

  it('rules saved with a daily period and a goal still load, with the goal off', () => {
    const stored = {
      ...allRounder,
      period: 'day',
      points: { ...allRounder.points, goal: { maxBonus: 50 } },
    };
    const parsed = parseChallengeRules(stored);
    expect(parsed.success).toBe(true);
    expect(parsed.data!.points!.goal).toBeNull();
    // A request with both is still refused
    expect(challengeRulesSchema.safeParse(stored).success).toBe(false);
  });

  it('a typed-in copy with heart rate does not replace the synced copy of the same run', () => {
    const typed = entry('typed', 'Run', 'Cardio', {
      source: 'Manual',
      durationMin: 90,
      avgHr: 150,
    });
    const synced = entry('synced', 'Run', 'Cardio', {
      source: 'strava',
      durationMin: 88,
      distanceM: 15_000,
    });
    const counted = challengeCountedEntries(
      [typed, synced],
      rulesWith({
        metric: 'active_minutes',
        activities: { manualEntries: 'cap', manualMinutesCap: 30 },
      })
    );
    expect(counted).toHaveLength(1);
    expect(counted[0]!.id).toBe('synced');
    expect(counted[0]!.durationMin).toBe(88);
    expect(counted[0]!.distanceM).toBe(15_000);
  });
});

describe('CodeRabbit and Cardio-import follow-ups (PR #3585)', () => {
  const day = '2026-11-06';
  const entry = (
    id: string,
    name: string,
    category: string | null,
    extra: Partial<ChallengeEntry> = {}
  ): ChallengeEntry => ({
    id,
    date: day,
    durationMin: 30,
    name,
    category,
    source: 'garmin',
    ...extra,
  });
  const capped = (metric: ChallengeRules['metric']) =>
    rulesWith({
      metric,
      activities: { manualEntries: 'cap', manualMinutesCap: 15 },
    });

  it('a capped copy cuts its zone time too, so the rate and zone minutes see 15 minutes, not 60', () => {
    const typed = entry('typed', 'Run', 'Cardio', {
      source: 'Manual',
      durationMin: 60,
      zoneSeconds: [0, 0, 3600, 0, 0],
    });
    const [copy] = challengeCountedEntries([typed], capped('hr_zone_minutes'));
    expect(copy!.zoneSeconds).toEqual([0, 0, 900, 0, 0]);
    const rate = challengeEntryRate(copy!, zones, pts);
    expect(rate.minutes).toBe(15);
    expect(
      score([typed], day, day, {}, capped('hr_zone_minutes'))[0]!.total
    ).toBe(15);
    expect(
      score([typed], day, day, {}, capped('active_minutes'))[0]!.total
    ).toBe(15);
  });

  it('a Strength Training session an importer filed under Cardio is still lifting', () => {
    // Oura, Polar and Withings create every workout with category Cardio
    const synced = entry('oura', 'Strength Training', 'Cardio', {
      source: 'Oura',
    });
    for (const source of ['Polar', 'Withings']) {
      expect(isStrengthEntry({ ...synced, source }), source).toBe(true);
    }
    expect(isStrengthEntry(synced)).toBe(true);
    expect(challengeEntryClass(synced)).toBe('strength');
    expect(challengeFilterSport(synced)).toBe('strength');
    expect(challengeEntryRate(synced, zones, pts).strengthFloored).toBe(true);
    expect(
      challengeCountedEntries(
        [synced],
        rulesWith({
          metric: 'active_minutes',
          activities: { includeSports: ['strength'] },
        })
      ).map((x) => x.id)
    ).toEqual(['oura']);
    // Otherwise Cardio still means not lifting, as the owner asked
    for (const cardio of [
      entry('run', 'Running', 'Cardio', { source: 'Oura' }),
      entry('bw', 'Body Weight Cardio', 'Cardio', { source: 'Polar' }),
      entry('indoor', 'Indoor Row', 'Cardio'),
      // The exception is only for those importers: a member's own Cardio
      // exercise stays not lifting whatever its name
      entry('hiit', 'Body Weight HIIT', 'Cardio', { source: 'Manual' }),
      entry('st', 'Strength Training', 'Cardio', { source: 'garmin' }),
    ]) {
      expect(isStrengthEntry(cardio), cardio.name!).toBe(false);
      expect(challengeFilterSport(cardio), cardio.name!).not.toBe('strength');
    }
    for (const lift of [
      entry('bb', 'Barbell Row', 'Strength'),
      entry('sc', 'Seated Cable Row', 'Strength'),
    ]) {
      expect(isStrengthEntry(lift), lift.name!).toBe(true);
    }
  });

  it('a capped manual run keeps its logged distance for the pace PR minimum, not the distance PR', () => {
    // Two earlier 5 km runs at 6 min/km, then a typed-in 5 km at 5 min/km
    // that the 15-minute cap cuts to 15 of its 25 minutes (3 km)
    const earlier = [
      entry('a', 'Run', 'Cardio', {
        date: '2026-11-01',
        durationMin: 30,
        distanceM: 5000,
      }),
      entry('b', 'Run', 'Cardio', {
        date: '2026-11-02',
        durationMin: 30,
        distanceM: 5000,
      }),
    ];
    const typed = entry('typed', 'Run', 'Cardio', {
      source: 'Manual',
      durationMin: 25,
      distanceM: 5000,
    });
    const rules = {
      ...pts,
      pr: { ...pts.pr!, minPaceMeters: 4000, types: ['pace' as const] },
    };
    const counted = challengeCountedEntries(
      [...earlier, typed],
      capped('active_minutes')
    );
    const copy = counted.find((x) => x.id === 'typed')!;
    expect(copy.durationMin).toBe(15);
    expect(copy.distanceM).toBe(3000);
    const byDate = new Map<string, ChallengeEntry[]>();
    for (const x of counted)
      byDate.set(x.date, [...(byDate.get(x.date) ?? []), x]);
    const prs = challengePrsForDay(day, byDate, rules);
    expect(prs).toEqual([
      expect.objectContaining({ entryId: 'typed', type: 'pace', value: 5 }),
    ]);
    // A distance PR counts only what the cap kept, so the cap holds there:
    // a typed-in 10 km cut to 3 km does not beat the earlier 5 km
    const typedFar = { ...typed, durationMin: 50, distanceM: 10_000 };
    const far = challengeCountedEntries(
      [...earlier, typedFar],
      capped('active_minutes')
    );
    const farByDate = new Map<string, ChallengeEntry[]>();
    for (const x of far)
      farByDate.set(x.date, [...(farByDate.get(x.date) ?? []), x]);
    expect(
      challengePrsForDay(day, farByDate, {
        ...rules,
        pr: { ...rules.pr, types: ['distance'] },
      })
    ).toEqual([]);
  });
});

describe('an active-calories day scores like the Diary', () => {
  const day = '2026-11-06';
  const run = (id: string, extra: Partial<ChallengeEntry> = {}) =>
    ({
      id,
      date: day,
      time: '07:00',
      durationMin: 30,
      name: 'Running',
      category: 'Cardio',
      source: 'garmin',
      activeCalories: 300,
      ...extra,
    }) as ChallengeEntry;
  // What a device syncs as the day's "Active Calories" row
  const total = (id: string, kcal: number, source = 'garmin') =>
    ({
      id,
      date: day,
      durationMin: 0,
      name: 'Active Calories',
      category: 'Other',
      source,
      activeCalories: kcal,
    }) as ChallengeEntry;
  const kcal = (
    entries: ChallengeEntry[],
    daily: number | null,
    activities: ChallengeRulesInput['activities'] = {},
    extra: Partial<ChallengeRulesInput> = {}
  ) =>
    scoreChallengeDays(
      {
        entries,
        steps: {},
        dailyCalories: daily === null ? [] : [total('t', daily)],
        zones,
      },
      day,
      day,
      rulesWith({ metric: 'active_calories', activities, ...extra })
    )[0]!.total;

  it('takes the daily total when it already holds the workout (600 + 300 run = 600)', () => {
    expect(kcal([run('r')], 600)).toBe(600);
  });

  it('takes the workouts when they add up to more (200 daily + 300 run = 300)', () => {
    expect(kcal([run('r')], 200)).toBe(300);
  });

  it('a day with only the daily total scores it', () => {
    expect(kcal([], 600)).toBe(600);
  });

  it('a day with only workouts scores them', () => {
    expect(kcal([run('r'), run('s', { time: '18:00' })], null)).toBe(600);
  });

  it('a capped typed-in workout counts its share toward the workouts side', () => {
    // 800 kcal typed in over 60 minutes, capped to 15: 200 of it, plus a 300
    // kcal run, is 500, still under a 600 daily total
    const typed = run('m', {
      time: '12:00',
      source: 'Manual',
      durationMin: 60,
      activeCalories: 800,
    });
    const capped = { manualEntries: 'cap' as const, manualMinutesCap: 15 };
    expect(kcal([run('r'), typed], 600, capped)).toBe(600);
    expect(kcal([run('r'), typed], 100, capped)).toBe(500);
    expect(kcal([run('r'), typed], 100, { manualEntries: 'ignore' })).toBe(300);
  });

  it('a whole-day total never brings back workouts the rules leave out', () => {
    const walk = run('w', {
      time: '12:00',
      name: 'Walking',
      activeCalories: 250,
    });
    // The 600 daily total holds the walk, so with walks excluded only the run counts
    expect(kcal([run('r'), walk], 600, { excludeSports: ['walking'] })).toBe(
      300
    );
    expect(kcal([run('r'), walk], 600, { includeSports: ['running'] })).toBe(
      300
    );
    // A minimum length drops the whole-day total too, as it can't be split
    expect(kcal([run('r'), walk], 600, { minMinutes: 20 })).toBe(550);
    expect(
      kcal(
        [run('r'), walk],
        600,
        {},
        {
          timeWindow: { start: '06:00', end: '09:00' },
        }
      )
    ).toBe(300);
    // With no such rule, the daily total stands
    expect(kcal([run('r'), walk], 600)).toBe(600);
  });

  it("two devices' daily totals add up, as in the Diary", () => {
    const rules = rulesWith({ metric: 'active_calories' });
    const days = scoreChallengeDays(
      {
        entries: [run('r')],
        steps: {},
        dailyCalories: [total('g', 400), total('a', 350, 'apple_health')],
        zones,
      },
      day,
      day,
      rules
    );
    expect(days[0]!.total).toBe(750);
  });

  it('a typed-in daily total counts only when manual entries count in full', () => {
    const typed = total('m', 3000, 'Manual');
    const with_ = (manualEntries: 'count' | 'cap' | 'ignore') =>
      challengeDailyCalories(
        [typed],
        rulesWith({ metric: 'active_calories', activities: { manualEntries } })
      ).get(day) ?? 0;
    expect(with_('count')).toBe(3000);
    expect(with_('cap')).toBe(0);
    expect(with_('ignore')).toBe(0);
  });

  // A workout whose calories the member set in the Diary (calories_applied):
  // activeCalories is what the Diary counts, caloriesEstimate its own figure
  const overridden = (
    id: string,
    applied: number,
    extra: Partial<ChallengeEntry> = {}
  ) => run(id, { activeCalories: applied, caloriesEstimate: 300, ...extra });

  it("counts the Diary's calorie override when manual entries count in full", () => {
    expect(kcal([overridden('r', 500)], null)).toBe(500);
    expect(kcal([overridden('r', 120)], null)).toBe(120);
    // Set to 0 in the Diary, it counts nothing here either
    expect(kcal([overridden('r', 0)], null)).toBe(0);
  });

  it('treats an override like a typed-in entry under cap and ignore: a measured workout scores its own figure', () => {
    for (const manualEntries of ['cap', 'ignore'] as const) {
      expect(kcal([overridden('r', 900)], null, { manualEntries })).toBe(300);
      expect(kcal([overridden('r', 100)], null, { manualEntries })).toBe(300);
    }
  });

  it('a typed-in entry keeps its override, capped or dropped with the entry', () => {
    const typed = overridden('m', 800, { source: 'Manual', durationMin: 60 });
    expect(kcal([typed], null)).toBe(800);
    // 15 of its 60 minutes kept, so a quarter of the 800
    expect(
      kcal([typed], null, { manualEntries: 'cap', manualMinutesCap: 15 })
    ).toBe(200);
    expect(kcal([typed], null, { manualEntries: 'ignore' })).toBe(0);
  });

  it('merged duplicates count once, the side a calorie link kept', () => {
    // The member linked their typed-in run to the watch's copy and kept their
    // own 250 kcal: the link set the watch copy to 0
    const watch = overridden('w', 0);
    const typed = run('m', { source: 'Manual', activeCalories: 250 });
    expect(kcal([watch, typed], null)).toBe(250);
    // Kept the watch's 300 instead: the typed-in side is 0
    const typedOff = run('m', {
      source: 'Manual',
      activeCalories: 0,
      caloriesEstimate: 250,
    });
    expect(kcal([run('w'), typedOff], null)).toBe(300);
    // Under cap the measured copy is kept with its own figure, never the
    // typed-in copy's
    expect(
      kcal([watch, typed], null, { manualEntries: 'cap', manualMinutesCap: 15 })
    ).toBe(300);
    // An override on the copy that is kept wins over the other copy's figure
    const apple = run('a', { source: 'apple_health', activeCalories: 280 });
    expect(kcal([overridden('w', 410), apple], null)).toBe(410);
  });

  it('a linked pair that does not merge counts once under every manual rule', () => {
    // A typed-in run linked to the watch's copy, which started 30 minutes
    // later (too far apart to merge): the member kept their own 250 kcal, so
    // the link set the watch copy to 0
    const typed = run('m', {
      source: 'Manual',
      activeCalories: 250,
      calorieLinkId: 'L',
    });
    const watch = overridden('w', 0, { time: '07:30', calorieLinkId: 'L' });
    expect(kcal([typed, watch], null)).toBe(250);
    // Capped or ignored, the measured side's own figure counts, once
    const cap = { manualEntries: 'cap' as const, manualMinutesCap: 15 };
    expect(kcal([typed, watch], null, cap)).toBe(300);
    expect(kcal([typed, watch], null, { manualEntries: 'ignore' })).toBe(300);
    expect(kcal([typed, watch], null, { ...cap, mergeDuplicates: false })).toBe(
      300
    );
  });

  it('a link between two measured workouts counts the kept side at its own figure', () => {
    // A live workout timed in the app linked to the watch's copy
    const live = run('s', {
      source: 'sparky',
      activeCalories: 280,
      calorieLinkId: 'L',
      calorieLinkResolution: 'sparkyfitness',
    });
    const watch = overridden('w', 0, {
      time: '07:30',
      calorieLinkId: 'L',
      calorieLinkResolution: 'sparkyfitness',
    });
    expect(kcal([live, watch], null, { manualEntries: 'cap' })).toBe(280);
    // A custom figure typed into the link counts only in full; capped or
    // ignored, the kept side scores its own figure
    const link = { calorieLinkId: 'L', calorieLinkResolution: 'custom' };
    const custom = overridden('s', 2000, {
      source: 'sparky',
      caloriesEstimate: 280,
      ...link,
    } as Partial<ChallengeEntry>);
    const watchOff = overridden('w', 0, {
      time: '07:30',
      ...link,
    } as Partial<ChallengeEntry>);
    expect(kcal([custom, watchOff], null)).toBe(2000);
    for (const manualEntries of ['cap', 'ignore'] as const) {
      expect(kcal([custom, watchOff], null, { manualEntries })).toBe(280);
      expect(
        kcal([custom, watchOff], null, {
          manualEntries,
          mergeDuplicates: false,
        })
      ).toBe(280);
    }
  });

  it("a custom 0 on a link of two measured workouts: 0 in full, the SparkyFitness side's own figure capped or ignored", () => {
    // The link API takes custom_calories: 0, which writes 0 on both sides, so
    // the side that counts comes from the stored resolution, not from a 0
    const link = (resolution: ChallengeEntry['calorieLinkResolution']) => ({
      calorieLinkId: 'L',
      calorieLinkResolution: resolution,
    });
    const live = overridden('s', 0, {
      source: 'sparky',
      caloriesEstimate: 280,
      ...link('custom'),
    });
    const watch = overridden('w', 0, { time: '07:30', ...link('custom') });
    expect(kcal([live, watch], null)).toBe(0);
    for (const manualEntries of ['cap', 'ignore'] as const) {
      expect(kcal([live, watch], null, { manualEntries })).toBe(280);
      expect(
        kcal([live, watch], null, { manualEntries, mergeDuplicates: false })
      ).toBe(280);
    }
    // Merged (same start) it still counts the SparkyFitness side's 280
    expect(
      kcal([live, { ...watch, time: '07:00' }], null, { manualEntries: 'cap' })
    ).toBe(280);
    // 'synced' keeps the watch's own figure; 'higher' keeps the side the link
    // left at its own estimate (no override)
    const liveOff = (resolution: ChallengeEntry['calorieLinkResolution']) =>
      overridden('s', 0, {
        source: 'sparky',
        caloriesEstimate: 280,
        ...link(resolution),
      });
    const watchKept = (resolution: ChallengeEntry['calorieLinkResolution']) =>
      run('w', { time: '07:30', ...link(resolution) });
    for (const resolution of ['synced', 'higher'] as const) {
      expect(
        kcal([liveOff(resolution), watchKept(resolution)], null, {
          manualEntries: 'cap',
        })
      ).toBe(300);
    }
  });

  it('under cap a typed-in copy never fills calories, distance or elevation into a measured one', () => {
    // The watch's copy has no calories; the member's typed-in copy says 1500
    const watch = run('w', {
      durationMin: 120,
      avgHr: 140,
      activeCalories: null,
      distanceM: null,
    });
    const typed = run('m', {
      source: 'Manual',
      durationMin: 118,
      activeCalories: 1500,
      distanceM: 20_000,
    });
    const cap = { manualEntries: 'cap' as const, manualMinutesCap: 60 };
    expect(kcal([watch, typed], null, cap)).toBe(0);
    const [kept] = mergeChallengeDuplicates([watch, typed], {
      capManual: true,
    });
    expect(kept!.distanceM).toBeNull();
    // Counted in full, the typed-in figures fill in as before
    expect(kcal([watch, typed], null)).toBe(1500);
    expect(mergeChallengeDuplicates([watch, typed])[0]!.distanceM).toBe(20_000);
  });

  it("a daily total's override counts in full only, then the larger of it and the workouts", () => {
    const daily = (manualEntries: 'count' | 'cap') =>
      scoreChallengeDays(
        {
          entries: [run('r')],
          steps: {},
          // The device synced 600; the member set 400 in the Diary
          dailyCalories: [
            { ...total('t', 400), caloriesEstimate: 600 } as ChallengeEntry,
          ],
          zones,
        },
        day,
        day,
        rulesWith({ metric: 'active_calories', activities: { manualEntries } })
      )[0]!.total;
    expect(daily('count')).toBe(400);
    expect(daily('cap')).toBe(600);
  });

  it('an override changes calories only: workouts and their minutes stay', () => {
    const days = (entries: ChallengeEntry[]) =>
      scoreChallengeDays(
        { entries, steps: {}, zones },
        day,
        day,
        rulesWith({ metric: 'active_calories' })
      )[0]!;
    const plain = days([run('r')]);
    const changed = days([overridden('r', 0)]);
    expect(changed.workouts).toBe(plain.workouts);
    expect(changed.minutes).toBe(plain.minutes);
    expect(changed.total).toBe(0);
  });

  it('a daily total posted to /health-data without a source is typed in, as a sourceless workout is', () => {
    // /health-data stores a post with no source as 'manual'; manual is decided
    // by the source alone, so a challenge can't tell it from a typed-in total
    const posted = total('p', 2500, 'manual');
    const with_ = (manualEntries: 'count' | 'cap' | 'ignore') =>
      challengeDailyCalories(
        [posted],
        rulesWith({ metric: 'active_calories', activities: { manualEntries } })
      ).get(day) ?? 0;
    expect(with_('count')).toBe(2500);
    expect(with_('cap')).toBe(0);
    expect(with_('ignore')).toBe(0);
    expect(isManualEntry(posted)).toBe(
      isManualEntry(run('w', { source: 'manual' }))
    );
  });

  it('only an active-calories challenge reads the daily totals', () => {
    expect(
      challengeDailyCalories(
        [total('t', 600)],
        rulesWith({ metric: 'active_minutes' })
      ).size
    ).toBe(0);
  });
});
