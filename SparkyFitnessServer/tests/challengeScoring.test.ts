import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_PRESETS,
  addDays,
  challengeDayEffort,
  challengeEntryRate,
  challengeGoalType,
  challengePeriodTotal,
  challengePeriodWindow,
  challengePeriodsUpTo,
  challengePreset,
  challengeRulesEffectiveFrom,
  challengeRulesSchema,
  challengeStepPoints,
  challengeWeekGoal,
  challengeWeekStart,
  challengeWeeksIn,
  defaultPointsRules,
  isDayString,
  isStrengthEntry,
  isoWeekday,
  mergeChallengeDuplicates,
  percentMaxFloors,
  rankChallengeStandings,
  resolveHeartRateZones,
  scoreChallengeDays,
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
    expect(
      isStrengthEntry({
        id: 'x',
        date: 'x',
        durationMin: 1,
        name: 'Treadmill run',
        category: 'Strength',
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

  it('weeks starting inside a window, up to today', () => {
    expect(challengeWeeksIn('2026-11-02', '2026-11-08', '2026-11-06')).toEqual([
      '2026-11-02',
    ]);
    expect(challengeWeeksIn('2026-11-01', '2026-11-30', '2026-11-18')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
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
    expect(challengeWeekStart('2026-11-06')).toBe('2026-11-02'); // Friday -> Monday
    expect(challengeWeekStart('2026-11-08')).toBe('2026-11-02'); // Sunday -> the Monday before
    expect(challengeWeekStart('2026-11-02')).toBe('2026-11-02');
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
