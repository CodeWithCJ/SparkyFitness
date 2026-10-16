import { buildIntervalPlan } from '@workspace/shared';
import {
  INITIAL_COACHING_STATE,
  nextCoachingCues,
} from '../../src/utils/coachingCues';

// 2 min warm-up, work 3 / recovery 2 / work 3, 3 min cool-down = 13 min.
const plan = buildIntervalPlan({
  style: 'fastEasy',
  warmupSeconds: 120,
  workSeconds: 180,
  recoverySeconds: 120,
  rounds: 2,
  cooldownSeconds: 180,
});

const run = (
  elapsedSeconds: number,
  overrides: Partial<Parameters<typeof nextCoachingCues>[0]> = {}
) =>
  nextCoachingCues({
    elapsedSeconds,
    plan,
    checkInMinutes: 0,
    state: INITIAL_COACHING_STATE,
    ...overrides,
  });

describe('step warnings', () => {
  it('warns ten seconds before a step ends and names what is next', () => {
    const { cues, state } = run(110);
    expect(cues).toEqual([
      { kind: 'stepWarning', next: expect.objectContaining({ kind: 'work' }) },
    ]);
    expect(state.warnedStep).toBe(0);
  });

  it('warns once per step', () => {
    const first = run(112);
    const again = run(115, { state: first.state });
    expect(again.cues).toEqual([]);
  });

  it('says nothing earlier in the step', () => {
    expect(run(60).cues).toEqual([]);
  });

  it('skips steps too short to warn about', () => {
    const short = buildIntervalPlan({
      style: 'runWalk',
      warmupSeconds: 0,
      workSeconds: 20,
      recoverySeconds: 20,
      rounds: 2,
      cooldownSeconds: 0,
    });
    expect(run(15, { plan: short }).cues).toEqual([]);
  });

  it('has no next step to name on the last one', () => {
    const { cues } = run(13 * 60 - 5);
    expect(cues[0]).toEqual({ kind: 'stepWarning', next: null });
  });
});

describe('halfway and the last minute', () => {
  it('calls halfway once past the middle of a long enough plan', () => {
    const first = run(6.5 * 60 + 1);
    expect(first.cues).toEqual([{ kind: 'halfway' }]);
    expect(run(7 * 60, { state: first.state }).cues).toEqual([]);
  });

  it('calls the last minute', () => {
    const first = run(12 * 60 + 5);
    expect(first.cues.map((c) => c.kind)).toContain('lastMinute');
    expect(first.state.lastMinute).toBe(true);
  });

  it('gives short plans neither', () => {
    const tiny = buildIntervalPlan({
      style: 'runWalk',
      warmupSeconds: 0,
      workSeconds: 60,
      recoverySeconds: 60,
      rounds: 1,
      cooldownSeconds: 0,
    });
    expect(run(60, { plan: tiny }).cues.map((c) => c.kind)).not.toContain(
      'halfway'
    );
  });

  it('puts the step warning ahead of the others', () => {
    // 6:50 is both 10 s before the end of the recovery and past halfway.
    const { cues } = run(6 * 60 + 50);
    expect(cues[0]?.kind).toBe('stepWarning');
    expect(cues.map((c) => c.kind)).toContain('halfway');
  });
});

describe('check-ins', () => {
  it('speaks every interval and not before', () => {
    expect(run(299, { plan: null, checkInMinutes: 5 }).cues).toEqual([]);
    const first = run(300, { plan: null, checkInMinutes: 5 });
    expect(first.cues).toEqual([{ kind: 'checkIn', minutes: 5 }]);
    expect(
      run(301, { plan: null, checkInMinutes: 5, state: first.state }).cues
    ).toEqual([]);
    expect(
      run(600, { plan: null, checkInMinutes: 5, state: first.state }).cues
    ).toEqual([{ kind: 'checkIn', minutes: 10 }]);
  });

  it('says only the latest after a long gap', () => {
    const { cues, state } = run(1300, { plan: null, checkInMinutes: 10 });
    expect(cues).toEqual([{ kind: 'checkIn', minutes: 20 }]);
    expect(state.checkIns).toBe(2);
  });

  it('is silent when off', () => {
    expect(run(3000, { plan: null, checkInMinutes: 0 }).cues).toEqual([]);
  });
});

