import type { TFunction } from 'i18next';
import {
  CHALLENGE_MAX_BACKDATE_DAYS,
  CHALLENGE_MAX_LENGTH_DAYS,
  CHALLENGE_MAX_START_AHEAD_DAYS,
  CHALLENGE_PR_TYPES,
  challengeDayEffort,
  challengeStepPoints,
  energyFromKcal,
  challengeLeaders,
  challengeToday,
  leadsChallenge,
  ownChallengeStanding,
  type EnergyUnit,
  type ActivitySport,
  type ChallengeFormat,
  type ChallengeGoalType,
  type ChallengeStandingsResponse,
  type ChallengeSummary,
  type ChallengeManualEntryMode,
  type ChallengeMetric,
  type ChallengePeriod,
  type ChallengePrType,
  type ChallengePresetId,
  type ChallengeRules,
} from '@workspace/shared';
import { kcalFromEnergyInput, shownEnergyInput } from '@/utils/energyInput';

type DistanceUnit = 'km' | 'miles';

/**
 * Wording for Challenges. Every number comes from the challenge's own rules
 * (the shared schema's defaults until the host changes them) and every
 * example is worked out by the shared scorer, so the page explains exactly
 * what the server counts.
 */

export function presetName(t: TFunction, id: ChallengePresetId): string {
  switch (id) {
    case 'all_rounder':
      return t('challenges.presets.all_rounder.name', 'All-Rounder');
    case 'workweek_hustle':
      return t('challenges.presets.workweek_hustle.name', 'Workweek Hustle');
    case 'weekend_warrior':
      return t('challenges.presets.weekend_warrior.name', 'Weekend Warrior');
    case 'daily_showdown':
      return t('challenges.presets.daily_showdown.name', 'Daily Showdown');
    case 'race_to_100k_steps':
      return t(
        'challenges.presets.race_to_100k_steps.name',
        'Race to 100k steps'
      );
    case 'most_km_this_month':
      return t(
        'challenges.presets.most_km_this_month.name',
        'Most km this month'
      );
    case 'consistency_30_day':
      return t(
        'challenges.presets.consistency_30_day.name',
        '30-day consistency'
      );
  }
}

export function presetDescription(t: TFunction, id: ChallengePresetId): string {
  switch (id) {
    case 'all_rounder':
      return t(
        'challenges.presets.all_rounder.description',
        'Points for effort by heart rate, steps, PRs and streaks. Weekly, best 5 days count.'
      );
    case 'workweek_hustle':
      return t(
        'challenges.presets.workweek_hustle.description',
        'Most steps Monday to Friday.'
      );
    case 'weekend_warrior':
      return t(
        'challenges.presets.weekend_warrior.description',
        'Most steps on Saturday and Sunday.'
      );
    case 'daily_showdown':
      return t(
        'challenges.presets.daily_showdown.description',
        'Most steps in one day.'
      );
    case 'race_to_100k_steps':
      return t(
        'challenges.presets.race_to_100k_steps.description',
        'The first to reach 100,000 steps wins.'
      );
    case 'most_km_this_month':
      return t(
        'challenges.presets.most_km_this_month.description',
        'Most distance in a calendar month.'
      );
    case 'consistency_30_day':
      return t(
        'challenges.presets.consistency_30_day.description',
        'Most days with a workout of 20 minutes or more, over 30 days.'
      );
  }
}

export function metricLabel(t: TFunction, metric: ChallengeMetric): string {
  switch (metric) {
    case 'points':
      return t('challenges.metrics.points', 'Points');
    case 'steps':
      return t('challenges.metrics.steps', 'Steps');
    case 'active_minutes':
      return t('challenges.metrics.active_minutes', 'Active minutes');
    case 'hr_zone_minutes':
      return t('challenges.metrics.hr_zone_minutes', 'Heart-rate zone minutes');
    case 'distance':
      return t('challenges.metrics.distance', 'Distance');
    case 'workout_days':
      return t('challenges.metrics.workout_days', 'Workout days');
    case 'active_calories':
      return t('challenges.metrics.active_calories', 'Active calories');
    case 'elevation':
      return t('challenges.metrics.elevation', 'Elevation gain');
  }
}

