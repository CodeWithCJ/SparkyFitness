import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  CompareModeError,
  type CompareResponse,
  type CompareResult,
  type CompareSinceResponse,
} from '@workspace/shared';
import { buildCompareTools } from '../ai/tools/compareTools.js';
import compareService from '../services/compareService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/compareService.js', () => ({
  default: {
    getCompare: vi.fn(),
    getCompareSince: vi.fn(),
  },
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const svc = compareService as unknown as {
  getCompare: ReturnType<typeof vi.fn>;
  getCompareSince: ReturnType<typeof vi.fn>;
};

const opts = toolOpts;
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildCompareTools>;

function run(args: Record<string, unknown>) {
  return tools.sparky_compare_metrics.execute!(args, opts);
}

function response(
  result: CompareResult,
  values: {
    a?: Record<string, number>;
    b?: Record<string, number>;
  } = {}
): CompareResponse {
  return {
    a: { key: 'timeAsleep', values: values.a ?? {} },
    b: { key: 'mood', values: values.b ?? {} },
    deviations: { a: {}, b: {} },
    through: '2026-10-21',
    result,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  tools = buildCompareTools('user-1', 'UTC');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sparky_compare_metrics compare', () => {
  it('asks the last 90 days by day and renders a linked answer', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 62,
        needed: 14,
        method: 'pearson',
        nEff: 38.4,
        r: 0.4213,
        p: 0.0012,
        low: 0.183,
        high: 0.6149,
        linked: true,
        strength: 'moderate',
        sign: 'positive',
        checks: {
          ownNormal: true,
          direction: 'firstComesFirst',
          weekend: 'holds',
        },
      })
    );

    const result = await run({ action: 'compare', a: 'timeAsleep', b: 'mood' });

    expect(svc.getCompare).toHaveBeenCalledWith('user-1', {
      a: 'timeAsleep',
      b: 'mood',
      mode: 'day',
      timing: 0,
      start: '2026-07-25',
      end: '2026-10-22',
    });
    expect(result).toBe(
      [
        '# Compare: Time asleep and Mood',
        '',
        "- Question: Does last night's time asleep go with mood that day?",
        '- Range: 2026-07-25 to 2026-10-22 by day, counted through 2026-10-21',
        "- Answer: Linked. A moderate positive link: when last night's time asleep was higher than usual, mood that day tended to be higher than usual.",
        '- Numbers: pearson r = 0.42 (95% range 0.18 to 0.61), p = 0.001, 62 days (about 38 independent)',
        '- Which comes first: time asleep seems to come first',
        '- Weekends: still holds after accounting for weekends',
        '',
        "Each day is measured against the person's own previous 14 days, so a slow drift in both does not count as a link. A link is not proof that one causes the other.",
      ].join('\n')
    );
  });

  it('infers compare from a and b, and reads a_then_b sleep as that night', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 40,
        needed: 14,
        method: 'spearman',
        nEff: 31,
        r: -0.05,
        p: 0.7712,
        low: -0.39,
        high: 0.3,
        linked: false,
        checks: { ownNormal: true },
      })
    );

    const result = await run({
      a: 'alcohol',
      b: 'overnightHrv',
      timing: 'a_then_b',
      start_date: '2026-09-01',
      end_date: 'yesterday',
    });

    expect(svc.getCompare).toHaveBeenCalledWith('user-1', {
      a: 'alcohol',
      b: 'overnightHrv',
      mode: 'day',
      timing: 1,
      start: '2026-09-01',
      end: '2026-10-21',
    });
    expect(result).toBe(
      [
        '# Compare: Alcohol and Overnight HRV',
        '',
        '- Question: Does alcohol go with overnight HRV that night?',
        '- Range: 2026-09-01 to 2026-10-21 by day, counted through 2026-10-21',
        '- Answer: No clear link. Over these 40 days, alcohol and overnight HRV that night did not move together more than chance would explain. That is not proof there is no link.',
        '- Numbers: spearman r = -0.05 (95% range -0.39 to 0.30), p = 0.771, 40 days (about 31 independent)',
        '',
        "Each day is measured against the person's own previous 14 days, so a slow drift in both does not count as a link. A link is not proof that one causes the other.",
      ].join('\n')
    );
  });

  it('reads b_then_a as B the day before, and names B when it comes first', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 50,
        needed: 14,
        method: 'pearson',
        nEff: 44,
        r: -0.35,
        p: 0.02,
        low: -0.58,
        high: -0.06,
        linked: true,
        strength: 'moderate',
        sign: 'negative',
        checks: { ownNormal: true, direction: 'firstComesFirst' },
      })
    );

    const result = await run({
      action: 'compare',
      a: 'bedtime',
      b: 'caffeine',
      timing: 'b_then_a',
    });

    expect(svc.getCompare).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ a: 'bedtime', b: 'caffeine', timing: -1 })
    );
    expect(result).toContain(
      "- Question: Does last night's bedtime go with caffeine the day before?"
    );
    expect(result).toContain(
      "- Answer: Linked. A moderate negative link: when last night's bedtime was later than usual, caffeine the day before tended to be lower than usual."
    );
    expect(result).toContain('- Which comes first: caffeine comes first');
  });

  it('asks the last 26 weeks by week, and swaps b_then_a into a_then_b', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 24,
        needed: 8,
        method: 'pearson',
        nEff: 20,
        r: 0.52,
        p: 0.01,
        low: 0.14,
        high: 0.77,
        linked: true,
        strength: 'strong',
        sign: 'positive',
        checks: { ownNormal: true, direction: 'strongerOtherWay' },
      })
    );

    const result = await run({
      action: 'compare',
      a: 'mood',
      b: 'meditated',
      by: 'week',
      timing: 'b_then_a',
    });

    expect(svc.getCompare).toHaveBeenCalledWith('user-1', {
      a: 'meditated',
      b: 'mood',
      mode: 'week',
      timing: 1,
      start: '2026-04-24',
      end: '2026-10-22',
    });
    expect(result).toBe(
      [
        '# Compare: Meditated and Mood',
        '',
        '- Question: Does the number of days the person meditated go with mood the next week?',
        '- Range: 2026-04-24 to 2026-10-22 by week, counted through 2026-10-21',
        '- Answer: Linked. A strong positive link: when the number of days the person meditated was higher than usual, mood the next week tended to be higher than usual.',
        '- Numbers: pearson r = 0.52 (95% range 0.14 to 0.77), p = 0.010, 24 weeks (about 20 independent)',
        '- Which comes first: the link is stronger the other way round',
        '',
        "Each week is measured against the person's own previous 6 weeks, so a slow drift in both does not count as a link. A link is not proof that one causes the other.",
      ].join('\n')
    );
  });

  it('renders a yes/no comparison on the 1-10 mood scale', async () => {
    svc.getCompare.mockResolvedValue({
      ...response({
        status: 'ok',
        n: 70,
        needed: 14,
        method: 'difference',
        nEff: 50.2,
        p: 0.0204,
        low: 1.2,
        high: 9.8,
        linked: true,
        sign: 'positive',
        binary: {
          yesKey: 'meditated',
          yesMean: 68.4,
          noMean: 62.1,
          yesCount: 30,
          noCount: 40,
          diff: 5.5,
        },
        checks: {
          ownNormal: true,
          direction: 'cantTell',
          weekend: 'mayBeWeekends',
        },
      }),
      a: { key: 'meditated', values: {} },
    });

    const result = await run({ action: 'compare', a: 'meditated', b: 'mood' });

    expect(result).toBe(
      [
        '# Compare: Meditated and Mood',
        '',
        '- Question: Does meditating go with mood the same day?',
        '- Range: 2026-07-25 to 2026-10-22 by day, counted through 2026-10-21',
        '- Answer: Linked. On days the person meditated, mood was higher than usual.',
        "- Numbers: +0.6 points on the 1-10 scale (95% range +0.1 to +1.0) between the two groups, each measured against the person's own normal; p = 0.020, 70 days (about 50 independent)",
        '- Averages: mood averaged 6.8/10 on days the person meditated (30 days) and 6.2/10 on days without meditating (40 days)',
        "- Which comes first: can't tell",
        '- Weekends: this may be a weekday-versus-weekend pattern',
        '',
        "Each day is measured against the person's own previous 14 days, so a slow drift in both does not count as a link. A link is not proof that one causes the other.",
      ].join('\n')
    );
  });

  it('words a yes/no comparison where the outcome comes the day before', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 70,
        needed: 14,
        method: 'difference',
        nEff: 50,
        p: 0.4,
        low: -2,
        high: 5,
        linked: false,
        binary: {
          yesKey: 'meditated',
          yesMean: 2000,
          noMean: 2100,
          yesCount: 30,
          noCount: 40,
          diff: -60,
        },
        checks: { ownNormal: true },
      })
    );

    const result = await run({
      action: 'compare',
      a: 'calories',
      b: 'meditated',
      timing: 'a_then_b',
    });

    expect(result).toContain(
      '- Answer: No clear difference. The day before the person meditated, calories were no different from usual beyond what chance would explain.'
    );
    expect(result).toContain(
      '- Averages: calories averaged 2000 kcal on the day before the person meditated (30 days) and 2100 kcal on other days (40 days)'
    );
  });

  it('explains too few paired days with what each side has', async () => {
    svc.getCompare.mockResolvedValue(
      response(
        {
          status: 'not_enough',
          n: 9,
          needed: 14,
          reason: 'tooFew',
          checks: { ownNormal: true },
        },
        {
          a: Object.fromEntries(
            Array.from({ length: 40 }, (_, i) => [`d${i}`, 7])
          ),
          b: Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [`d${i}`, i])
          ),
        }
      )
    );

    const result = await run({ action: 'compare', a: 'timeAsleep', b: 'mood' });

    expect(result).toBe(
      [
        '# Compare: Time asleep and Mood',
        '',
        "- Question: Does last night's time asleep go with mood that day?",
        '- Range: 2026-07-25 to 2026-10-22 by day, counted through 2026-10-21',
        '- Answer: Not enough data yet: 9 paired days, and an answer needs 14. Time asleep has values on 40 days, mood on 12. Logging both more often, or a longer range, would help.',
      ].join('\n')
    );
  });

  it('names the flat side when nothing varied', async () => {
    svc.getCompare.mockResolvedValue(
      response(
        {
          status: 'not_enough',
          n: 30,
          needed: 14,
          reason: 'noVariation',
          checks: { ownNormal: true },
        },
        { a: { x: 1, y: 2 }, b: { x: 50, y: 50 } }
      )
    );

    const result = await run({ action: 'compare', a: 'timeAsleep', b: 'mood' });

    expect(result).toContain(
      '- Answer: Nothing to compare yet: mood was the same every day in this range.'
    );
  });

  it('reports too few yes days', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'not_enough',
        n: 3,
        needed: 5,
        reason: 'fewYes',
        checks: { ownNormal: true },
      })
    );

    const result = await run({ action: 'compare', a: 'meditated', b: 'mood' });

    expect(result).toContain(
      '- Answer: Not enough days when the person meditated yet: 3 days, and each side needs 5.'
    );
  });

  it('refuses the same metric twice with the tool field names', async () => {
    const result = await run({ action: 'compare', a: 'mood', b: 'mood' });

    expect(result).toBe(
      'Error [VALIDATION]: b: Pick two different things to compare'
    );
    expect(svc.getCompare).not.toHaveBeenCalled();
  });

  it('refuses a range longer than the mode allows', async () => {
    const result = await run({
      action: 'compare',
      a: 'mood',
      b: 'steps',
      start_date: '2026-01-01',
      end_date: '2026-10-01',
    });

    expect(result).toBe(
      'Error [VALIDATION]: end_date: The range can be at most 180 days in day mode'
    );
  });

  it('refuses a metric with no weekly form by week', async () => {
    const result = await run({
      action: 'compare',
      a: 'meditationSessions7d',
      b: 'mood',
      by: 'week',
    });

    expect(result).toBe(
      'Error [VALIDATION]: a: meditationSessions7d has no weekly form; use day mode'
    );
  });

  it('returns a DB error string when the service throws', async () => {
    svc.getCompare.mockRejectedValue(new Error('boom'));

    const result = await run({ action: 'compare', a: 'timeAsleep', b: 'mood' });

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

describe('sparky_compare_metrics since', () => {
  const STRETCHES = {
    before: {
      from: '2025-05-04',
      to: '2026-05-03',
      days: 365,
      valueDays: 120,
      mean: 61.2,
      p10: 40,
      p90: 80,
      shareAtOrAbove: 0.35,
    },
    since: {
      from: '2026-05-04',
      to: '2026-10-21',
      days: 171,
      valueDays: 150,
      mean: 66,
      p10: 50,
      p90: 80,
      shareAtOrAbove: 0.48,
    },
  };

  function sinceResponse(
    result: CompareSinceResponse['result']
  ): CompareSinceResponse {
    return {
      mode: 'since',
      habit: { key: 'meditated', values: {} },
      outcome: { key: 'mood', values: {} },
      result,
    };
  }

  it('uses the suggested start and renders a change', async () => {
    svc.getCompareSince.mockResolvedValue(
      sinceResponse({
        status: 'ok',
        start: '2026-05-04',
        suggestedStart: '2026-05-04',
        ...STRETCHES,
        line: 70,
        diff: 4.8,
        low: 1.1,
        high: 8.5,
        p: 0.011,
        changed: true,
        regularity: { weeksKept: 20, weeks: 24 },
        alreadyChanging: true,
      })
    );

    const result = await run({ action: 'since', a: 'meditated', b: 'mood' });

    expect(svc.getCompareSince).toHaveBeenCalledWith('user-1', {
      a: 'meditated',
      b: 'mood',
      mode: 'since',
    });
    expect(result).toBe(
      [
        '# Since: Meditated and Mood',
        '',
        '- Habit: meditated, started 2026-05-04 (suggested: the first of 3 weeks in a row with it on at least 4 days each)',
        '- Outcome: mood, before the start against since',
        '- Answer: Changed. Mood has been higher since the start.',
        '- Numbers: since minus before +0.5 points on the 1-10 scale (95% range +0.1 to +0.9), p = 0.011',
        '- Before: 2025-05-04 to 2026-05-03, mood on 120 of 365 days, average 6.1/10, typical 4.0/10 to 8.0/10, 35% of days at or above 7.0/10',
        '- Since: 2026-05-04 to 2026-10-21, mood on 150 of 171 days, average 6.6/10, typical 5.0/10 to 8.0/10, 48% of days at or above 7.0/10',
        '- Kept up: 20 of 24 weeks since the start had the habit on at least 4 days',
        '- Caution: mood was already moving this way before the start, so the change may not be down to the habit.',
        '',
        "Before and since are compared on mood's own scale. Other things changed over the same time too, so this shows a change, not that the habit caused it.",
      ].join('\n')
    );
  });

  it('passes a given start (inferred from habit_start_date) and notes the suggestion', async () => {
    svc.getCompareSince.mockResolvedValue(
      sinceResponse({
        status: 'ok',
        start: '2026-05-10',
        suggestedStart: '2026-05-04',
        ...STRETCHES,
        line: 70,
        diff: 0.4,
        low: -3,
        high: 3.8,
        p: 0.81,
        changed: false,
      })
    );

    const result = await run({
      a: 'meditated',
      b: 'mood',
      habit_start_date: '2026-05-10',
    });

    expect(svc.getCompareSince).toHaveBeenCalledWith('user-1', {
      a: 'meditated',
      b: 'mood',
      mode: 'since',
      habitStart: '2026-05-10',
    });
    expect(result).toContain(
      '- Habit: meditated, started 2026-05-10 (given; the suggested start would be 2026-05-04)'
    );
    expect(result).toContain(
      '- Answer: No clear change. Mood since the start is within what chance would explain.'
    );
  });

  it('asks for a start when none could be suggested', async () => {
    svc.getCompareSince.mockResolvedValue(
      sinceResponse({
        status: 'not_enough',
        reason: 'noStart',
        start: null,
        suggestedStart: null,
        line: 70,
      })
    );

    const result = await run({ action: 'since', a: 'steps', b: 'mood' });

    expect(result).toBe(
      [
        '# Since: Steps and Mood',
        '',
        '- Habit: steps, no start date',
        '- Outcome: mood',
        '- Answer: No start date was given and none could be suggested. A start is only suggested for meditation minutes, meditating, workout minutes, cardio minutes, strength volume, training load: the first of 3 weeks in a row with the habit on at least 4 days each. Ask the person when they started.',
      ].join('\n')
    );
  });

  it('says which side is short of days', async () => {
    svc.getCompareSince.mockResolvedValue(
      sinceResponse({
        status: 'not_enough',
        reason: 'fewSince',
        start: '2026-10-01',
        suggestedStart: null,
        before: STRETCHES.before,
        since: {
          from: '2026-10-01',
          to: '2026-10-21',
          days: 21,
          valueDays: 9,
        },
        line: 70,
      })
    );

    const result = await run({
      action: 'since',
      a: 'meditated',
      b: 'mood',
      habit_start_date: '2026-10-01',
    });

    expect(result).toContain(
      '- Answer: Not enough days since the start: mood on 9 of 21 days, and each side needs 14 days with a value over at least 28 days.'
    );
  });

  it('turns an out-of-range start into a validation error', async () => {
    svc.getCompareSince.mockRejectedValue(
      new CompareModeError('habitStart can be at most 730 days ago')
    );

    const result = await run({
      action: 'since',
      a: 'meditated',
      b: 'mood',
      habit_start_date: '2020-01-01',
    });

    expect(result).toBe(
      'Error [VALIDATION]: habit_start_date can be at most 730 days ago'
    );
  });
});

describe('sparky_compare_metrics since weight trend', () => {
  it('refuses weight trend', async () => {
    const result = await run({
      action: 'since',
      a: 'meditated',
      b: 'weightTrend',
    });

    expect(result).toBe(
      'Error [VALIDATION]: b: weightTrend is not offered in since mode; it drifts too slowly to tell a change from its own wandering'
    );
    expect(svc.getCompareSince).not.toHaveBeenCalled();
  });
});

describe('sparky_compare_metrics list_metrics', () => {
  it('marks weight trend as not for since questions', async () => {
    const result = (await run({ action: 'list_metrics' })) as string;
    const line = result.split('\n').find((l) => l.startsWith('- weightTrend:'));

    expect(line).toContain('not for since questions');
    expect(result.match(/not for since questions/g)).toHaveLength(1);
  });

  it('lists every metric key with its unit', async () => {
    const result = (await run({ action: 'list_metrics' })) as string;

    expect(
      result.startsWith(
        '# Compare Metrics\n\n- mood: Mood (feelings, scale 1-10)\n'
      )
    ).toBe(true);
    expect(result).toContain('- bedtime: Bedtime (sleep, clock time)');
    expect(result).toContain(
      '- meditationSessions7d: Meditation sessions (7 days) (meditation, sessions, read over the 7 days ending each day, day only)'
    );
    expect(result).toContain('- meditated: Meditated (meditation, yes or no)');
    expect(result.match(/^- \w+: /gm)).toHaveLength(24);
  });

  it('is what an empty call gets', async () => {
    const result = (await run({})) as string;
    expect(result.startsWith('# Compare Metrics')).toBe(true);
  });
});

describe('sparky_compare_metrics wording', () => {
  const LINKED: CompareResult = {
    status: 'ok',
    n: 60,
    needed: 14,
    method: 'pearson',
    nEff: 40,
    r: -0.3,
    p: 0.03,
    low: -0.53,
    high: -0.03,
    linked: true,
    strength: 'moderate',
    sign: 'negative',
    checks: { ownNormal: true },
  };

  it('dates sleep by the wake day: same_day pairs caffeine with the night before', async () => {
    svc.getCompare.mockResolvedValue(response(LINKED));

    const sameDay = await run({ a: 'caffeine', b: 'timeAsleep' });
    const thatNight = await run({
      a: 'caffeine',
      b: 'timeAsleep',
      timing: 'a_then_b',
    });

    expect(sameDay).toContain(
      '- Question: Does caffeine go with time asleep the night before?'
    );
    expect(thatNight).toContain(
      '- Question: Does caffeine go with time asleep that night?'
    );
    expect(thatNight).toContain(
      '- Answer: Linked. A moderate negative link: when caffeine was higher than usual, time asleep that night tended to be lower than usual.'
    );
  });

  it('words a yes/no habit against a sleep outcome in nights', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'ok',
        n: 70,
        needed: 14,
        method: 'difference',
        nEff: 50,
        p: 0.01,
        low: 0.1,
        high: 0.5,
        linked: true,
        sign: 'positive',
        binary: {
          yesKey: 'meditated',
          yesMean: 7.4,
          noMean: 7.0,
          yesCount: 30,
          noCount: 40,
          diff: 0.3,
        },
        checks: { ownNormal: true },
      })
    );

    const result = await run({
      a: 'meditated',
      b: 'timeAsleep',
      timing: 'a_then_b',
    });

    expect(result).toContain(
      '- Answer: Linked. On days the person meditated, time asleep that night was higher than usual.'
    );
    expect(result).toContain(
      '- Averages: time asleep averaged 7.4 h on the night after the person meditated (30 nights) and 7.0 h on other nights (40 nights)'
    );
  });

  it('gives small differences of a whole-number metric a decimal', async () => {
    svc.getCompareSince.mockResolvedValue({
      mode: 'since',
      habit: { key: 'workoutMinutes', values: {} },
      outcome: { key: 'meditationSessions7d', values: {} },
      result: {
        status: 'ok',
        start: '2026-05-04',
        suggestedStart: '2026-05-04',
        line: 3,
        diff: 0.4,
        low: 0.1,
        high: 0.7,
        p: 0.02,
        changed: true,
      },
    } satisfies CompareSinceResponse);

    const result = await run({
      action: 'since',
      a: 'workoutMinutes',
      b: 'meditationSessions7d',
    });

    expect(result).toContain(
      '- Numbers: since minus before +0.4 sessions (95% range +0.1 to +0.7), p = 0.020'
    );
  });

  it('shows a yes/no outcome as a share of days, without a range or line', async () => {
    svc.getCompareSince.mockResolvedValue({
      mode: 'since',
      habit: { key: 'workoutMinutes', values: {} },
      outcome: { key: 'meditated', values: {} },
      result: {
        status: 'ok',
        start: '2026-05-04',
        suggestedStart: '2026-05-04',
        before: {
          from: '2025-05-04',
          to: '2026-05-03',
          days: 365,
          valueDays: 365,
          mean: 0.2,
          p10: 0,
          p90: 1,
          shareAtOrAbove: 0.2,
        },
        line: 1,
        diff: 0.15,
        low: 0.05,
        high: 0.25,
        p: 0.004,
        changed: true,
      },
    } satisfies CompareSinceResponse);

    const result = await run({
      action: 'since',
      a: 'workoutMinutes',
      b: 'meditated',
    });

    expect(result).toContain(
      '- Before: 2025-05-04 to 2026-05-03, meditated on 365 of 365 days, average 20% of days'
    );
    expect(result).toContain(
      '- Numbers: since minus before +15 percentage points (95% range +5 to +25), p = 0.004'
    );
  });

  it('agrees the verb with a plural metric', async () => {
    svc.getCompareSince.mockResolvedValue({
      mode: 'since',
      habit: { key: 'workoutMinutes', values: {} },
      outcome: { key: 'calories', values: {} },
      result: {
        status: 'ok',
        start: '2026-05-04',
        suggestedStart: '2026-05-04',
        line: 2300,
        diff: -150,
        low: -260,
        high: -40,
        p: 0.01,
        changed: true,
      },
    } satisfies CompareSinceResponse);

    const result = await run({
      action: 'since',
      a: 'workoutMinutes',
      b: 'calories',
    });

    expect(result).toContain(
      '- Answer: Changed. Calories have been lower since the start.'
    );
  });
});

