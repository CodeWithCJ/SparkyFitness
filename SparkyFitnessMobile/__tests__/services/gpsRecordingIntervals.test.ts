import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { Fitness: 3 },
  hasServicesEnabledAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/haptics', () => ({
  fireImpactHaptic: jest.fn(),
}));
jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  endRecordingCues: jest.fn(),
  stopRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
}));

import { fireImpactHaptic } from '../../src/services/haptics';
import { speakRecordingCue } from '../../src/services/recordingCues';
import {
  finishRecording,
  markLap,
  ingestFixes,
  pauseRecording,
  resetRecordingStateForTests,
  resumeRecording,
  setRecordingCheckIn,
  startRecording,
  tickIntervals,
  type RecordingSession,
} from '../../src/services/gpsRecordingService';
import {
  buildIntervalPlan,
  findProgram,
  planTotalSeconds,
  type IntervalPlan,
} from '@workspace/shared';

const notification = { title: 'Recording', body: 'Tracking' };
const T0 = new Date(2026, 9, 10, 8, 0, 0).getTime();

const plan = buildIntervalPlan({
  style: 'runWalk',
  warmupSeconds: 0,
  workSeconds: 60,
  recoverySeconds: 90,
  rounds: 2,
  cooldownSeconds: 0,
});

async function stored(): Promise<RecordingSession | null> {
  const raw = await AsyncStorage.getItem('@SparkyFitness/gpsRecording/session');
  return raw ? (JSON.parse(raw) as RecordingSession) : null;
}

const at = (seconds: number) => jest.setSystemTime(T0 + seconds * 1000);

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  at(0);
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetRecordingStateForTests();
  const location = Location as jest.Mocked<typeof Location>;
  location.hasServicesEnabledAsync.mockResolvedValue(true);
  location.requestForegroundPermissionsAsync.mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  location.startLocationUpdatesAsync.mockResolvedValue(undefined);
});

afterEach(() => jest.useRealTimers());

describe('interval plans', () => {
  test('start the first step at once and cue it', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: plan,
      notification,
    });
    expect((await stored())?.intervals?.cued).toBe(0);
    expect(speakRecordingCue).toHaveBeenCalledTimes(1);
    expect(speakRecordingCue).toHaveBeenCalledWith(
      expect.stringContaining('Run')
    );
    expect(fireImpactHaptic).toHaveBeenCalledTimes(1);
  });

  test('mark a lap at each step boundary, not when it was noticed', async () => {
    await startRecording({ activity: 'run', intervals: plan, notification });
    at(62); // two seconds late
    await tickIntervals();
    const session = await stored();
    expect(session?.intervals?.cued).toBe(1);
    expect(session?.laps).toEqual([T0 + 60_000]);
  });

  test('do not repeat a step that was already announced', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: plan,
      notification,
    });
    at(10);
    await tickIntervals();
    await tickIntervals();
    expect(speakRecordingCue).toHaveBeenCalledTimes(1);
  });

  test('say only the latest of several steps passed together', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: plan,
      notification,
    });
    jest.mocked(speakRecordingCue).mockClear();
    at(300); // past all but the end
    await tickIntervals();
    const session = await stored();
    expect(session?.laps).toHaveLength(3);
    expect(speakRecordingCue).toHaveBeenCalledTimes(1);
    expect(speakRecordingCue).toHaveBeenCalledWith(
      expect.stringContaining('complete')
    );
  });

  test('a manual lap does not swallow the next step boundary', async () => {
    await startRecording({ activity: 'run', intervals: plan, notification });
    at(58);
    await markLap();
    at(62);
    await tickIntervals();
    expect((await stored())?.laps).toEqual([T0 + 58_000, T0 + 60_000]);
  });

  test('a pause after a missed boundary does not shift that lap', async () => {
    await startRecording({ activity: 'run', intervals: plan, notification });
    at(70); // the 60 s step ended, and nothing ticked
    await pauseRecording();
    at(90);
    await resumeRecording({ title: 'Recording', body: 'Tracking' });
    at(95);
    await tickIntervals();
    expect((await stored())?.laps).toEqual([T0 + 60_000]);
  });

  test('stop counting while paused', async () => {
    await startRecording({ activity: 'run', intervals: plan, notification });
    at(30);
    await pauseRecording();
    at(300); // a long pause
    await tickIntervals();
    expect((await stored())?.intervals?.cued).toBe(0);
    await resumeRecording({ title: 'Recording', body: 'Tracking' });
    at(300 + 20); // 50 s of running in total
    await tickIntervals();
    expect((await stored())?.intervals?.cued).toBe(0);
    at(300 + 40); // 70 s
    await tickIntervals();
    expect((await stored())?.intervals?.cued).toBe(1);
  });

  test('ignore an invalid plan', async () => {
    await startRecording({
      activity: 'run',
      intervals: { style: 'runWalk', steps: [] },
      notification,
    });
    expect((await stored())?.intervals).toBeUndefined();
  });
});