export function formatLabel(t: TFunction, format: ChallengeFormat): string {
  switch (format) {
    case 'leaderboard':
      return t('challenges.formats.leaderboard', 'Leaderboard');
    case 'race':
      return t('challenges.formats.race', 'Race to a target');
    case 'hit_goal':
      return t('challenges.formats.hit_goal', 'Hit the goal');
    case 'group_goal':
      return t('challenges.formats.group_goal', 'Group goal');
  }
}

export function periodLabel(t: TFunction, period: ChallengePeriod): string {
  switch (period) {
    case 'day':
      return t('challenges.periods.day', 'Daily');
    case 'week':
      return t('challenges.periods.week', 'Weekly');
    case 'month':
      return t('challenges.periods.month', 'Monthly');
    case 'challenge':
      return t('challenges.periods.challenge', 'Whole challenge');
  }
}

export function manualEntriesLabel(
  t: TFunction,
  mode: ChallengeManualEntryMode
): string {
  switch (mode) {
    case 'count':
      return t('challenges.manualEntries.count', 'Count');
    case 'cap':
      return t('challenges.manualEntries.cap', 'Count up to a cap');
    case 'ignore':
      return t('challenges.manualEntries.ignore', 'Ignore');
  }
}

/** A kind of personal record, for the rule lines. */
export function prTypeLabel(t: TFunction, type: ChallengePrType): string {
  switch (type) {
    case 'lift':
      return t('challenges.prTypes.lift', 'lifts');
    case 'distance':
      return t('challenges.prTypes.distance', 'distance');
    case 'pace':
      return t('challenges.prTypes.pace', 'pace');
  }
}

export function sportLabel(t: TFunction, sport: ActivitySport): string {
  switch (sport) {
    case 'running':
      return t('challenges.sports.running', 'Running');
    case 'cycling':
      return t('challenges.sports.cycling', 'Cycling');
    case 'walking':
      return t('challenges.sports.walking', 'Walking');
    case 'hiking':
      return t('challenges.sports.hiking', 'Hiking');
    case 'swimming':
      return t('challenges.sports.swimming', 'Swimming');
    case 'rowing':
      return t('challenges.sports.rowing', 'Rowing');
    case 'fitness_equipment':
      return t('challenges.sports.fitness_equipment', 'Gym machines');
    case 'strength':
      return t('challenges.sports.strength', 'Strength');
    case 'other':
      return t('challenges.sports.other', 'Other');
  }
}

/** Short weekday names, ISO order (1 = Monday). */
export function weekdayLabel(t: TFunction, isoDay: number): string {
  const names = [
    t('challenges.weekdays.mon', 'Mon'),
    t('challenges.weekdays.tue', 'Tue'),
    t('challenges.weekdays.wed', 'Wed'),
    t('challenges.weekdays.thu', 'Thu'),
    t('challenges.weekdays.fri', 'Fri'),
    t('challenges.weekdays.sat', 'Sat'),
    t('challenges.weekdays.sun', 'Sun'),
  ];
  return names[isoDay - 1] ?? String(isoDay);
}

