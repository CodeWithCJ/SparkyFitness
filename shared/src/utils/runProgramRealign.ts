import { isCustomProgramId } from '../schemas/api/RunProgram.api.zod.ts';
import type {
  RunProgramRealignChange,
  RunProgramRealignOption,
  RunProgramRealignPreview,
  RunProgramRealignResult,
  RunProgramResponse,
} from '../schemas/api/RunProgram.api.zod.ts';
import { ProgramAdjustError, adjustRunning } from './runProgramAdjust.ts';
import type { ProgramState } from './runProgramAdjust.ts';
import { suggestFromBreak } from './runProgramBreak.ts';
import {
  planMinutes,
  programActivity,
  runMinutes,
  type ProgramWorkout,
} from './runPrograms.ts';
import type { RaceDistance } from './racePlan.ts';
import {
  countRunSlots,
  projectedFinishDay,
  type ProgramSchedule,
} from './runProgramSchedule.ts';

/**
 * Rebuilds the rest of a plan so it still ends on the goal day, the way a
 * race plan does for someone who missed weeks. Pure: the REST route, the AI
 * tool and the apps all use it, and nothing is saved until the person agrees.
 *
 * Rules, in order of importance:
 * - the taper and the final workout (the race) are never dropped;
 * - with too little time, repeats in the base weeks go first, then the
 *   shortest easy runs, then the long run of a lighter week is folded into its
 *   neighbour; the long runs that build the progression are kept;
 * - a person who runs three or more days a week keeps at least two a week;
 * - with a lot of spare time, base weeks are repeated (a bounded amount);
 * - after a long gap the running is eased by the same rule as the Diary's
 *   break offer, and the workouts that carry the ease are never dropped;
 * - one realignment drops at most `MAX_REALIGN_DROPS` workouts, and a goal
 *   that needs more (or is too close for the distance) is reported as
 *   unrealistic, with the choices, instead of being forced.
 */

/** The most workouts one realignment may drop without the person insisting. */
export const MAX_REALIGN_DROPS = 6;
/** The most workouts one realignment may add when there is room to spare. */
export const MAX_REALIGN_STRETCH = 8;
/** Whole extra weeks a stretch may add before it only repeats single workouts. */
const MAX_STRETCH_WEEKS = 2;
/** Trailing weeks that may count as the taper. */
const MAX_TAPER_WEEKS = 3;
/** Fewest weeks before the goal day that suit each distance, while build is left. */
export const MIN_WEEKS_LEFT: Record<RaceDistance, number> = {
  '5k': 2,
  '10k': 3,
  half: 5,
  marathon: 8,
};
const LOWER_DISTANCE: Record<RaceDistance, RaceDistance | null> = {
  marathon: 'half',
  half: '10k',
  '10k': '5k',
  '5k': null,
};

export interface RealignInput {
  /** The program as stored, finished workouts included. */
  workouts: readonly ProgramWorkout[];
  /** Index of the next workout due. */
  next: number;
  schedule: ProgramSchedule;
  today: string;
  /** A program workout was already completed today. */
  doneToday: boolean;
  /** The person's local day of the last completed workout. */
  lastDoneDay: string | null;
  /** The local day the plan was last changed on. */
  lastAdjustedDay?: string | null;
  /** A walking program is not eased after a break. */
  activity?: 'run' | 'walk';
  /** The person's own plan: its week and day only number the workouts. */
  custom?: boolean;
  /** The race distance, when known; otherwise it is read from the longest run. */
  distance?: RaceDistance | null;
  /** Realign even where the cap on dropped workouts would stop it. */
  force?: boolean;
  /**
   * Whether spare time may be filled with repeated workouts. False once the
   * adjustment log records a stretch, so an accepted one is not offered again.
   */
  stretchable?: boolean;
}

export interface RealignPlan {
  preview: RunProgramRealignPreview;
  /** The whole program: the finished workouts as they were, then the rebuilt rest. */
  workouts: ProgramWorkout[];
  next: number;
}