describe('sparky_compare_metrics fields from another action', () => {
  it('ignores day/week fields sent with a since question', async () => {
    svc.getCompareSince.mockResolvedValue({
      mode: 'since',
      habit: { key: 'meditated', values: {} },
      outcome: { key: 'mood', values: {} },
      result: {
        status: 'not_enough',
        reason: 'noStart',
        start: null,
        suggestedStart: null,
        line: 70,
      },
    } satisfies CompareSinceResponse);

    const result = (await run({
      action: 'since',
      a: 'meditated',
      b: 'mood',
      by: 'day',
      timing: 'same_day',
      end_date: '2026-10-01',
    })) as string;

    expect(result.startsWith('# Since: Meditated and Mood')).toBe(true);
    expect(svc.getCompareSince).toHaveBeenCalledWith('user-1', {
      a: 'meditated',
      b: 'mood',
      mode: 'since',
    });
  });

  it('ignores a habit start sent with a compare question', async () => {
    svc.getCompare.mockResolvedValue(
      response({
        status: 'not_enough',
        n: 0,
        needed: 14,
        reason: 'tooFew',
        checks: { ownNormal: true },
      })
    );

    const result = (await run({
      action: 'compare',
      a: 'timeAsleep',
      b: 'mood',
      habit_start_date: '2026-05-01',
    })) as string;

    expect(result.startsWith('# Compare: Time asleep and Mood')).toBe(true);
    expect(svc.getCompare).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ mode: 'day', start: '2026-07-25' })
    );
  });
});
