import {
  INITIAL_AUTO_PAUSE_STATE,
  stepAutoPause,
  type AutoPauseAction,
  type AutoPauseState,
} from '../../src/utils/autoPause';
import type { RawFix } from '../../src/utils/gpsRecording';

const T0 = 1_000_000;
const fixAt = (seconds: number, speed: number | null, hacc = 5): RawFix => ({
  t: T0 + seconds * 1000,
  lat: 51.5,
  lon: -0.12,
  speed,
  hacc,
});

function run(
  fixes: RawFix[],
  paused: boolean,
  activity: 'walk' | 'run' | 'ride' = 'run',
  from: AutoPauseState = INITIAL_AUTO_PAUSE_STATE
): { actions: AutoPauseAction[]; state: AutoPauseState } {
  let state = from;
  const actions: AutoPauseAction[] = [];
  for (const fix of fixes) {
    const step = stepAutoPause(state, fix, activity, paused);
    state = step.state;
    actions.push(step.action);
  }
  return { actions, state };
}

describe('stepAutoPause', () => {
  it('pauses after standing still long enough, dated to when they stopped', () => {
    const { actions } = run(
      [0, 3, 6, 9].map((s) => fixAt(s, 0)),
      false
    );
    expect(actions.slice(0, 3).every((a) => a.type === 'none')).toBe(true);
    expect(actions[3]).toEqual({ type: 'pause', at: T0 });
  });

  it('does not pause for a brief stop', () => {
    const { actions } = run(
      [fixAt(0, 0), fixAt(4, 0), fixAt(6, 3), fixAt(12, 0), fixAt(16, 0)],
      false
    );
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('uses speed worked out from position when the receiver gives none', () => {
    const moved = (s: number, metersNorth: number): RawFix => ({
      t: T0 + s * 1000,
      lat: 51.5 + metersNorth / 111_194.9,
      lon: -0.12,
      speed: -1,
      hacc: 5,
    });
    const walking = run(
      [0, 2, 4, 6, 8, 10].map((s) => moved(s, s * 3)),
      false
    );
    expect(walking.actions.every((a) => a.type === 'none')).toBe(true);
    const stopped = run(
      [0, 5, 10, 14].map((s) => moved(s, 0)),
      false
    );
    expect(stopped.actions[3]).toEqual({ type: 'pause', at: T0 + 5000 });
  });

  it('sees a stop when the phone gives no speed and the position wanders', () => {
    // iOS reports -1 for speed while standing still; the position drifts a few
    // metres from fix to fix, which neighbouring fixes would read as a jog.
    const drift = [0, 3, -2, 4, -3, 2, -4, 3, -1, 4, -2, 3, 0, -3, 2, -4];
    const wandering = drift.map((meters, i): RawFix => ({
      t: T0 + i * 1000,
      lat: 51.5 + meters / 111_194.9,
      lon: -0.12,
      speed: -1,
      hacc: 5,
    }));
    const { actions } = run(wandering, false);
    expect(actions.some((a) => a.type === 'pause')).toBe(true);
  });

  it('does not take a runner without a speed reading for standing still', () => {
    // 3 m/s with no Doppler speed and a 10 m accuracy radius.
    const running = Array.from({ length: 30 }, (_, i): RawFix => ({
      t: T0 + i * 1000,
      lat: 51.5 + (i * 3) / 111_194.9,
      lon: -0.12,
      speed: -1,
      hacc: 10,
    }));
    const { actions } = run(running, false);
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('does not take a walker without a speed reading for standing still', () => {
    const walking = Array.from({ length: 40 }, (_, i): RawFix => ({
      t: T0 + i * 1000,
      lat: 51.5 + (i * 1.4) / 111_194.9,
      lon: -0.12,
      speed: -1,
      hacc: 8,
    }));
    const { actions } = run(walking, false, 'walk');
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('ignores fixes too inaccurate to judge speed', () => {
    const { actions } = run(
      [0, 5, 10, 15].map((s) => fixAt(s, 0, 80)),
      false
    );
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('resumes after sustained movement, dated to when it began', () => {
    const { actions } = run(
      [0, 1, 2, 3].map((s) => fixAt(s, 3)),
      true
    );
    expect(actions[2].type).toBe('none');
    expect(actions[3]).toEqual({ type: 'resume', at: T0 });
  });

  it('stays paused through a shuffle below the resume speed', () => {
    const { actions } = run(
      [0, 1, 2, 3, 4].map((s) => fixAt(s, 1)),
      true
    );
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('forgets a movement burst that does not last', () => {
    const { actions } = run(
      [fixAt(0, 3), fixAt(1, 3), fixAt(2, 0), fixAt(3, 3), fixAt(5, 3)],
      true
    );
    expect(actions.every((a) => a.type === 'none')).toBe(true);
  });

  it('is quicker to react on a ride than a walk', () => {
    const ride = run(
      [0, 6].map((s) => fixAt(s, 0)),
      false,
      'ride'
    );
    expect(ride.actions[1].type).toBe('pause');
    const walk = run(
      [0, 6].map((s) => fixAt(s, 0)),
      false,
      'walk'
    );
    expect(walk.actions[1].type).toBe('none');
  });
});