export type RealignOutcome =
  | { state: 'unavailable'; reason: 'noGoalDay' | 'noRunDays' | 'finished' }
  | { state: 'fits' }
  | ({ state: 'plan' } & RealignPlan)
  | {
      state: 'unrealistic';
      reasons: (
        'noTimeLeft' | 'taperDoesNotFit' | 'tooMuchToDrop' | 'tooFewWeeks'
      )[];
      slots: number;
      workoutsLeft: number;
      weeksLeft: number;
      distance: RaceDistance | null;
      laterDay: string | null;
      lowerDistance: RaceDistance | null;
      options: RunProgramRealignOption[];
      continuePlan: RealignPlan | null;
    };

/**
 * The realignment input for a stored program: its workouts, place, run days
 * and goal day, with `today` and the day the plan was last changed on (both
 * the person's local days).
 */
export function realignInputFromProgram(
  program: Pick<
    RunProgramResponse,
    | 'program_id'
    | 'workouts'
    | 'next_index'
    | 'run_days'
    | 'start_date'
    | 'end_date'
    | 'last_done_date'
    | 'activity'
    | 'adjustment_log'
  >,
  options: {
    today: string;
    lastAdjustedDay?: string | null;
    distance?: RaceDistance | null;
    force?: boolean;
  }
): RealignInput {
  return {
    workouts: program.workouts,
    next: program.next_index,
    schedule: {
      runDays: program.run_days,
      startDay: program.start_date,
      endDay: program.end_date,
    },
    today: options.today,
    doneToday: program.last_done_date === options.today,
    lastDoneDay: program.last_done_date,
    lastAdjustedDay: options.lastAdjustedDay ?? null,
    activity: program.activity ?? programActivity(program.program_id),
    custom: isCustomProgramId(program.program_id),
    distance: options.distance ?? null,
    force: options.force ?? false,
    stretchable: isStretchable(program),
  };
}

/** Written in the summary of an applied stretch; the adjustment log is how a later realignment knows. */
export const REALIGN_STRETCH_NOTE = 'Filled spare time with repeated workouts.';

/** A plan whose log already records an accepted stretch gets no second offer. */
function isStretchable(program: Pick<RunProgramResponse, 'adjustment_log'>) {
  return !program.adjustment_log.some((entry) =>
    entry.summary.includes(REALIGN_STRETCH_NOTE)
  );
}

/** Thrown when a confirmed realignment no longer matches the plan the person saw. */
export class ProgramRealignStaleError extends ProgramAdjustError {}

/** The race distance a plan builds towards, read from its longest run; null for a walking plan. */
export function inferRealignDistance(
  workouts: readonly ProgramWorkout[],
  activity: 'run' | 'walk' = 'run'
): RaceDistance | null {
  if (activity === 'walk') return null;
  const peak = workouts.reduce(
    (max, w) => Math.max(max, runMinutes(w.plan)),
    0
  );
  if (peak <= 0) return null;
  if (peak <= 50) return '5k';
  if (peak <= 90) return '10k';
  if (peak <= 135) return 'half';
  return 'marathon';
}

interface Entry {
  /** Index within the remaining workouts. */
  i: number;
  block: number;
  minutes: number;
  signature: string;
}

const fnv = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const clone = (workout: ProgramWorkout): ProgramWorkout => ({
  ...workout,
  plan: JSON.parse(JSON.stringify(workout.plan)) as ProgramWorkout['plan'],
});

/** Which week of the remaining workouts each belongs to. */
function blockIds(
  remaining: readonly ProgramWorkout[],
  perWeek: number,
  custom: boolean
): number[] {
  if (!custom) {
    let id = -1;
    let last: number | null = null;
    return remaining.map((w) => {
      if (w.week !== last) {
        id++;
        last = w.week;
      }
      return id;
    });
  }
  // A free list has no real weeks: count them back from the last workout,
  // which is where a race plan's weeks line up.
  const n = remaining.length;
  const fromEnd = remaining.map((_, i) => Math.floor((n - 1 - i) / perWeek));
  const max = Math.max(0, ...fromEnd);
  return fromEnd.map((value) => max - value);
}

interface Drop {
  i: number;
  kind: 'dropped' | 'merged';
  reason: 'repeat' | 'lighter' | 'shortest';
}

