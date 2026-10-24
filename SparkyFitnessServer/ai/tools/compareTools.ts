import { tool } from 'ai';
import {
  addDays,
  bedtimeClock,
  COMPARE_METRIC_KEYS,
  COMPARE_METRICS,
  COMPARE_SPAN_DAYS,
  compareDigits,
  compareDisplayValue,
  CompareModeError,
  DEFAULT_COMPARE_SPAN,
  hasActiveDays,
  compareQuerySchema,
  compareSinceQuerySchema,
  isSleepMetric,
  offeredInMode,
  SINCE_STRETCH_MIN_DAYS,
  SINCE_STRETCH_MIN_VALUES,
  todayInZone,
  type CompareMetricKey,
  type CompareResponse,
  type CompareResult,
  type CompareSinceResponse,
  type CompareSinceStretch,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import compareService from '../../services/compareService.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeActionArgs } from './dates.js';
import {
  COMPARE_TOOL_ACTIONS,
  COMPARE_TOOL_FIELDS,
  compareToolInput,
  compareToolSchema,
  type CompareToolInput,
  type CompareToolTiming,
} from './schemas/compare.js';

// The Compare report's questions for the chat and MCP: the same service and shared analysis as
// GET /api/v2/reports/compare, rendered as text the model can put into words. The wording follows
// the mobile app's (SparkyFitnessMobile/src/utils/compareCopy.ts), in English. Chat tools always
// act as the session user, so the route's owner-only rule holds here too.

const VALID_ACTIONS = [...COMPARE_TOOL_ACTIONS];

/** How far back each day (or week) is measured against, in the shared analysis. */
const OWN_NORMAL = { day: 'previous 14 days', week: 'previous 6 weeks' };

const METRIC_NAMES: Record<CompareMetricKey, string> = {
  mood: 'Mood',
  energy: 'Energy',
  focus: 'Focus',
  timeAsleep: 'Time asleep',
  sleepScore: 'Sleep score',
  overnightHrv: 'Overnight HRV',
  restingHeartRate: 'Resting heart rate',
  bedtime: 'Bedtime',
  bedtimeConsistency: 'Bedtime consistency',
  meditationMinutes: 'Meditation minutes',
  meditationSessions7d: 'Meditation sessions (7 days)',
  meditated: 'Meditated',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  caffeine: 'Caffeine',
  alcohol: 'Alcohol',
  workoutMinutes: 'Workout minutes',
  cardioMinutes: 'Cardio minutes',
  strengthVolume: 'Strength volume',
  trainingLoad: 'Training load',
  weightTrend: 'Weight trend',
  steps: 'Steps',
};

/** A yes/no habit as what was done ("the person meditated") and as a noun ("meditating"). */
const HABIT_WORDS: Partial<
  Record<CompareMetricKey, { verb: string; noun: string }>
> = {
  meditated: { verb: 'meditated', noun: 'meditating' },
};

/** Metrics named in the plural: "calories were", not "calories was". */
const PLURAL: ReadonlySet<CompareMetricKey> = new Set([
  'calories',
  'carbs',
  'meditationMinutes',
  'meditationSessions7d',
  'workoutMinutes',
  'cardioMinutes',
  'steps',
]);

/** A difference's unit where the stored one doesn't read as one: mood is spoken 1-10. */
const DIFFERENCE_UNITS: Partial<Record<CompareMetricKey, string>> = {
  mood: 'points on the 1-10 scale',
  energy: 'points on the 1-5 scale',
  focus: 'points on the 1-5 scale',
  sleepScore: 'points',
  bedtime: 'min',
};

const UNIT_DESCRIPTIONS: Record<string, string> = {
  '10-100': 'scale 1-10',
  '1-5': 'scale 1-5',
  'min-after-18:00': 'clock time',
  'yes/no': 'yes or no',
};

type Mode = 'day' | 'week';
type Timing = -1 | 0 | 1;
type Step = 'before' | 'same' | 'after';
type SleepSides = 'neither' | 'first' | 'second' | 'both';

const TIMINGS: Record<CompareToolTiming, Timing> = {
  same_day: 0,
  a_then_b: 1,
  b_then_a: -1,
};

/**
 * When the second thing is read, counted from the first, by which side is a sleep metric. A pairs
 * with B on day d + timing, and sleep is dated by the day the person woke, so a sleep metric's day
 * is the night before it.
 */
const DAY_TIMING: Record<SleepSides, Record<Step, string>> = {
  neither: {
    before: 'the day before',
    same: 'the same day',
    after: 'the next day',
  },
  first: {
    before: 'the day before',
    same: 'that day',
    after: 'the day after waking',
  },
  second: {
    before: 'two nights before',
    same: 'the night before',
    after: 'that night',
  },
  both: {
    before: 'the night before',
    same: 'the same night',
    after: 'the next night',
  },
};

function name(key: CompareMetricKey): string {
  return METRIC_NAMES[key];
}

/** "time asleep", but "HRV"-style labels keep their capitals. */
function lowerName(key: CompareMetricKey): string {
  const label = METRIC_NAMES[key];
  return /^.[A-Z]/.test(label)
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isYesNo(key: CompareMetricKey): boolean {
  return COMPARE_METRICS[key].kind === 'binary';
}

/** "was" or "were" for a metric named on its own (a yes/no habit reads as a singular noun). */
function was(key: CompareMetricKey): string {
  return PLURAL.has(key) ? 'were' : 'was';
}

function habitVerb(key: CompareMetricKey): string {
  return HABIT_WORDS[key]?.verb ?? `logged ${lowerName(key)}`;
}

function habitNoun(key: CompareMetricKey): string {
  return HABIT_WORDS[key]?.noun ?? lowerName(key);
}

function stepOf(days: number): Step {
  if (days < 0) return 'before';
  return days > 0 ? 'after' : 'same';
}

function sleepSides(a: CompareMetricKey, b: CompareMetricKey): SleepSides {
  if (isSleepMetric(a)) return isSleepMetric(b) ? 'both' : 'first';
  return isSleepMetric(b) ? 'second' : 'neither';
}

/** Half away from zero on the decimal value: toFixed alone shows 0.85 as 0.8. */
function fixed(value: number, digits: number): string {
  const scale = 10 ** digits;
  const rounded =
    (Math.sign(value) * Math.round(Math.abs(value) * scale + 1e-9)) / scale;
  // -0.0 reads as a sign that isn't there.
  return (rounded === 0 ? 0 : rounded).toFixed(digits);
}

function signed(value: number, digits: number): string {
  const text = fixed(value, digits);
  return Number(text) > 0 ? `+${text}` : text;
}

/** A level of a metric: "6.8/10", "7.2 h", "23:40", "40% of days". */
function levelText(key: CompareMetricKey, value: number): string {
  if (key === 'bedtime') return bedtimeClock(value);
  if (isYesNo(key)) return `${fixed(value * 100, 0)}% of days`;
  const amount = fixed(compareDisplayValue(key, value), compareDigits(key));
  const { unit } = COMPARE_METRICS[key];
  if (unit === '10-100') return `${amount}/10`;
  if (unit === '1-5') return `${amount}/5`;
  if (unit === 'score') return amount;
  return `${amount} ${unit}`;
}

/**
 * A difference with its 95% range: "+0.6 points on the 1-10 scale (95% range +0.1 to +1.0)". A
 * whole-number metric gets a decimal while the numbers are small, so +0.4 sessions isn't "+0".
 */
function differenceWithRange(
  key: CompareMetricKey,
  diff: number,
  low: number,
  high: number
): string {
  const scale = (v: number) =>
    isYesNo(key) ? v * 100 : compareDisplayValue(key, v);
  const shown = [diff, low, high].map(scale);
  const digits =
    !isYesNo(key) && compareDigits(key) === 1
      ? 1
      : Math.max(...shown.map(Math.abs)) < 10
        ? 1
        : 0;
  const [d, l, h] = shown.map((v) => signed(v, digits));
  const unit = isYesNo(key)
    ? 'percentage points'
    : (DIFFERENCE_UNITS[key] ?? COMPARE_METRICS[key].unit);
  return `${d} ${unit} (95% range ${l} to ${h})`;
}

function pText(p: number): string {
  return p < 0.001 ? 'p < 0.001' : `p = ${fixed(p, 3)}`;
}

function countOf(count: number, unit: 'day' | 'week' | 'night'): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "higher than usual", or "later" / "earlier" for bedtime, which is a time of day. */
function directionWord(key: CompareMetricKey, up: boolean): string {
  if (key === 'bedtime') return up ? 'later' : 'earlier';
  return up ? 'higher' : 'lower';
}

interface Question {
  a: CompareMetricKey;
  b: CompareMetricKey;
  mode: Mode;
  timing: Timing;
}

/** By the week a yes/no habit is counted in days. */
function quantityPhrase(key: CompareMetricKey, mode: Mode): string | null {
  return mode === 'week' && isYesNo(key)
    ? `the number of days the person ${habitVerb(key)}`
    : null;
}

/** The question's first thing: by the day a sleep metric is last night's, as the timing counts from that night. */
function subjectPhrase(key: CompareMetricKey, mode: Mode): string {
  const quantity = quantityPhrase(key, mode);
  if (quantity) return quantity;
  if (isYesNo(key)) return habitNoun(key);
  if (mode === 'day' && isSleepMetric(key))
    return `last night's ${lowerName(key)}`;
  return lowerName(key);
}

function objectPhrase(key: CompareMetricKey, mode: Mode): string {
  return (
    quantityPhrase(key, mode) ??
    (isYesNo(key) ? habitNoun(key) : lowerName(key))
  );
}

function timingWords(q: Question): string {
  if (q.mode === 'week') {
    return q.timing === 1 ? 'the next week' : 'the same week';
  }
  return DAY_TIMING[sleepSides(q.a, q.b)][stepOf(q.timing)];
}

function directionLine(q: Question, result: CompareResult): string | null {
  const direction = result.checks.direction;
  if (!direction) return null;
  if (direction === 'cantTell') return "- Which comes first: can't tell";
  if (q.timing === 0) {
    const leader = direction === 'firstComesFirst' ? q.a : q.b;
    return `- Which comes first: ${objectPhrase(leader, q.mode)} seems to come first`;
  }
  if (direction === 'strongerOtherWay') {
    return '- Which comes first: the link is stronger the other way round';
  }
  const first = q.timing === -1 ? q.b : q.a;
  return `- Which comes first: ${objectPhrase(first, q.mode)} comes first`;
}

function weekendLine(result: CompareResult): string | null {
  switch (result.checks.weekend) {
    case 'holds':
      return '- Weekends: still holds after accounting for weekends';
    case 'mayBeWeekends':
      return '- Weekends: this may be a weekday-versus-weekend pattern';
    default:
      return null;
  }
}

function allEqual(values: Record<string, number>): boolean {
  const list = Object.values(values);
  return list.length > 0 && list.every((v) => v === list[0]);
}

function notEnoughLine(response: CompareResponse, q: Question): string {
  const { result } = response;
  const yes = [q.a, q.b].find(isYesNo);
  const step = q.mode === 'week' ? 'week' : 'day';
  switch (result.reason) {
    case 'noVariation': {
      const flat = allEqual(response.a.values)
        ? q.a
        : allEqual(response.b.values)
          ? q.b
          : null;
      return flat
        ? `- Answer: Nothing to compare yet: ${objectPhrase(flat, q.mode)} ${quantityPhrase(flat, q.mode) ? 'was' : was(flat)} the same every ${step} in this range.`
        : "- Answer: Nothing to compare yet: one of them didn't change in this range.";
    }
    case 'fewYes':
      return `- Answer: Not enough days when the person ${yes ? habitVerb(yes) : 'said yes'} yet: ${countOf(result.n, 'day')}, and each side needs ${result.needed}.`;
    case 'fewNo':
      return `- Answer: Not enough days without ${yes ? habitNoun(yes) : 'a yes'} yet: ${countOf(result.n, 'day')}, and each side needs ${result.needed}.`;
    default: {
      const counts = `${capitalize(objectPhrase(q.a, q.mode))} has values on ${countOf(Object.keys(response.a.values).length, step)}, ${objectPhrase(q.b, q.mode)} on ${Object.keys(response.b.values).length}.`;
      return `- Answer: Not enough data yet: ${result.n} paired ${step}s, and an answer needs ${result.needed}. ${counts} Logging both more often, or a longer range, would help.`;
    }
  }
}

function independentText(result: CompareResult, mode: Mode): string {
  const n = countOf(result.n, mode);
  return result.nEff === undefined
    ? n
    : `${n} (about ${Math.round(result.nEff)} independent)`;
}

function correlationLines(q: Question, result: CompareResult): string[] {
  const a = subjectPhrase(q.a, q.mode);
  const b = `${objectPhrase(q.b, q.mode)} ${timingWords(q)}`;
  const answer = result.linked
    ? `- Answer: Linked. A ${result.strength} ${result.sign} link: when ${a} ${quantityPhrase(q.a, q.mode) ? 'was' : was(q.a)} ${directionWord(q.a, true)} than usual, ${b} tended to be ${directionWord(q.b, result.sign === 'positive')} than usual.`
    : `- Answer: No clear link. Over these ${countOf(result.n, q.mode)}, ${a} and ${b} did not move together more than chance would explain. That is not proof there is no link.`;
  const lines = [answer];
  if (
    result.r !== undefined &&
    result.low !== undefined &&
    result.high !== undefined &&
    result.p !== undefined
  ) {
    lines.push(
      `- Numbers: ${result.method} r = ${fixed(result.r, 2)} (95% range ${fixed(result.low, 2)} to ${fixed(result.high, 2)}), ${pText(result.p)}, ${independentText(result, q.mode)}`
    );
  }
  return lines;
}

/** How a yes/no comparison by the day is worded, from the habit's days (as in the app). */
interface YesNoWording {
  /** Opens the answer: "On days the person meditated", "The day after the person meditated". */
  when: string;
  /** The outcome, with its night when it is a sleep metric: "time asleep that night". */
  outcome: string;
  /** The habit's days, and the rest. */
  yesLabel: string;
  noLabel: string;
  unit: 'day' | 'night';
}

/** The outcome is read on the habit's day plus the timing (minus it when the habit is B). */
function yesNoWording(q: Question, yesKey: CompareMetricKey): YesNoWording {
  const outcomeKey = yesKey === q.a ? q.b : q.a;
  const step = stepOf(yesKey === q.a ? q.timing : -q.timing);
  const did = `the person ${habitVerb(yesKey)}`;
  if (isSleepMetric(outcomeKey)) {
    return {
      when: `On days ${did}`,
      outcome: `${lowerName(outcomeKey)} ${DAY_TIMING.second[step]}`,
      yesLabel:
        step === 'after'
          ? `the night after ${did}`
          : step === 'same'
            ? `the night before ${did}`
            : `two nights before ${did}`,
      noLabel: 'other nights',
      unit: 'night',
    };
  }
  const outcome = lowerName(outcomeKey);
  if (step === 'same') {
    return {
      when: `On days ${did}`,
      outcome,
      yesLabel: `days ${did}`,
      noLabel: `days without ${habitNoun(yesKey)}`,
      unit: 'day',
    };
  }
  const shifted =
    step === 'after' ? `the day after ${did}` : `the day before ${did}`;
  return {
    when: capitalize(shifted),
    outcome,
    yesLabel: shifted,
    noLabel: 'other days',
    unit: 'day',
  };
}

function differenceLines(
  q: Question,
  result: CompareResult,
  binary: NonNullable<CompareResult['binary']>
): string[] {
  const outcomeKey = binary.yesKey === q.a ? q.b : q.a;
  const words = yesNoWording(q, binary.yesKey);
  const answer = result.linked
    ? `- Answer: Linked. ${words.when}, ${words.outcome} ${was(outcomeKey)} ${directionWord(outcomeKey, result.sign === 'positive')} than usual.`
    : `- Answer: No clear difference. ${words.when}, ${words.outcome} ${was(outcomeKey)} no different from usual beyond what chance would explain.`;
  const lines = [answer];
  if (
    result.low !== undefined &&
    result.high !== undefined &&
    result.p !== undefined
  ) {
    lines.push(
      `- Numbers: ${differenceWithRange(outcomeKey, binary.diff, result.low, result.high)} between the two groups, each measured against the person's own normal; ${pText(result.p)}, ${independentText(result, 'day')}`
    );
  }
  lines.push(
    `- Averages: ${lowerName(outcomeKey)} averaged ${levelText(outcomeKey, binary.yesMean)} on ${words.yesLabel} (${countOf(binary.yesCount, words.unit)}) and ${levelText(outcomeKey, binary.noMean)} on ${words.noLabel} (${countOf(binary.noCount, words.unit)})`
  );
  return lines;
}

function renderCompare(
  response: CompareResponse,
  q: Question,
  range: { start: string; end: string }
): string {
  const { result } = response;
  const lines = [
    `# Compare: ${name(q.a)} and ${name(q.b)}`,
    '',
    `- Question: Does ${subjectPhrase(q.a, q.mode)} go with ${objectPhrase(q.b, q.mode)} ${timingWords(q)}?`,
    `- Range: ${range.start} to ${range.end} by ${q.mode}, counted through ${response.through}`,
  ];
  if (result.status === 'not_enough') {
    lines.push(notEnoughLine(response, q));
    return lines.join('\n');
  }
  lines.push(
    ...(result.method === 'difference' && result.binary
      ? differenceLines(q, result, result.binary)
      : correlationLines(q, result))
  );
  if (result.linked) {
    const direction = directionLine(q, result);
    if (direction) lines.push(direction);
    const weekend = weekendLine(result);
    if (weekend) lines.push(weekend);
  }
  lines.push(
    '',
    `Each ${q.mode} is measured against the person's own ${OWN_NORMAL[q.mode]}, so a slow drift in both does not count as a link. A link is not proof that one causes the other.`
  );
  return lines.join('\n');
}

function stretchLine(
  label: string,
  outcome: CompareMetricKey,
  stretch: CompareSinceStretch,
  line: number
): string {
  const parts = [
    `${stretch.from} to ${stretch.to}`,
    `${lowerName(outcome)} on ${stretch.valueDays} of ${countOf(stretch.days, 'day')}`,
  ];
  if (stretch.mean !== undefined) {
    parts.push(`average ${levelText(outcome, stretch.mean)}`);
  }
  // A yes/no outcome's average is already the share of days; a range or a line adds nothing.
  if (!isYesNo(outcome)) {
    if (stretch.p10 !== undefined && stretch.p90 !== undefined) {
      parts.push(
        `typical ${levelText(outcome, stretch.p10)} to ${levelText(outcome, stretch.p90)}`
      );
    }
    if (stretch.shareAtOrAbove !== undefined) {
      parts.push(
        `${fixed(stretch.shareAtOrAbove * 100, 0)}% of days at or above ${levelText(outcome, line)}`
      );
    }
  }
  return `- ${label}: ${parts.join(', ')}`;
}

/** Habits a start can be suggested for: those done on some days. */
const SUGGESTABLE_HABITS = COMPARE_METRIC_KEYS.filter(hasActiveDays);

function startLine(
  habit: CompareMetricKey,
  result: CompareSinceResponse['result'],
  given: boolean
): string {
  const start = `- Habit: ${lowerName(habit)}, started ${result.start}`;
  if (!given) {
    return `${start} (suggested: the first of 3 weeks in a row with it on at least 4 days each)`;
  }
  return result.suggestedStart && result.suggestedStart !== result.start
    ? `${start} (given; the suggested start would be ${result.suggestedStart})`
    : `${start} (given)`;
}

function renderSince(
  response: CompareSinceResponse,
  habit: CompareMetricKey,
  outcome: CompareMetricKey,
  given: boolean
): string {
  const { result } = response;
  const lines = [`# Since: ${name(habit)} and ${name(outcome)}`, ''];
  if (result.reason === 'noStart') {
    lines.push(
      `- Habit: ${lowerName(habit)}, no start date`,
      `- Outcome: ${lowerName(outcome)}`,
      `- Answer: No start date was given and none could be suggested. A start is only suggested for ${SUGGESTABLE_HABITS.map(habitNoun).join(', ')}: the first of 3 weeks in a row with the habit on at least 4 days each. Ask the person when they started.`
    );
    return lines.join('\n');
  }
  lines.push(
    startLine(habit, result, given),
    `- Outcome: ${lowerName(outcome)}, before the start against since`
  );
  if (result.status === 'not_enough') {
    const isBefore = result.reason === 'fewBefore';
    const stretch = isBefore ? result.before : result.since;
    const has = stretch
      ? `${lowerName(outcome)} on ${stretch.valueDays} of ${countOf(stretch.days, 'day')}`
      : 'no days';
    lines.push(
      `- Answer: Not enough days ${isBefore ? 'before' : 'since'} the start: ${has}, and each side needs ${SINCE_STRETCH_MIN_VALUES} days with a value over at least ${SINCE_STRETCH_MIN_DAYS} days.`
    );
    return lines.join('\n');
  }
  lines.push(
    result.changed
      ? `- Answer: Changed. ${name(outcome)} ${PLURAL.has(outcome) ? 'have' : 'has'} been ${directionWord(outcome, (result.diff ?? 0) > 0)} since the start.`
      : `- Answer: No clear change. ${name(outcome)} since the start ${PLURAL.has(outcome) ? 'are' : 'is'} within what chance would explain.`
  );
  if (
    result.diff !== undefined &&
    result.low !== undefined &&
    result.high !== undefined &&
    result.p !== undefined
  ) {
    lines.push(
      `- Numbers: since minus before ${differenceWithRange(outcome, result.diff, result.low, result.high)}, ${pText(result.p)}`
    );
  }
  if (result.before) {
    lines.push(stretchLine('Before', outcome, result.before, result.line));
  }
  if (result.since) {
    lines.push(stretchLine('Since', outcome, result.since, result.line));
  }
  if (result.regularity) {
    lines.push(
      `- Kept up: ${result.regularity.weeksKept} of ${result.regularity.weeks} weeks since the start had the habit on at least 4 days`
    );
  }
  if (result.alreadyChanging) {
    lines.push(
      `- Caution: ${lowerName(outcome)} ${was(outcome)} already moving this way before the start, so the change may not be down to the habit.`
    );
  }
  lines.push(
    '',
    `Before and since are compared on ${lowerName(outcome)}'s own scale. Other things changed over the same time too, so this shows a change, not that the habit caused it.`
  );
  return lines.join('\n');
}

function renderMetricList(): string {
  const lines = COMPARE_METRIC_KEYS.map((key) => {
    const def = COMPARE_METRICS[key];
    const notes = [def.group, UNIT_DESCRIPTIONS[def.unit] ?? def.unit];
    if (def.rolling) notes.push('read over the 7 days ending each day');
    if (!offeredInMode(key, 'week')) notes.push('day only');
    if (!offeredInMode(key, 'since')) notes.push('not for since questions');
    return `- ${key}: ${name(key)} (${notes.join(', ')})`;
  });
  return [
    '# Compare Metrics',
    '',
    ...lines,
    '',
    'Sleep metrics are dated by the day the person woke up. By week, minutes, loads and volumes are summed, "meditated" counts the days, and everything else is averaged.',
  ].join('\n');
}

// The shared schemas and errors name the range start/end and habitStart; the tool calls them *_date.
const TOOL_FIELD_NAMES: Record<string, string> = {
  start: 'start_date',
  end: 'end_date',
  habitStart: 'habit_start_date',
};

/** Drops fields that belong to another action, so `timing` sent with `since` is not an error. */
function ownFields(args: unknown): unknown {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
  const record = args as Record<string, unknown>;
  const action = record.action;
  if (
    typeof action !== 'string' ||
    !Object.hasOwn(COMPARE_TOOL_FIELDS, action)
  ) {
    return args;
  }
  const fields =
    COMPARE_TOOL_FIELDS[action as keyof typeof COMPARE_TOOL_FIELDS];
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => fields.includes(key))
  );
}

