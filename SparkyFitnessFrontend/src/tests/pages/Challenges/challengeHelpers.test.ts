import type { TFunction } from 'i18next';
import {
  challengePreset,
  challengeRulesSchema,
  challengesForCard,
  challengeStateNow,
  parseChallengeInviteCode,
  type ChallengeRules,
  type ChallengeStandingsResponse,
  type ChallengeSummary,
} from '@workspace/shared';
import {
  actionErrorText,
  changedRuleLines,
  createErrorText,
  defaultDailyCap,
  daysText,
  joinErrorText,
  metricValueText,
  pointsExample,
  ruleLines,
  standingsSummary,
  targetFromInput,
  targetToInput,
  type MetricUnits,
} from '@/pages/Challenges/challengeCopy';
import {
  PENDING_INVITE_MAX_AGE_MS,
  challengeInviteLink,
  clearPendingInvite,
  rememberPendingInvite,
  takePendingInvite,
} from '@/pages/Challenges/challengeLinks';
import {
  nextPeriodDay,
  pointsWithoutDailyGoal,
  previousPeriodDay,
  recentPeriodStarts,
} from '@/pages/Challenges/challengePeriods';
import { translateForTest } from '@/tests/mocks/reactI18next';

const t = translateForTest as unknown as TFunction;
const km: MetricUnits = {
  distanceUnit: 'km',
  energyUnit: 'kcal',
  energyLabel: 'kcal',
};
const miles: MetricUnits = {
  distanceUnit: 'miles',
  energyUnit: 'kJ',
  energyLabel: 'kJ',
};
const CODE = 'AbCdEfGhIjKlMnOpQrStUv';

const allRounder = challengePreset('all_rounder').rules;
const rules = (over: Partial<ChallengeRules>): ChallengeRules =>
  challengeRulesSchema.parse({ ...allRounder, ...over });

describe('How points work', () => {
  it('words the All-Rounder rules with the numbers from the rules', () => {
    const text = ruleLines(t, allRounder, km).map((l) => l.text);
    expect(text).toContain(
      'Effort, by your own heart-rate zones: 1 / 1 / 2 / 2 / 2 points a minute in zones 1 to 5.'
    );
    expect(text).toContain('Steps: 1 point per 1,000, up to 10 a day.');
    expect(text).toContain('Streak: +5 a day from day 3 in a row.');
    expect(text).toContain(
      'Up to 60 minutes a day count in full, highest-rate minutes first; the next 30 count at 50%, the rest not at all.'
    );
    expect(text).toContain('Only your best 5 days of each week count.');
  });

  it('leaves out a part the host turned off and shows a changed number', () => {
    const changed = rules({
      points: {
        ...allRounder.points!,
        streak: null,
        steps: { stepsPerPoint: 500, dailyCap: 20 },
      },
    });
    const text = ruleLines(t, changed, km).map((l) => l.text);
    expect(text.some((l) => l.startsWith('Streak'))).toBe(false);
    expect(text).toContain('Steps: 1 point per 500, up to 20 a day.');
  });

  it('works the example day out with the shared scorer', () => {
    // 45 minutes in zone 3 at 2 a minute, all inside the first 60 full
    // minutes, plus 8,000 steps at 1 per 1,000.
    expect(pointsExample(allRounder)).toEqual({
      workoutMinutes: 45,
      zone: 3,
      steps: 8000,
      effort: 90,
      stepPoints: 8,
      uncapped: 98,
      total: 98,
    });
    const tiered = rules({
      points: {
        ...allRounder.points!,
        minuteTiers: { full: 30, half: 30, halfRate: 0.5 },
      },
    });
    // 30 full minutes at 2, then 15 at half rate.
    expect(pointsExample(tiered)?.effort).toBe(75);
    expect(pointsExample(challengePreset('workweek_hustle').rules)).toBeNull();
  });

  it('lengthens the example workout to the shortest one that counts', () => {
    const long = rules({
      activities: { ...allRounder.activities, minMinutes: 60 },
    });
    expect(pointsExample(long)?.workoutMinutes).toBe(60);
  });

  it('names the kinds of personal record that count when not all do', () => {
    const liftOnly = rules({
      points: {
        ...allRounder.points!,
        pr: { ...allRounder.points!.pr!, types: ['lift'] },
      },
    });
    expect(ruleLines(t, liftOnly, km).map((l) => l.text)).toContain(
      'Personal records (lifts only): +15 each, at most 2 a day.'
    );
    expect(changedRuleLines(t, allRounder, liftOnly, km)).toContain(
      'Personal records (lifts only): +15 each, at most 2 a day.'
    );
  });

  it("holds the example day to the challenge's daily cap", () => {
    const capped = pointsExample(rules({ dailyCap: 1 }));
    expect(capped?.uncapped).toBe(98);
    expect(capped?.total).toBe(1);
  });

  it('describes race and group-goal targets in the metric unit', () => {
    const race = challengePreset('race_to_100k_steps').rules;
    expect(ruleLines(t, race, km).map((l) => l.text)).toContain(
      'The first to reach 100,000 steps wins; later finishers rank by the day they got there.'
    );
    const group = rules({
      metric: 'distance',
      format: 'group_goal',
      target: 100000,
      points: null,
    });
    expect(ruleLines(t, group, km).map((l) => l.text)).toContain(
      'Everyone adds to one total; the group wins at 100 km.'
    );
  });

  it('lists what changed between two versions of the rules', () => {
    const next = rules({ bestDaysPerWeek: 4 });
    expect(changedRuleLines(t, allRounder, next, km)).toEqual([
      'Only your best 4 days of each week count.',
    ]);
    const noBest = rules({ bestDaysPerWeek: null });
    expect(changedRuleLines(t, allRounder, noBest, km)).toEqual([
      'No longer: Only your best 5 days of each week count.',
    ]);
    expect(changedRuleLines(t, null, next, km)).toEqual([]);
  });
});