export interface MetricUnits {
  distanceUnit: DistanceUnit;
  energyUnit: EnergyUnit;
  /** The energy unit's label ("kcal" or "kJ"). */
  energyLabel: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A metric amount for display, in the person's own units (distance is stored in metres). */
export function metricValueText(
  t: TFunction,
  metric: ChallengeMetric,
  value: number,
  units: MetricUnits,
  locale?: string
): string {
  const fmt = (n: number, digits = 0) =>
    n.toLocaleString(locale, { maximumFractionDigits: digits });
  switch (metric) {
    case 'points':
      return t('challenges.values.points', '{{value}} pts', {
        value: fmt(round1(value), 1),
      });
    case 'steps':
      return t('challenges.values.steps', '{{value}} steps', {
        value: fmt(Math.round(value)),
      });
    case 'active_minutes':
    case 'hr_zone_minutes':
      return t('challenges.values.minutes', '{{value}} min', {
        value: fmt(Math.round(value)),
      });
    case 'distance': {
      const shown = shownDistance(value, units.distanceUnit);
      return units.distanceUnit === 'miles'
        ? t('challenges.values.miles', '{{value}} mi', {
            value: fmt(shown, 1),
          })
        : t('challenges.values.km', '{{value}} km', { value: fmt(shown, 1) });
    }
    case 'workout_days':
      return t('challenges.values.days', '{{count}} days', {
        count: Math.round(value),
        defaultValue_one: '{{count}} day',
        defaultValue_other: '{{count}} days',
      });
    case 'active_calories':
      return `${fmt(Math.round(energyFromKcal(value, units.energyUnit)))} ${units.energyLabel}`;
    case 'elevation':
      return t('challenges.values.metres', '{{value}} m', {
        value: fmt(Math.round(value)),
      });
  }
}

const METRES_PER_MILE = 1609.344;

/** Metres in the person's distance unit. */
const shownDistance = (metres: number, unit: DistanceUnit) =>
  unit === 'miles' ? metres / METRES_PER_MILE : metres / 1000;

/**
 * A stored target or daily cap as the number the host types: distance in
 * km or miles (stored in metres), energy in the account's unit (stored in
 * kcal), anything else in the metric's own unit.
 */
export function targetToInput(
  metric: ChallengeMetric,
  stored: number,
  units: MetricUnits
): number {
  if (metric === 'distance')
    return round1(shownDistance(stored, units.distanceUnit));
  if (metric === 'active_calories')
    return Number(shownEnergyInput(stored, units.energyUnit));
  return stored;
}

export function targetFromInput(
  metric: ChallengeMetric,
  typed: number,
  units: MetricUnits
): number {
  if (metric === 'distance')
    return units.distanceUnit === 'miles'
      ? typed * METRES_PER_MILE
      : typed * 1000;
  if (metric === 'active_calories')
    return Number(kcalFromEnergyInput(typed, units.energyUnit));
  return typed;
}

/** The unit a target or cap is typed in, for the field's label. */
export function targetUnitLabel(
  t: TFunction,
  metric: ChallengeMetric,
  units: MetricUnits
): string {
  switch (metric) {
    case 'points':
      return t('challenges.units.points', 'points');
    case 'steps':
      return t('challenges.units.steps', 'steps');
    case 'active_minutes':
    case 'hr_zone_minutes':
      return t('challenges.units.minutes', 'minutes');
    case 'distance':
      return units.distanceUnit === 'miles'
        ? t('challenges.units.miles', 'miles')
        : t('challenges.units.km', 'km');
    case 'workout_days':
      return t('challenges.units.days', 'days');
    case 'active_calories':
      return units.energyLabel;
    case 'elevation':
      return t('challenges.units.metres', 'metres');
  }
}

/** "Mon to Fri", "Sat, Sun" or "Every day". */
export function daysText(t: TFunction, days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return t('challenges.rules.everyDay', 'Every day');
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const consecutive =
    first !== undefined &&
    last !== undefined &&
    sorted.length >= 3 &&
    last - first === sorted.length - 1;
  if (consecutive) {
    return t('challenges.rules.dayRange', '{{from}} to {{to}}', {
      from: weekdayLabel(t, first),
      to: weekdayLabel(t, last),
    });
  }
  return sorted.map((d) => weekdayLabel(t, d)).join(', ');
}

/** One rule, as a line of "How points work". */
export interface RuleLine {
  key: string;
  text: string;
}

/** The challenge's rules as plain sentences, numbers from the rules themselves. */
export function ruleLines(
  t: TFunction,
  rules: ChallengeRules,
  units: MetricUnits
): RuleLine[] {
  const lines: RuleLine[] = [];
  const value = (n: number) => metricValueText(t, rules.metric, n, units);

  lines.push({
    key: 'what',
    text: t(
      'challenges.how.what',
      '{{format}} of {{metric}}, scored {{period}}.',
      {
        format: formatLabel(t, rules.format),
        metric: metricLabel(t, rules.metric).toLowerCase(),
        period: periodLabel(t, rules.period).toLowerCase(),
      }
    ),
  });

  if (rules.target !== null) {
    const target = value(rules.target);
    let text: string;
    switch (rules.format) {
      case 'race':
        text = t(
          'challenges.how.race',
          'The first to reach {{target}} wins; later finishers rank by the day they got there.',
          { target }
        );
        break;
      case 'hit_goal':
        text =
          rules.targetPer === 'day'
            ? t(
                'challenges.how.hitGoalDay',
                'Everyone who reaches {{target}} on every counted day wins.',
                { target }
              )
            : t(
                'challenges.how.hitGoalPeriod',
                'Everyone who reaches {{target}} in the period wins.',
                { target }
              );
        break;
      case 'group_goal':
        text = t(
          'challenges.how.groupGoal',
          'Everyone adds to one total; the group wins at {{target}}.',
          { target }
        );
        break;
      default:
        text = t('challenges.how.target', 'Target: {{target}}.', { target });
    }
    lines.push({ key: 'target', text });
  } else {
    lines.push({
      key: 'target',
      text: t('challenges.how.leaderboard', 'The highest total wins.'),
    });
  }

  lines.push({
    key: 'days',
    text: t('challenges.how.days', 'Days that count: {{days}}.', {
      days: daysText(t, rules.days),
    }),
  });
  if (rules.timeWindow) {
    lines.push({
      key: 'window',
      text: t(
        'challenges.how.window',
        'Only workouts starting between {{start}} and {{end}} count.',
        rules.timeWindow
      ),
    });
  }
  if (rules.bestDaysPerWeek !== null) {
    lines.push({
      key: 'bestDays',
      text: t(
        'challenges.how.bestDays',
        'Only your best {{count}} days of each week count.',
        { count: rules.bestDaysPerWeek }
      ),
    });
  }
  if (rules.dailyCap !== null) {
    lines.push({
      key: 'dailyCap',
      text: t('challenges.how.dailyCap', 'A day adds at most {{cap}}.', {
        cap: value(rules.dailyCap),
      }),
    });
  }
  if (rules.metric === 'hr_zone_minutes') {
    lines.push({
      key: 'zoneFrom',
      text: t(
        'challenges.how.zoneFrom',
        'Minutes in heart-rate zone {{zone}} and above count, using your own zones.',
        { zone: rules.zoneMinutesFromZone }
      ),
    });
  }

  const p = rules.points;
  if (rules.metric === 'points' && p) {
    lines.push({
      key: 'zones',
      text: t(
        'challenges.how.zones',
        'Effort, by your own heart-rate zones: {{rates}} points a minute in zones 1 to 5.',
        { rates: p.zoneRates.join(' / ') }
      ),
    });
    lines.push({
      key: 'noHr',
      text: t(
        'challenges.how.noHr',
        'Below zone 1: {{below}} a minute. No heart rate at all: {{none}} a minute.',
        { below: p.belowZoneRate, none: p.noHrRate }
      ),
    });
    if (p.strengthFloor !== null) {
      lines.push({
        key: 'strength',
        text: t(
          'challenges.how.strength',
          'Lifting earns at least {{rate}} a minute, since rest between sets lowers heart rate.',
          { rate: p.strengthFloor }
        ),
      });
    }
    if (p.minuteTiers) {
      lines.push({
        key: 'tiers',
        text:
          p.minuteTiers.half > 0
            ? t(
                'challenges.how.tiers',
                'Up to {{full}} minutes a day count in full, highest-rate minutes first; the next {{half}} count at {{pct}}%, the rest not at all.',
                {
                  full: p.minuteTiers.full,
                  half: p.minuteTiers.half,
                  pct: Math.round(p.minuteTiers.halfRate * 100),
                }
              )
            : t(
                'challenges.how.tiersFullOnly',
                'Up to {{full}} minutes a day count, highest-rate minutes first; the rest do not.',
                { full: p.minuteTiers.full }
              ),
      });
    }
    if (p.steps) {
      lines.push({
        key: 'steps',
        text: t(
          'challenges.how.steps',
          'Steps: 1 point per {{per}}, up to {{cap}} a day.',
          {
            per: p.steps.stepsPerPoint.toLocaleString(),
            cap: p.steps.dailyCap,
          }
        ),
      });
    }
    if (p.pr) {
      const allTypes = CHALLENGE_PR_TYPES.every((type) =>
        p.pr?.types.includes(type)
      );
      lines.push({
        key: 'pr',
        text: allTypes
          ? t(
              'challenges.how.pr',
              'Personal records: +{{bonus}} each, at most {{max}} a day.',
              { bonus: p.pr.bonus, max: p.pr.dailyMax }
            )
          : t(
              'challenges.how.prSome',
              'Personal records ({{types}} only): +{{bonus}} each, at most {{max}} a day.',
              {
                types: p.pr.types
                  .map((type) => prTypeLabel(t, type))
                  .join(', '),
                bonus: p.pr.bonus,
                max: p.pr.dailyMax,
              }
            ),
      });
    }
    if (p.streak) {
      lines.push({
        key: 'streak',
        text: t(
          'challenges.how.streak',
          'Streak: +{{bonus}} a day from day {{from}} in a row.',
          { bonus: p.streak.bonus, from: p.streak.fromDay }
        ),
      });
    }
    if (p.beatAverage) {
      lines.push({
        key: 'beatAverage',
        text: t(
          'challenges.how.beatAverage',
          'Beat your own {{days}}-day average: +{{bonus}}.',
          { bonus: p.beatAverage.bonus, days: p.beatAverage.lookbackDays }
        ),
      });
    }
    if (p.goal) {
      lines.push({
        key: 'goal',
        text: t(
          'challenges.how.goal',
          'Your own weekly goal ({{pct}}% above your last {{weeks}} weeks): up to +{{max}}, paid in part for part of it.',
          {
            pct: p.goal.stretchPct,
            weeks: p.goal.lookbackWeeks,
            max: p.goal.maxBonus,
          }
        ),
      });
    }
  }

  const a = rules.activities;
  if (a.includeSports) {
    lines.push({
      key: 'include',
      text: t('challenges.how.include', 'Only these count: {{sports}}.', {
        sports: a.includeSports.map((s) => sportLabel(t, s)).join(', '),
      }),
    });
  }
  if (a.excludeSports.length) {
    lines.push({
      key: 'exclude',
      text: t('challenges.how.exclude', 'Left out: {{sports}}.', {
        sports: a.excludeSports.map((s) => sportLabel(t, s)).join(', '),
      }),
    });
  }
  if (a.minMinutes > 0) {
    lines.push({
      key: 'minMinutes',
      text: t(
        'challenges.how.minMinutes',
        'Workouts shorter than {{minutes}} minutes do not count.',
        { minutes: a.minMinutes }
      ),
    });
  }
  if (a.manualEntries === 'ignore') {
    lines.push({
      key: 'manual',
      text: t(
        'challenges.how.manualIgnore',
        'Workouts logged by hand do not count.'
      ),
    });
  } else if (a.manualEntries === 'cap') {
    lines.push({
      key: 'manual',
      text: t(
        'challenges.how.manualCap',
        'Workouts logged by hand count up to {{minutes}} minutes a day.',
        { minutes: a.manualMinutesCap }
      ),
    });
  }
  if (a.mergeDuplicates) {
    lines.push({
      key: 'merge',
      text: t(
        'challenges.how.merge',
        'A workout synced from two sources counts once.'
      ),
    });
  }
  return lines;
}

export interface PointsExample {
  workoutMinutes: number;
  zone: number;
  steps: number;
  effort: number;
  stepPoints: number;
  /** The day's points before the challenge's daily cap. */
  uncapped: number;
  /** After the daily cap, as the day would score. */
  total: number;
}

/**
 * A worked example for the points metric, scored by the shared scorer with
 * this challenge's rules: a 45-minute workout all in zone 3 (longer if the
 * challenge's shortest counted workout is longer, so the example counts),
 * plus 8,000 steps, held to the challenge's daily cap like a real day. Null
 * for any other metric.
 */
export function pointsExample(rules: ChallengeRules): PointsExample | null {
  if (rules.metric !== 'points' || !rules.points) return null;
  const workoutMinutes = Math.max(45, Math.ceil(rules.activities.minMinutes));
  const zone = 3;
  const steps = 8000;
  const zoneSeconds = [0, 0, 0, 0, 0];
  zoneSeconds[zone - 1] = workoutMinutes * 60;
  const day = challengeDayEffort(
    [
      {
        id: 'example',
        date: '2026-01-05',
        durationMin: workoutMinutes,
        zoneSeconds,
        category: 'Cardio',
        name: 'Run',
        source: 'example',
      },
    ],
    { maxHr: 190, floors: [95, 114, 133, 152, 171] },
    rules.points
  );
  const stepPoints = challengeStepPoints(steps, rules.points);
  const uncapped = day.effort + stepPoints;
  return {
    workoutMinutes,
    zone,
    steps,
    effort: round1(day.effort),
    stepPoints,
    uncapped: round1(uncapped),
    total: round1(
      rules.dailyCap === null ? uncapped : Math.min(uncapped, rules.dailyCap)
    ),
  };
}

/**
 * The rule lines that differ between two versions of the rules, worded with
 * the new values. Lines that appear or disappear count as changes.
 */
export function changedRuleLines(
  t: TFunction,
  previous: ChallengeRules | null,
  next: ChallengeRules,
  units: MetricUnits
): string[] {
  const after = ruleLines(t, next, units);
  if (!previous) return [];
  const before = new Map(
    ruleLines(t, previous, units).map((l) => [l.key, l.text])
  );
  const changed = after
    .filter((l) => before.get(l.key) !== l.text)
    .map((l) => l.text);
  const removedKeys = [...before.keys()].filter(
    (k) => !after.some((l) => l.key === k)
  );
  const removed = removedKeys.map((k) =>
    t('challenges.log.removed', 'No longer: {{rule}}', { rule: before.get(k) })
  );
  return [...changed, ...removed];
}

/** A member's own weekly goal type, as offered when joining. */
export function goalTypeLabel(t: TFunction, goal: ChallengeGoalType): string {
  switch (goal) {
    case 'lose_weight':
      return t(
        'challenges.goalTypes.lose_weight',
        'Lose weight (active minutes)'
      );
    case 'build_muscle':
      return t('challenges.goalTypes.build_muscle', 'Build muscle (lifting)');
    case 'endurance':
      return t('challenges.goalTypes.endurance', 'Endurance (distance)');
    case 'stay_active':
      return t(
        'challenges.goalTypes.stay_active',
        'Stay active (workout days)'
      );
  }
}

/** At most this many challenges on the card. */
const CARD_CHALLENGES_SHOWN = 2;

/**
 * The challenges the card shows: ones not ended, those already running
 * (started by today in their own time zone) before scheduled ones, newest
 * start first within each.
 */
export function challengesForCard(
  challenges: readonly ChallengeSummary[],
  now: Date = new Date()
): ChallengeSummary[] {
  const running = new Map(
    challenges.map((c) => [
      c.id,
      c.start_date <= challengeToday(c.time_zone, now),
    ])
  );
  return challenges
    .filter((c) => c.ended_at === null)
    .sort(
      (a, b) =>
        Number(running.get(b.id)) - Number(running.get(a.id)) ||
        b.start_date.localeCompare(a.start_date)
    )
    .slice(0, CARD_CHALLENGES_SHOWN);
}

type StandingRow = ChallengeStandingsResponse['rows'][number];

/**
 * The card's two lines for one challenge: your place ("#2 of 2 · 295 pts")
 * and who leads ("Test B leads with 340 pts", or "You lead").
 */
export function standingsSummary(
  t: TFunction,
  rows: readonly StandingRow[],
  formatTotal: (total: number) => string
): { place: string; leader: string | null } {
  const own = ownChallengeStanding(rows);
  const leaders = challengeLeaders(rows);
  const place = own
    ? t('challenges.widget.place', '#{{rank}} of {{members}} · {{total}}', {
        rank: own.rank,
        members: rows.length,
        total: formatTotal(own.total),
      })
    : t('challenges.widget.noScore', 'No score yet');
  const other = leaders.find((row) => !row.me);
  const leader = leadsChallenge(own)
    ? other
      ? t('challenges.widget.youShareLead', 'You share the lead')
      : t('challenges.widget.youLead', 'You lead')
    : other
      ? t('challenges.widget.leader', '{{name}} leads with {{total}}', {
          name: other.display_name,
          total: formatTotal(other.total),
        })
      : null;
  return { place, leader };
}

/** Why the server refused a new challenge, from its error code. */
export function createErrorText(
  t: TFunction,
  code: string | undefined
): string {
  switch (code) {
    case 'CHALLENGE_INVALID_DATES':
      return t(
        'challenges.create.errors.invalidDates',
        'A challenge can start at most {{back}} days ago and at most {{ahead}} days from today, and lasts at most {{length}} days.',
        {
          back: CHALLENGE_MAX_BACKDATE_DAYS,
          ahead: CHALLENGE_MAX_START_AHEAD_DAYS,
          length: CHALLENGE_MAX_LENGTH_DAYS,
        }
      );
    case 'CHALLENGE_RATE_LIMITED':
      return t(
        'challenges.create.errors.rateLimited',
        'Too many new challenges. Wait a few minutes and try again.'
      );
    default:
      return t(
        'challenges.create.errors.generic',
        'Could not create the challenge. Try again.'
      );
  }
}

/** What went wrong, from the server's error code. */
export function joinErrorText(t: TFunction, code: string | undefined): string {
  switch (code) {
    case 'CHALLENGE_INVITE_INVALID':
      return t(
        'challenges.join.errors.invalid',
        'This invite code is not valid or has expired. Ask the host for a new one.'
      );
    case 'CHALLENGE_ENDED':
      return t('challenges.join.errors.ended', 'This challenge has ended.');
    case 'CHALLENGE_LATE_JOIN_CLOSED':
      return t(
        'challenges.join.errors.lateJoinClosed',
        'This challenge has started and does not take late joiners.'
      );
    case 'CHALLENGE_FULL':
      return t('challenges.join.errors.full', 'This challenge is full.');
    case 'CHALLENGE_RATE_LIMITED':
      return t(
        'challenges.join.errors.rateLimited',
        'Too many tries. Wait a few minutes and try again.'
      );
    default:
      return t('challenges.join.errors.generic', 'Could not join. Try again.');
  }
}

/**
 * Why the server refused a rules change, an invite or a leave, from its
 * error code, in the app's own words.
 */
export function actionErrorText(
  t: TFunction,
  code: string | undefined
): string {
  switch (code) {
    case 'CHALLENGE_ENDED':
      return t('challenges.join.errors.ended', 'This challenge has ended.');
    case 'CHALLENGE_HOST_ONLY':
      return t(
        'challenges.errors.hostOnly',
        'Only the host can do this. Hosting may have passed to someone else.'
      );
    case 'CHALLENGE_NO_PERIOD_LEFT':
      return t(
        'challenges.rules.noPeriodLeft',
        'No period is left for a change to apply to.'
      );
    case 'CHALLENGE_PERIOD_LOCKED':
      return t(
        'challenges.errors.periodLocked',
        'The period cannot change once the challenge has started.'
      );
    case 'CHALLENGE_NOT_FOUND':
      return t(
        'challenges.notFound',
        'This challenge was not found, or you are not a member.'
      );
    case 'CHALLENGE_RATE_LIMITED':
      return t(
        'challenges.join.errors.rateLimited',
        'Too many tries. Wait a few minutes and try again.'
      );
    default:
      return t(
        'challenges.errors.action',
        'That did not go through. Try again.'
      );
  }
}

/**
 * Where a daily cap starts when the host turns it on, in the metric's stored
 * unit: about a big day, so it trims outliers rather than flattening the board.
 */
export function defaultDailyCap(metric: ChallengeMetric): number {
  switch (metric) {
    case 'steps':
      return 20000;
    case 'active_minutes':
    case 'hr_zone_minutes':
      return 120;
    case 'distance':
      return 20000; // metres
    case 'workout_days':
      return 1;
    case 'active_calories':
      return 1000; // kcal
    case 'elevation':
      return 1000; // metres
    case 'points':
      return 100;
  }
}