function inferAction(args: Record<string, unknown>): string | undefined {
  if (args.habit_start_date !== undefined) return 'since';
  if (args.a !== undefined || args.b !== undefined) return 'compare';
  return 'list_metrics';
}

async function runCompare(
  userId: string,
  tz: string,
  args: Extract<CompareToolInput, { action: 'compare' }>
): Promise<string> {
  const mode: Mode = args.by ?? 'day';
  let a = args.a;
  let b = args.b;
  let timing = TIMINGS[args.timing ?? 'same_day'];
  // By week only A-then-B is offered; B then A is the same question with the two swapped.
  if (mode === 'week' && timing === -1) {
    [a, b] = [b, a];
    timing = 1;
  }
  const end = args.end_date ?? todayInZone(tz);
  // The app's default span: 90 days, or 26 weeks by week, ending on end_date.
  const start =
    args.start_date ??
    addDays(end, -(COMPARE_SPAN_DAYS[DEFAULT_COMPARE_SPAN[mode]] - 1));
  const parsed = compareQuerySchema.safeParse({
    a,
    b,
    mode,
    timing,
    start,
    end,
  });
  if (!parsed.success) return formatZodError(parsed.error, TOOL_FIELD_NAMES);

  const response = await compareService.getCompare(userId, parsed.data);
  return renderCompare(response, { a, b, mode, timing }, { start, end });
}