// Roughly one metre of latitude.
const DEG_PER_METER = 1 / 111_195;
const fix = (seconds: number, metersNorth: number) => ({
  t: T0 + seconds * 1000,
  lat: 51.5 + metersNorth * DEG_PER_METER,
  lon: -0.12,
  hacc: 5,
});

/** A fix every 5 s, 20 m apart (4 m/s), from `fromSecond` up to `toSecond`. */
const runFixes = (fromSecond: number, toSecond: number) =>
  Array.from({ length: (toSecond - fromSecond) / 5 + 1 }, (_, i) =>
    fix(fromSecond + i * 5, (fromSecond + i * 5) * 4)
  );

// 400 m fast, 60 s easy, 400 m fast.
const distancePlan: IntervalPlan = buildIntervalPlan({
  style: 'fastEasy',
  warmupSeconds: 0,
  workSeconds: 90,
  workMeters: 400,
  recoverySeconds: 60,
  rounds: 2,
  cooldownSeconds: 0,
});

describe('distance steps', () => {
  test('end a distance step on recorded distance, not its expected time', async () => {
    await startRecording({
      activity: 'run',
      intervals: distancePlan,
      notification,
    });
    // 90 s is the step's expected time; at 4 m/s it is only 360 m in.
    at(90);
    await ingestFixes(runFixes(0, 90));
    expect((await stored())?.intervals?.cued).toBe(0);
    at(105);
    await ingestFixes(runFixes(95, 105)); // 420 m
    const session = await stored();
    expect(session?.intervals?.cued).toBe(1);
    expect(session?.intervals?.cursor?.startMeters).toBe(400);
    expect(session?.laps).toHaveLength(1);
  });

  test('time the recovery after a distance step from when the distance was reached', async () => {
    await startRecording({
      activity: 'run',
      intervals: distancePlan,
      notification,
    });
    at(100);
    await ingestFixes(runFixes(0, 100)); // 400 m at 100 s
    expect((await stored())?.intervals?.cursor?.startSeconds).toBe(100);
    at(150);
    await tickIntervals();
    expect((await stored())?.intervals?.cued).toBe(1);
    at(160);
    await tickIntervals();
    expect((await stored())?.intervals?.cued).toBe(2);
  });

  test('start the next step from the fix that crossed the distance, not the batch end', async () => {
    await startRecording({
      activity: 'run',
      intervals: distancePlan,
      notification,
    });
    // One late batch: 400 m is reached at 100 s but the batch ends at 130 s.
    at(130);
    await ingestFixes(runFixes(0, 130));
    const cursor = (await stored())?.intervals?.cursor;
    expect(cursor?.index).toBe(1);
    expect(cursor?.startSeconds).toBe(100);
  });

  test('say how far the step is and when 100 m is left', async () => {
    const long = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 0,
      workSeconds: 90,
      workMeters: 400,
      recoverySeconds: 0,
      rounds: 1,
      cooldownSeconds: 0,
    });
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: long,
      notification,
    });
    expect(speakRecordingCue).toHaveBeenLastCalledWith(
      expect.stringContaining('400 meters')
    );
    jest.mocked(speakRecordingCue).mockClear();
    at(70);
    await ingestFixes(runFixes(0, 70)); // 280 m: 120 left
    expect(speakRecordingCue).not.toHaveBeenCalledWith(
      expect.stringContaining('to go')
    );
    at(80);
    await ingestFixes(runFixes(75, 80)); // 320 m: 80 left
    await tickIntervals();
    const toGo = jest
      .mocked(speakRecordingCue)
      .mock.calls.filter(([text]) => text.includes('to go'));
    expect(toGo).toEqual([['100 meters to go.']]);
  });

  test('leave a distance plan off an indoor session', async () => {
    await startRecording({
      activity: 'run',
      intervals: distancePlan,
      indoor: true,
      notification,
    });
    expect((await stored())?.intervals).toBeUndefined();
  });
});