function chooseDrops(
  entries: readonly Entry[],
  protectedUntil: number,
  need: number,
  perWeek: number,
  force: boolean
): { drops: Drop[]; shortfall: number } {
  const alive = new Set(entries.map((e) => e.i));
  const drops: Drop[] = [];
  const minKeep = perWeek >= 3 ? 2 : 1;
  const blocks = [...new Set(entries.map((e) => e.block))].sort(
    (a, b) => a - b
  );
  const inBlock = (block: number) =>
    entries.filter((e) => e.block === block && alive.has(e.i));
  const droppable = (e: Entry) => alive.has(e.i) && e.i >= protectedUntil;

  // The long run of each week: its longest workout, the last on a tie.
  const keyOf = new Map<number, Entry>();
  for (const block of blocks) {
    let key: Entry | undefined;
    for (const e of entries.filter((x) => x.block === block)) {
      if (!key || e.minutes >= key.minutes) key = e;
    }
    if (key) keyOf.set(block, key);
  }
  // A long run that is longer than every one before it carries the progression.
  const records = new Set<number>();
  let best = -1;
  for (const block of blocks) {
    const key = keyOf.get(block);
    if (key && key.minutes > best) {
      records.add(key.i);
      best = key.minutes;
    }
  }
  const isKey = (e: Entry) => keyOf.get(e.block)?.i === e.i;

  const drop = (e: Entry, d: Omit<Drop, 'i'>) => {
    alive.delete(e.i);
    drops.push({ i: e.i, ...d });
    need--;
  };

  // Pass 1 and 2, a week at a time so the base weeks share the loss.
  const rounds = (
    pick: (members: Entry[]) => Entry | undefined,
    reason: Drop['reason']
  ) => {
    let progressed = true;
    while (need > 0 && progressed) {
      progressed = false;
      for (const block of blocks) {
        if (need <= 0) break;
        const members = inBlock(block);
        if (members.length <= minKeep) continue;
        const choice = pick(members.filter((e) => droppable(e) && !isKey(e)));
        if (choice) {
          drop(choice, { kind: 'dropped', reason });
          progressed = true;
        }
      }
    }
  };
  // Repeats first: a workout identical to another of its week.
  rounds((candidates) => {
    return candidates.find((e) =>
      entries.some(
        (o) =>
          o.i !== e.i &&
          alive.has(o.i) &&
          o.block === e.block &&
          o.signature === e.signature
      )
    );
  }, 'repeat');
  // Then the shortest easy run.
  rounds(
    (candidates) =>
      [...candidates].sort((a, b) => a.minutes - b.minutes || a.i - b.i)[0],
    'shortest'
  );
  // Then fold a lighter week into its neighbour by dropping its long run.
  if (need > 0) {
    const lighter = blocks
      .map((b) => keyOf.get(b))
      .filter((k): k is Entry => !!k && !records.has(k.i))
      .sort((a, b) => a.minutes - b.minutes || a.i - b.i);
    for (const key of lighter) {
      if (need <= 0) break;
      if (!droppable(key) || inBlock(key.block).length <= 1) continue;
      drop(key, { kind: 'merged', reason: 'lighter' });
    }
  }
  if (need > 0 && force) {
    const rest = entries
      .filter(droppable)
      .sort(
        (a, b) =>
          Number(records.has(a.i)) - Number(records.has(b.i)) ||
          a.minutes - b.minutes ||
          a.i - b.i
      );
    for (const e of rest) {
      if (need <= 0) break;
      if (inBlock(e.block).length > 1)
        drop(e, { kind: 'dropped', reason: 'shortest' });
    }
    // Last resort: weeks may empty out, and the workouts that carry the ease go.
    const left = entries
      .filter((e) => alive.has(e.i))
      .sort((a, b) => a.minutes - b.minutes || a.i - b.i);
    for (const e of left) {
      if (need <= 0) break;
      drop(e, { kind: 'dropped', reason: 'shortest' });
    }
  }
  return { drops, shortfall: Math.max(0, need) };
}