describe('step countdown', () => {
  it('counts down the last three seconds of a step', () => {
    const { cues, state } = run(117);
    expect(cues).toEqual([{ kind: 'stepCountdown' }]);
    expect(state.countdownStep).toBe(0);
  });

  it('counts down once per step and says nothing earlier', () => {
    expect(run(112).cues.map((c) => c.kind)).toEqual(['stepWarning']);
    const first = run(117);
    expect(run(118, { state: first.state }).cues).toEqual([]);
  });

  it('drops the ten-second warning it makes stale', () => {
    // First tick of the app after a gap: both are due, only the countdown speaks.
    const { cues, state } = run(118);
    expect(cues.map((c) => c.kind)).toEqual(['stepCountdown']);
    expect(state.warnedStep).toBe(0);
  });

  it('leaves out steps too short to count down', () => {
    const short = buildIntervalPlan({
      style: 'runWalk',
      warmupSeconds: 0,
      workSeconds: 20,
      recoverySeconds: 20,
      rounds: 2,
      cooldownSeconds: 0,
    });
    expect(run(18, { plan: short }).cues).toEqual([]);
  });

  it('counts down the end of the last step too', () => {
    const total = 120 + 180 + 120 + 180 + 180;
    expect(run(total - 2).cues.map((c) => c.kind)).toContain('stepCountdown');
  });

  it('reads a state saved before the countdown existed', () => {
    const old = {
      checkIns: 0,
      warnedStep: -1,
      halfway: false,
      lastMinute: false,
    };
    expect(run(117, { state: old as never }).cues.map((c) => c.kind)).toEqual([
      'stepCountdown',
    ]);
  });
});

describe('distance milestones', () => {
  const at = (meters: number | null, state = INITIAL_COACHING_STATE) =>
    run(1500, { plan: null, distanceMeters: meters, state });

  it('says 5K, 10K, a half marathon and a marathon once each', () => {
    const first = at(5003);
    expect(first.cues).toEqual([{ kind: 'milestone', meters: 5000 }]);
    expect(at(5600, first.state).cues).toEqual([]);
    expect(at(10002, first.state).cues).toEqual([
      { kind: 'milestone', meters: 10000 },
    ]);
    expect(at(21100).cues).toEqual([{ kind: 'milestone', meters: 21097.5 }]);
    expect(at(42200).cues).toEqual([{ kind: 'milestone', meters: 42195 }]);
  });

  it('says only the furthest after a gap and marks the rest said', () => {
    const { cues, state } = at(10500);
    expect(cues).toEqual([{ kind: 'milestone', meters: 10000 }]);
    expect(state.milestones).toBe(2);
  });

  it('is silent with no distance (indoors) or before 5K', () => {
    expect(at(null).cues).toEqual([]);
    expect(at(4999).cues).toEqual([]);
  });
});

describe('a plan with distance steps', () => {
  // 400 m work (expected 144 s), 60 s easy, 400 m work.
  const distancePlan = buildIntervalPlan({
    style: 'fastEasy',
    warmupSeconds: 0,
    workSeconds: 144,
    workMeters: 400,
    recoverySeconds: 60,
    rounds: 2,
    cooldownSeconds: 0,
  });
  const progress = {
    cursor: { index: 0, startSeconds: 0, startMeters: 0 },
    meters: 100,
  };

  it('gives no warning or countdown for a step that ends on distance', () => {
    // At its expected time the step has not ended: 100 m recorded.
    const { cues } = run(140, { plan: distancePlan, progress });
    expect(cues).toEqual([]);
  });

  it('calls no halfway or last minute, since the length is a guess', () => {
    const { cues } = run(distancePlan.steps.length * 200, {
      plan: distancePlan,
      progress,
    });
    expect(cues.map((cue) => cue.kind)).not.toContain('halfway');
    expect(cues.map((cue) => cue.kind)).not.toContain('lastMinute');
  });
});