describe('coaching audio', () => {
  const spoken = () =>
    (speakRecordingCue as jest.Mock).mock.calls.map(([text]) => text as string);

  test('speaks a time check-in at each interval, indoors too', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      checkInMinutes: 5,
      notification,
    });
    (speakRecordingCue as jest.Mock).mockClear();
    at(299);
    await tickIntervals();
    expect(spoken()).toEqual([]);
    at(300);
    await tickIntervals();
    expect(spoken()).toEqual(['5 minutes done.']);
    at(301);
    await tickIntervals();
    expect(spoken()).toHaveLength(1);
  });

  test('stays quiet without voice cues', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      checkInMinutes: 5,
      notification,
    });
    at(305);
    await tickIntervals();
    expect(speakRecordingCue).not.toHaveBeenCalled();
  });

  test('counts down the last three seconds of a step in one cue', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: buildIntervalPlan({
        style: 'fastEasy',
        warmupSeconds: 0,
        workSeconds: 60,
        recoverySeconds: 60,
        rounds: 1,
        cooldownSeconds: 0,
      }),
      notification,
    });
    jest.mocked(speakRecordingCue).mockClear();
    at(56);
    await tickIntervals();
    expect(spoken()).toEqual(['Ten seconds. Next, Easy.']);
    at(57);
    await tickIntervals();
    expect(spoken()).toEqual(['Ten seconds. Next, Easy.', 'Three. Two. One.']);
    at(58);
    await tickIntervals();
    expect(spoken()).toHaveLength(2);
  });

  test('warns ten seconds before a step ends', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: plan,
      notification,
    });
    (speakRecordingCue as jest.Mock).mockClear();
    at(50);
    await tickIntervals();
    expect(spoken()).toEqual(['Ten seconds. Next, Walk.']);
    at(52);
    await tickIntervals();
    expect(spoken()).toHaveLength(1);
  });

  test('changing the interval mid-run counts the time already run as said', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      notification,
    });
    at(330);
    await setRecordingCheckIn(5);
    (speakRecordingCue as jest.Mock).mockClear();
    at(331);
    await tickIntervals();
    expect(spoken()).toEqual([]);
    at(600);
    await tickIntervals();
    expect(spoken()).toEqual(['10 minutes done.']);
  });
});

describe('program workout cues', () => {
  const program = findProgram('beginner5k')!;
  const index = 4;
  const workout = program.workouts[index]!;
  const spoken = () =>
    (speakRecordingCue as jest.Mock).mock.calls.map(([text]) => text as string);

  test('the first cue gives the place in the program, then the step', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: workout.plan,
      program: { id: 'beginner5k', index },
      notification,
    });
    const minutes = Math.round(planTotalSeconds(workout.plan) / 60);
    expect(spoken()[0]).toMatch(
      new RegExp(
        `^Week ${workout.week + 1}, run ${workout.day + 1}\\. ${minutes} minutes?\\. `
      )
    );
    expect(spoken()[0]).not.toContain('Eased');
  });

  test('says when today was eased from the original', async () => {
    const eased = {
      ...workout.plan,
      steps: workout.plan.steps.map((step) =>
        step.kind === 'work'
          ? { ...step, seconds: Math.round(step.seconds * 0.7) }
          : step
      ),
    };
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: eased,
      program: { id: 'beginner5k', index },
      notification,
    });
    expect(spoken()[0]).toContain('Eased for today.');
  });

  test('a plain recording gets no program line', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: plan,
      notification,
    });
    expect(spoken()[0]).not.toContain('Week');
  });

  test('finishing the last step says what is next', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: workout.plan,
      program: { id: 'beginner5k', index },
      notification,
    });
    at(planTotalSeconds(workout.plan));
    await tickIntervals();
    (speakRecordingCue as jest.Mock).mockClear();
    await finishRecording();
    const next = program.workouts[index + 1]!;
    expect(spoken()).toEqual([
      `Workout ${index + 1} of ${program.workouts.length} done. Next up, Week ${next.week + 1}, run ${next.day + 1}.`,
    ]);
  });

  test('stopping during the last step does not claim the workout', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: workout.plan,
      program: { id: 'beginner5k', index },
      notification,
    });
    at(planTotalSeconds(workout.plan) - 5);
    await tickIntervals();
    (speakRecordingCue as jest.Mock).mockClear();
    await finishRecording();
    expect(spoken().join(' ')).not.toContain('done. Next up');
  });

  test('stopping early does not claim the workout', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      intervals: workout.plan,
      program: { id: 'beginner5k', index },
      notification,
    });
    at(30);
    (speakRecordingCue as jest.Mock).mockClear();
    await finishRecording();
    expect(spoken().join(' ')).not.toContain('done. Next up');
  });
});