/** Repeats base workouts to use up spare time; returns the new order and what was added. */
function stretch(
  entries: readonly Entry[],
  remaining: readonly ProgramWorkout[],
  add: number
): {
  order: { source: number; copy: boolean }[];
  added: { source: number; kind: 'added' | 'repeated' }[];
} {
  const blocks = [...new Set(entries.map((e) => e.block))].sort(
    (a, b) => a - b
  );
  const members = (block: number) => entries.filter((e) => e.block === block);
  const after = new Map<number, number[]>();
  const added: { source: number; kind: 'added' | 'repeated' }[] = [];
  let left = add;
  let weeks = 0;
  // Whole base weeks again first.
  for (const block of blocks) {
    const group = members(block);
    if (
      weeks >= MAX_STRETCH_WEEKS ||
      group.length === 0 ||
      left < group.length
    ) {
      break;
    }
    const last = group[group.length - 1];
    if (!last) break;
    after.set(last.i, [...(after.get(last.i) ?? []), ...group.map((g) => g.i)]);
    for (const g of group) added.push({ source: g.i, kind: 'added' });
    left -= group.length;
    weeks++;
  }
  // Then single workouts, the shortest of the earliest weeks.
  for (let round = 0; left > 0 && round < blocks.length; round++) {
    for (const block of blocks) {
      if (left <= 0) break;
      const group = members(block);
      const longest = Math.max(...group.map((g) => g.minutes));
      const pick = [...group]
        .filter((g) => g.minutes < longest || group.length === 1)
        .sort((a, b) => a.minutes - b.minutes || a.i - b.i)[round];
      if (!pick) continue;
      after.set(pick.i, [...(after.get(pick.i) ?? []), pick.i]);
      added.push({ source: pick.i, kind: 'repeated' });
      left--;
    }
  }
  const order: { source: number; copy: boolean }[] = [];
  remaining.forEach((_, i) => {
    order.push({ source: i, copy: false });
    for (const copy of after.get(i) ?? [])
      order.push({ source: copy, copy: true });
  });
  return { order, added };
}

const plural = (n: number, one: string, other: string): string =>
  `${n} ${n === 1 ? one : other}`;

function describe(preview: Omit<RunProgramRealignPreview, 'summary'>): string {
  const parts: string[] = [];
  if (preview.dropped > 0) {
    parts.push(`dropped ${plural(preview.dropped, 'workout', 'workouts')}`);
  }
  if (preview.merged > 0) {
    parts.push(
      `folded ${plural(preview.merged, 'lighter week', 'lighter weeks')} into the next`
    );
  }
  if (preview.added > 0) {
    parts.push(
      `added ${plural(preview.added, 'extra workout', 'extra workouts')} (repeated base weeks)`
    );
  }
  if (preview.repeated > 0) {
    parts.push(
      `repeated ${plural(preview.repeated, 'base workout', 'base workouts')}`
    );
  }
  const head = parts.length
    ? `Realigned to the goal day: ${parts.join(', ')}.`
    : 'Realigned to the goal day.';
  const stretched =
    preview.added + preview.repeated > 0 ? ` ${REALIGN_STRETCH_NOTE}` : '';
  const kept =
    preview.keptTail > 0 ? ' The taper and the final workout are kept.' : '';
  const eased = preview.eased
    ? ` Eased the next ${plural(preview.eased.count, 'workout', 'workouts')} by ${Math.abs(preview.eased.percent)}% after ${preview.eased.daysAway} days away.`
    : '';
  return `${head}${stretched}${kept}${eased}`.slice(0, 500);
}

/**
 * What realigning would do. `fits` when nothing needs to change; `plan` with
 * the rebuilt workouts when it can be done within the cap; `unrealistic` when
 * the goal day is too close for the plan or the distance, with the options.
 */