describe('amounts in the person own units', () => {
  it('shows distance in km or miles and energy in their unit', () => {
    expect(metricValueText(t, 'distance', 5000, km, 'en')).toBe('5 km');
    expect(metricValueText(t, 'distance', 5000, miles, 'en')).toBe('3.1 mi');
    expect(metricValueText(t, 'active_calories', 100, miles, 'en')).toBe(
      '418 kJ'
    );
    expect(metricValueText(t, 'points', 98.25, km, 'en')).toBe('98.3 pts');
    expect(metricValueText(t, 'workout_days', 1, km, 'en')).toBe('1 day');
  });

  it('turns a typed target into the stored unit and back', () => {
    expect(targetFromInput('distance', 10, km)).toBe(10000);
    expect(targetToInput('distance', 10000, km)).toBe(10);
    expect(
      targetToInput('distance', targetFromInput('distance', 26.2, miles), miles)
    ).toBe(26.2);
    expect(targetFromInput('steps', 5000, km)).toBe(5000);
    // kcal as stored, kJ as a whole number (utils/energyInput).
    expect(targetToInput('active_calories', 250.5, km)).toBe(250.5);
    expect(
      targetToInput('active_calories', 250, { ...km, energyUnit: 'kJ' })
    ).toBe(1046);
  });

  it('names the counted days', () => {
    expect(daysText(t, [1, 2, 3, 4, 5])).toBe('Mon to Fri');
    expect(daysText(t, [6, 7])).toBe('Sat, Sun');
    expect(daysText(t, [1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  });
});

describe('invite links', () => {
  it('puts the code in the fragment and reads it back from what is pasted', () => {
    const link = challengeInviteLink('https://fit.example', CODE);
    expect(link).toBe(`https://fit.example/challenges/join#${CODE}`);
    expect(parseChallengeInviteCode(link)).toBe(CODE);
  });

  it('says why a join failed from the server code', () => {
    expect(joinErrorText(t, 'CHALLENGE_FULL')).toBe('This challenge is full.');
    expect(joinErrorText(t, 'CHALLENGE_INVITE_INVALID')).toMatch(/not valid/);
    expect(joinErrorText(t, undefined)).toBe('Could not join. Try again.');
  });

  it('says why a new challenge was refused from the server code', () => {
    expect(createErrorText(t, 'CHALLENGE_INVALID_DATES')).toBe(
      'A challenge can start at most 31 days ago and at most 365 days from today, and lasts at most 365 days.'
    );
    expect(createErrorText(t, 'CHALLENGE_RATE_LIMITED')).toMatch(/Wait a few/);
    expect(createErrorText(t, undefined)).toMatch(/Could not create/);
  });

  it('says why a rules change, invite or leave was refused, in its own words', () => {
    expect(actionErrorText(t, 'CHALLENGE_ENDED')).toBe(
      'This challenge has ended.'
    );
    expect(actionErrorText(t, 'CHALLENGE_HOST_ONLY')).toMatch(/Only the host/);
    expect(actionErrorText(t, 'CHALLENGE_NO_PERIOD_LEFT')).toMatch(
      /No period is left/
    );
    expect(actionErrorText(t, 'CHALLENGE_RATE_LIMITED')).toMatch(/Wait a few/);
    expect(actionErrorText(t, undefined)).toBe(
      'That did not go through. Try again.'
    );
  });
});

describe('daily cap', () => {
  it('starts at a big day in the metric own unit, never 100 steps', () => {
    expect(defaultDailyCap('steps')).toBe(20000);
    expect(defaultDailyCap('distance')).toBe(20000);
    expect(defaultDailyCap('workout_days')).toBe(1);
    for (const metric of [
      'points',
      'steps',
      'active_minutes',
      'hr_zone_minutes',
      'distance',
      'workout_days',
      'active_calories',
      'elevation',
    ] as const) {
      const rules = { ...challengePreset('all_rounder').rules, metric };
      expect(
        challengeRulesSchema.safeParse({
          ...rules,
          dailyCap: defaultDailyCap(metric),
        }).success
      ).toBe(true);
    }
  });
});

describe('periods', () => {
  it('steps between periods without leaving the challenge or passing today', () => {
    expect(previousPeriodDay('2026-11-09', '2026-11-02')).toBe('2026-11-08');
    expect(previousPeriodDay('2026-11-02', '2026-11-02')).toBeNull();
    expect(nextPeriodDay('2026-11-08', null, '2026-11-14')).toBe('2026-11-09');
    expect(nextPeriodDay('2026-11-15', null, '2026-11-14')).toBeNull();
    expect(nextPeriodDay('2026-11-08', '2026-11-08', '2026-11-14')).toBeNull();
  });

  it('turns the weekly goal off for a daily period, which the rules refuse', () => {
    const points = challengePreset('all_rounder').rules.points!;
    // Picking a daily period on All-Rounder
    const daily = pointsWithoutDailyGoal(points, 'day');
    expect(daily!.goal).toBeNull();
    expect(
      challengeRulesSchema.safeParse({
        ...challengePreset('all_rounder').rules,
        period: 'day',
        points: daily,
      }).success
    ).toBe(true);
    // Weekly and longer keep it; no builder stays none
    expect(pointsWithoutDailyGoal(points, 'week')).toBe(points);
    expect(pointsWithoutDailyGoal(null, 'day')).toBeNull();
  });

  it('lists the starts of a member recent weeks, newest first', () => {
    expect(
      recentPeriodStarts('week', '2026-10-19', null, '2026-11-11', 7)
    ).toEqual(['2026-11-09', '2026-11-02', '2026-10-26', '2026-10-19']);
    expect(
      recentPeriodStarts('day', '2026-11-01', null, '2026-11-14', 3)
    ).toEqual(['2026-11-14', '2026-11-13', '2026-11-12']);
    expect(
      recentPeriodStarts('week', '2026-12-01', null, '2026-11-14', 3)
    ).toEqual([]);
  });
});

describe('the Diary card', () => {
  const summary = (
    id: string,
    start_date: string,
    ended_at: string | null = null,
    time_zone = 'UTC',
    end_date: string | null = null
  ) => ({ id, start_date, end_date, ended_at, time_zone }) as ChallengeSummary;
  const now = new Date('2026-11-16T12:00:00Z');

  it('shows only challenges not ended, newest first, at most two', () => {
    const list = [
      summary('old', '2026-10-01'),
      summary('done', '2026-11-10', '2026-11-12T00:00:00Z'),
      summary('new', '2026-11-09'),
    ];
    expect(challengesForCard(list, 2, now).map((c) => c.id)).toEqual([
      'new',
      'old',
    ]);
  });

  it('keeps a running challenge ahead of scheduled ones', () => {
    const list = [
      summary('next-month', '2026-12-01'),
      summary('running', '2026-11-02'),
      summary('next-week', '2026-11-23'),
    ];
    expect(challengesForCard(list, 2, now).map((c) => c.id)).toEqual([
      'running',
      'next-month',
    ]);
    // Started today in its own zone, though not yet in UTC.
    const ahead = summary('kiribati', '2026-11-17', null, 'Pacific/Kiritimati');
    expect(
      challengesForCard([list[0]!, ahead], 2, now).map((c) => c.id)
    ).toEqual(['kiribati', 'next-month']);
  });

  it('drops a challenge whose end date has passed in its own zone', () => {
    // Ended yesterday (11-15) in UTC; the server has not closed it yet.
    const over = summary('over', '2026-11-02', null, 'UTC', '2026-11-15');
    // Still 11-16 in Honolulu at 02:00 there, though its end date was 11-16.
    const lastDay = summary(
      'last-day',
      '2026-11-01',
      null,
      'Pacific/Honolulu',
      '2026-11-16'
    );
    const at = new Date('2026-11-16T12:00:00Z');
    expect(challengesForCard([over, lastDay], 2, at).map((c) => c.id)).toEqual([
      'last-day',
    ]);
    expect(challengeStateNow(over, at)).toBe('ended');
    expect(challengeStateNow(lastDay, at)).toBe('running');
  });

  it('a time zone the browser does not know does not break the card', () => {
    const odd = summary('odd', '2026-11-02', null, 'Not/AZone');
    expect(
      challengesForCard([summary('later', '2026-12-01'), odd], 2, now).map(
        (c) => c.id
      )
    ).toEqual(['odd', 'later']);
    const oddOver = summary(
      'odd-over',
      '2026-11-02',
      null,
      'Not/AZone',
      '2026-11-01'
    );
    expect(() => challengesForCard([oddOver], 2, now)).not.toThrow();
    expect(challengesForCard([oddOver], 2, now)).toEqual([]);
  });
});

describe('an invite kept across sign-in', () => {
  const code = 'AAAAAAAAAAAAAAAAAAAAAA';
  const t0 = Date.parse('2026-11-16T12:00:00Z');
  afterEach(() => sessionStorage.clear());

  it('is handed over once, while fresh', () => {
    rememberPendingInvite(`#${code}`, t0);
    expect(takePendingInvite(t0 + 60_000)).toBe(code);
    expect(takePendingInvite(t0 + 60_000)).toBeNull();
  });

  it('is dropped once stale or after sign-out, so a later sign-in in the tab does not get it', () => {
    rememberPendingInvite(`#${code}`, t0);
    expect(takePendingInvite(t0 + PENDING_INVITE_MAX_AGE_MS + 1)).toBeNull();
    rememberPendingInvite(`#${code}`, t0);
    clearPendingInvite();
    expect(takePendingInvite(t0 + 1)).toBeNull();
  });
});

describe('standings summary (Diary card)', () => {
  type Row = ChallengeStandingsResponse['rows'][number];
  const row = (over: Partial<Row>): Row => ({
    user_id: 'u',
    display_name: 'Someone',
    rank: 1,
    total: 0,
    minutes: 0,
    winner: false,
    reached_on: null,
    ...over,
  });
  const pts = (n: number) => `${n} pts`;

  it('gives your place and who leads, from rank and the me flag', () => {
    const rows = [
      row({ user_id: 'b', display_name: 'Test B', rank: 1, total: 340 }),
      row({
        user_id: 'a',
        display_name: 'Test A',
        rank: 2,
        total: 295,
        me: true,
      }),
    ];
    expect(standingsSummary(t, rows, pts)).toEqual({
      place: '#2 of 2 · 295 pts',
      leader: 'Test B leads with 340 pts',
    });
  });

  it('says you lead, or share the lead with a tied racer', () => {
    const lead = [
      row({ user_id: 'a', rank: 1, total: 340, me: true }),
      row({ user_id: 'b', rank: 2, total: 295 }),
    ];
    expect(standingsSummary(t, lead, pts).leader).toBe('You lead');
    const tied = [
      row({ user_id: 'a', rank: 1, total: 100, me: true }),
      row({ user_id: 'b', rank: 1, total: 100 }),
    ];
    expect(standingsSummary(t, tied, pts).leader).toBe('You share the lead');
  });

  it('names no leader while everyone is still on 0', () => {
    const rows = [
      row({ user_id: 'a', rank: 1, total: 0, me: true }),
      row({ user_id: 'b', rank: 1, total: 0 }),
    ];
    expect(standingsSummary(t, rows, pts).leader).toBeNull();
  });

  it('names the leader even before you have a score', () => {
    const rows = [row({ display_name: 'Test B', rank: 1, total: 340 })];
    expect(standingsSummary(t, rows, pts)).toEqual({
      place: 'No score yet',
      leader: 'Test B leads with 340 pts',
    });
  });
});