async function runSince(
  userId: string,
  args: Extract<CompareToolInput, { action: 'since' }>
): Promise<string> {
  const parsed = compareSinceQuerySchema.safeParse({
    a: args.a,
    b: args.b,
    mode: 'since',
    habitStart: args.habit_start_date,
  });
  if (!parsed.success) return formatZodError(parsed.error, TOOL_FIELD_NAMES);

  const response = await compareService.getCompareSince(userId, parsed.data);
  return renderSince(
    response,
    args.a,
    args.b,
    args.habit_start_date !== undefined
  );
}

export function buildCompareTools(userId: string, tz: string) {
  return {
    sparky_compare_metrics: tool({
      description:
        "Does one tracked thing go with another? The same statistics as the app's Compare report: each day (or week) is measured against the person's own normal, with an honest p-value and 95% range, plus checks for which comes first and for weekends. " +
        "compare: does A go with B by day or week, optionally with B a day after A. Sleep metrics are dated by the day the person woke up, so same_day pairs a day with the night before it; caffeine or alcohol with that night's sleep is a_then_b. " +
        'since: has outcome B changed since habit A started; a start is suggested only for habits done on some days (workouts, meditation), otherwise pass habit_start_date. ' +
        'list_metrics: the metric keys. Weight trend cannot be a since question. Today is never counted. Describe a link as a link, never as proof of cause.',
      inputSchema: compareToolInput,
      execute: async (rawArgs) => {
        const parsed = compareToolSchema.safeParse(
          ownFields(
            normalizeActionArgs(rawArgs, tz, VALID_ACTIONS, inferAction)
          )
        );
        if (!parsed.success) {
          return formatZodError(parsed.error, TOOL_FIELD_NAMES);
        }
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'compare':
              return await runCompare(userId, tz, args);
            case 'since':
              return await runSince(userId, args);
            case 'list_metrics':
              return renderMetricList();
            default:
              return ERRORS.INVALID_ACTION(
                String((args as { action?: string }).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          // A question out of range (a metric with no weekly form, a since start too old).
          if (error instanceof CompareModeError) {
            return ERRORS.VALIDATION(
              error.message.replace('habitStart', 'habit_start_date')
            );
          }
          log('error', '[Compare Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