export function realignProgram(input: RealignInput): RealignOutcome {
  const { workouts, next, schedule, today, doneToday } = input;
  const total = workouts.length;
  if (next >= total) return { state: 'unavailable', reason: 'finished' };
  if (!schedule.endDay) return { state: 'unavailable', reason: 'noGoalDay' };
  const perWeek = schedule.runDays.length;
  if (perWeek === 0) return { state: 'unavailable', reason: 'noRunDays' };

  const activity = input.activity ?? 'run';
  const custom = input.custom ?? false;
  const remaining = workouts.slice(next);
  const n = remaining.length;
  const slots = countRunSlots({ schedule, today, doneToday });
  const blocks = blockIds(remaining, perWeek, custom);
  const entries: Entry[] = remaining.map((w, i) => ({
    i,
    block: blocks[i] ?? 0,
    minutes: runMinutes(w.plan),
    signature: JSON.stringify(w.plan.steps),
  }));

  // The taper and race: everything after the longest run before the final
  // workout, at most MAX_TAPER_WEEKS weeks, and always the final workout.
  let peakAt = -1;
  let peakMinutes = -1;
  for (let i = 0; i < total - 1; i++) {
    const minutes = runMinutes(
      workouts[i]?.plan ?? { style: 'runWalk', steps: [] }
    );
    if (minutes >= peakMinutes) {
      peakMinutes = minutes;
      peakAt = i;
    }
  }
  const lastBlock = blocks[n - 1] ?? 0;
  const firstTaperBlock = entries.find(
    (e) => e.block >= lastBlock - (MAX_TAPER_WEEKS - 1)
  );
  const tailStart = Math.min(
    n - 1,
    Math.max(peakAt + 1 - next, 0, firstTaperBlock?.i ?? 0)
  );
  const tail = n - tailStart;

  const breakOffer =
    activity === 'walk'
      ? null
      : suggestFromBreak({
          lastDoneDay: input.lastDoneDay,
          today,
          next,
          total,
          lastAdjustedDay: input.lastAdjustedDay ?? null,
        });
  const protectedUntil = breakOffer ? Math.min(breakOffer.count, tailStart) : 0;

  const beforeFinish = projectedFinishDay({
    total,
    next,
    schedule,
    today,
    doneToday,
  });
  const distance = input.distance ?? inferRealignDistance(workouts, activity);
  const weeksLeft = Math.ceil(slots / perWeek);
  const token = `${next}:${n}:${slots}:${fnv(JSON.stringify(remaining))}`;

  const finish = (
    sequence: ProgramWorkout[],
    changes: RunProgramRealignChange[],
    spare: number
  ): RealignPlan => {
    // Number the rest from where the first remaining workout sat.
    const first = remaining[0];
    const size = custom ? 7 : Math.max(1, ...workouts.map((w) => w.day + 1));
    const startPosition = custom
      ? next
      : (first?.week ?? 0) * size + (first?.day ?? 0);
    const numbered = sequence.map((w, i) => {
      const position = startPosition + i;
      return {
        ...w,
        week: Math.min(51, Math.floor(position / size)),
        day: position % size,
      };
    });
    let full: ProgramWorkout[] = [...workouts.slice(0, next), ...numbered];
    let eased: RunProgramRealignPreview['eased'] = null;
    if (breakOffer) {
      const state: ProgramState = { workouts: full, next };
      try {
        const result = adjustRunning(
          state,
          breakOffer.percent,
          breakOffer.count
        );
        full = result.workouts;
        eased = {
          daysAway: breakOffer.daysAway,
          percent: breakOffer.percent,
          count: breakOffer.count,
        };
      } catch (error) {
        if (!(error instanceof ProgramAdjustError)) throw error;
      }
    }
    const count = (kind: RunProgramRealignChange['kind']) =>
      changes.filter((c) => c.kind === kind).length;
    const base = {
      token,
      slots,
      before: { workouts: n, finishDay: beforeFinish },
      after: {
        workouts: full.length - next,
        finishDay: projectedFinishDay({
          total: full.length,
          next,
          schedule,
          today,
          doneToday,
        }),
      },
      changes: changes.slice(0, 100),
      dropped: count('dropped'),
      merged: count('merged'),
      repeated: count('repeated'),
      added: count('added'),
      spare,
      keptTail: tail,
      eased,
    };
    return {
      preview: { ...base, summary: describe(base) },
      workouts: full,
      next,
    };
  };

  const changeFor = (
    index: number,
    kind: RunProgramRealignChange['kind'],
    reason: RunProgramRealignChange['reason']
  ): RunProgramRealignChange => {
    const w = remaining[index];
    return {
      kind,
      reason,
      week: (w?.week ?? 0) + 1,
      run: (w?.day ?? 0) + 1,
      minutes: w ? planMinutes(w.plan) : 0,
      ...(w?.title ? { title: w.title } : {}),
    };
  };

  const compress = (need: number, force: boolean) => {
    const { drops, shortfall } = chooseDrops(
      entries.filter((e) => e.i < tailStart),
      protectedUntil,
      need,
      perWeek,
      force
    );
    const gone = new Set(drops.map((d) => d.i));
    const sequence = remaining.filter((_, i) => !gone.has(i)).map(clone);
    const changes = [...drops]
      .sort((a, b) => a.i - b.i)
      .map((d) => changeFor(d.i, d.kind, d.reason));
    return {
      plan: finish(sequence, changes, 0),
      shortfall,
      dropped: drops.length,
    };
  };

  if (n <= slots) {
    const extra = slots - n;
    // A few spare days are normal; offer to fill only a week or more of room.
    if (extra < perWeek || tailStart === 0 || input.stretchable === false) {
      return { state: 'fits' };
    }
    const add = Math.min(extra, MAX_REALIGN_STRETCH);
    const { order, added } = stretch(
      entries.filter((e) => e.i < tailStart),
      remaining,
      add
    );
    if (added.length === 0) return { state: 'fits' };
    const sequence = order.flatMap((o) => {
      const source = remaining[o.source];
      return source ? [clone(source)] : [];
    });
    const changes = added.map((a) => changeFor(a.source, a.kind, 'extraTime'));
    return {
      state: 'plan',
      ...finish(sequence, changes, extra - added.length),
    };
  }

  const need = n - slots;
  const reasons: Extract<RealignOutcome, { state: 'unrealistic' }>['reasons'] =
    [];
  let attempt: ReturnType<typeof compress> | null = null;
  if (slots === 0) reasons.push('noTimeLeft');
  else if (slots < tail) reasons.push('taperDoesNotFit');
  else {
    attempt = compress(need, false);
    if (attempt.shortfall > 0 || need > MAX_REALIGN_DROPS) {
      reasons.push('tooMuchToDrop');
    }
    if (distance && tailStart > 0 && weeksLeft < MIN_WEEKS_LEFT[distance]) {
      reasons.push('tooFewWeeks');
    }
  }

  const canForce = slots >= tail && slots > 0;
  if (reasons.length === 0 && attempt) {
    return { state: 'plan', ...attempt.plan };
  }
  const forced = canForce ? compress(need, true) : null;
  if (input.force && forced && forced.shortfall === 0) {
    return { state: 'plan', ...forced.plan };
  }
  const lowerDistance = distance ? LOWER_DISTANCE[distance] : null;
  const options: RunProgramRealignOption[] = [];
  if (beforeFinish) options.push('later');
  if (lowerDistance) options.push('lower');
  if (forced && forced.shortfall === 0) options.push('continue');
  return {
    state: 'unrealistic',
    reasons,
    slots,
    workoutsLeft: n,
    weeksLeft,
    distance,
    laterDay: beforeFinish,
    lowerDistance,
    options,
    continuePlan: forced && forced.shortfall === 0 ? forced.plan : null,
  };
}

/** The outcome as the API reports it: the preview without the rebuilt workouts. */
export function toRealignResult(
  outcome: RealignOutcome
): RunProgramRealignResult {
  switch (outcome.state) {
    case 'plan':
      return { state: 'plan', preview: outcome.preview };
    case 'unrealistic': {
      const { continuePlan, ...rest } = outcome;
      return { ...rest, continuePreview: continuePlan?.preview ?? null };
    }
    default:
      return outcome;
  }
}

/**
 * The change to save for a confirmed realignment. Throws a
 * `ProgramAdjustError` when there is nothing to realign or the goal needs the
 * person's say-so (`force`), and `ProgramRealignStaleError` when `token` is
 * given and the plan is no longer the one the person saw.
 */
export function applyRealign(
  input: RealignInput,
  token?: string
): { workouts: ProgramWorkout[]; next: number; summary: string } {
  const outcome = realignProgram(input);
  if (outcome.state === 'plan') {
    if (token && token !== outcome.preview.token) {
      throw new ProgramRealignStaleError(
        'The plan changed since you looked at it. Review the realignment again.'
      );
    }
    return {
      workouts: outcome.workouts,
      next: outcome.next,
      summary: outcome.preview.summary,
    };
  }
  if (outcome.state === 'unrealistic') {
    throw new ProgramAdjustError(
      'The goal day is not realistic for this plan. Move the goal day, choose a shorter race, or realign anyway.'
    );
  }
  if (outcome.state === 'unavailable') {
    throw new ProgramAdjustError(
      outcome.reason === 'noGoalDay'
        ? 'Set a goal day first.'
        : outcome.reason === 'noRunDays'
          ? 'Choose your workout days first.'
          : 'The program is finished: nothing to realign.'
    );
  }
  throw new ProgramAdjustError('The plan already fits the goal day.');
}
