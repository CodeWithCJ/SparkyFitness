import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

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
jest.mock('../../src/services/stepCounter', () => ({
  captureStepCounterBaseline: jest.fn(async () => null),
}));
jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  endRecordingCues: jest.fn(),
  stopRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
}));

import { captureStepCounterBaseline } from '../../src/services/stepCounter';
import {
  beginRecordingCues,
  endRecordingCues,
  speakRecordingCue,
} from '../../src/services/recordingCues';
import {
  GPS_RECORDING_TASK_NAME,
  RecordingPermissionError,
  addHeartRateSamples,
  getHeartRateSamples,
  discardRecording,
  elapsedSeconds,
  finishRecording,
  ingestFixes,
  markLap,
  markRecordingSaved,
  pauseRecording,
  resetRecordingStateForTests,
  resumeRecording,
  startRecording,
  type RecordingSession,
  setRecordingAudioCues,
  setRecordingAutoPause,
} from '../../src/services/gpsRecordingService';

const mockedBaseline = jest.mocked(captureStepCounterBaseline);
const mockedLocation = Location as jest.Mocked<typeof Location>;
const notification = { title: 'Recording', body: 'Tracking' };
const DEG_PER_METER = 1 / 111_194.9;
const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);

const fix = (seconds: number, metersNorth: number) => ({
  t: T0 + seconds * 1000,
  lat: 51.5 + metersNorth * DEG_PER_METER,
  lon: -0.12,
  hacc: 5,
});

// Captured at import: the task has to be registered at module scope.
const taskCall = (TaskManager.defineTask as jest.Mock).mock.calls.find(
  ([name]) => name === GPS_RECORDING_TASK_NAME
);

async function storedSession(): Promise<RecordingSession | null> {
  const raw = await AsyncStorage.getItem('@SparkyFitness/gpsRecording/session');
  return raw ? (JSON.parse(raw) as RecordingSession) : null;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockedBaseline.mockResolvedValue(null);
  await AsyncStorage.clear();
  resetRecordingStateForTests();
  mockedLocation.hasServicesEnabledAsync.mockResolvedValue(true);
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
  mockedLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);
  mockedLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);
});

describe('starting', () => {
  it('registers the location task at module scope', () => {
    expect(taskCall).toBeDefined();
  });

  it('asks for while-using permission and starts a foreground-service task', async () => {
    await startRecording({ activity: 'run', notification });

    expect(mockedLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({
        // Auto-pause is off, so standing still does not need a fix.
        distanceInterval: 2,
        showsBackgroundLocationIndicator: true,
        foregroundService: expect.objectContaining({
          notificationTitle: 'Recording',
          killServiceOnDestroy: false,
        }),
      })
    );
    expect((await storedSession())?.status).toBe('recording');
  });

  it('drops the distance filter only while auto-pause is on', async () => {
    await startRecording({
      activity: 'run',
      autoPause: true,
      notification,
    });

    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 0 })
    );
  });

  it('does not record when permission is denied', async () => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
    } as Location.LocationPermissionResponse);

    await expect(
      startRecording({ activity: 'walk', notification })
    ).rejects.toMatchObject({ reason: 'denied' });
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(await storedSession()).toBeNull();
  });

  it('reports location services being off', async () => {
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(
      startRecording({ activity: 'walk', notification })
    ).rejects.toBeInstanceOf(RecordingPermissionError);
  });

  it('leaves no session behind when the task fails to start', async () => {
    mockedLocation.startLocationUpdatesAsync.mockRejectedValue(
      new Error('boom')
    );
    await expect(
      startRecording({ activity: 'ride', notification })
    ).rejects.toThrow('boom');
    expect(await storedSession()).toBeNull();
  });
});

describe('collecting fixes', () => {
  it('picks the track back up after the app is killed and relaunched', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 15), fix(10, 30)]);

    // A fresh JS context: nothing in memory, everything on disk.
    resetRecordingStateForTests();
    await ingestFixes([fix(15, 45)]);

    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(4);
    expect((await storedSession())?.status).toBe('recording');
  });

  it('drops glitches and keeps the rest', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 5000), fix(10, 30)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(2);
  });

  it('chunks a long track', async () => {
    await startRecording({ activity: 'ride', notification });
    const fixes = Array.from({ length: 250 }, (_, i) => fix(i * 5, i * 20));
    await ingestFixes(fixes);
    const chunks = await Promise.all(
      [0, 1, 2, 3].map((i) =>
        AsyncStorage.getItem(`@SparkyFitness/gpsRecording/chunk/${i}`)
      )
    );
    expect(JSON.parse(chunks[0] as string)).toHaveLength(100);
    expect(JSON.parse(chunks[1] as string)).toHaveLength(100);
    expect(JSON.parse(chunks[2] as string)).toHaveLength(50);
    expect(chunks[3]).toBeNull();
  });

  it('ignores fixes while paused', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0)]);
    await pauseRecording();
    await ingestFixes([fix(5, 15)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('keeps the location task running through a pause', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    expect(mockedLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    expect((await storedSession())?.status).toBe('paused');
  });

  it('resumes without starting the task again when it is still running', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    await resumeRecording(notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    expect((await storedSession())?.status).toBe('recording');
  });

  it('starts the task again on resume when the OS dropped it', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    await resumeRecording(notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 2 })
    );
  });

  it('keeps fixes coming on resume when auto-pause is on and the OS dropped the task', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await pauseRecording();
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    await resumeRecording(notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 0 })
    );
  });

  it('starts a new segment on resume so the pause is not counted as distance', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([fix(0, 0), fix(5, 15)]);
    await pauseRecording();
    await resumeRecording(notification);
    // Far from the last fix: a jump, but across a pause.
    await ingestFixes([fix(600, 5000)]);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    const stored = JSON.parse(raw as string) as { seg: number }[];
    expect(stored.map((p) => p.seg)).toEqual([0, 0, 1]);
  });
});

describe('finishing and discarding', () => {
  it('stops collecting on finish and keeps the track for saving', async () => {
    await startRecording({ activity: 'walk', notification });
    await ingestFixes([fix(0, 0), fix(5, 8)]);
    await finishRecording();
    await ingestFixes([fix(10, 16)]);

    const session = await storedSession();
    expect(session?.status).toBe('finished');
    expect(session?.finishedAt).not.toBeNull();
    expect(session?.hadPause).toBeUndefined();
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    expect(JSON.parse(raw as string)).toHaveLength(2);
  });

  it('remembers a pause that ended the recording even though it is not added to pausedMs', async () => {
    await startRecording({ activity: 'walk', notification });
    await pauseRecording();
    await finishRecording();

    const stored = await storedSession();
    expect(stored?.pausedMs).toBe(0);
    expect(stored?.hadPause).toBe(true);
  });

  it('remembers a pause that was resumed before the finish', async () => {
    await startRecording({ activity: 'walk', notification });
    await pauseRecording();
    await resumeRecording(notification);
    await finishRecording();

    expect((await storedSession())?.hadPause).toBe(true);
  });

  it('remembers the saved entry id so a retry does not duplicate it', async () => {
    await startRecording({ activity: 'walk', notification });
    await markRecordingSaved('entry-1');
    expect((await storedSession())?.savedEntryId).toBe('entry-1');
  });

  it('clears the session and every chunk on discard', async () => {
    await startRecording({ activity: 'ride', notification });
    await ingestFixes(
      Array.from({ length: 120 }, (_, i) => fix(i * 5, i * 20))
    );
    await discardRecording();

    expect(await storedSession()).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/0')
    ).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/1')
    ).toBeNull();
  });

  it('removes leftover chunks when the restored track is incomplete', async () => {
    await AsyncStorage.setItem(
      '@SparkyFitness/gpsRecording/session',
      JSON.stringify({
        id: 'rec-1',
        activity: 'run',
        status: 'recording',
        startedAt: T0,
        finishedAt: null,
        pausedAt: null,
        pausedMs: 0,
        seg: 0,
        savedEntryId: null,
      })
    );
    await AsyncStorage.setItem(
      '@SparkyFitness/gpsRecording/chunk/0',
      JSON.stringify([{ t: T0, lat: 1, lon: 2, alt: null, hacc: null, seg: 0 }])
    );
    await AsyncStorage.setItem('@SparkyFitness/gpsRecording/chunk/1', '{');
    await AsyncStorage.setItem(
      '@SparkyFitness/gpsRecording/chunk/2',
      JSON.stringify([{ t: T0, lat: 3, lon: 4, alt: null, hacc: null, seg: 0 }])
    );
    resetRecordingStateForTests();

    await discardRecording();

    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/0')
    ).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/1')
    ).toBeNull();
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/chunk/2')
    ).toBeNull();
  });
});

describe('elapsedSeconds', () => {
  const base: RecordingSession = {
    id: 'rec-1',
    activity: 'run',
    status: 'recording',
    startedAt: 1_000_000,
    finishedAt: null,
    pausedAt: null,
    pausedMs: 20_000,
    seg: 1,
    savedEntryId: null,
  };

  it('removes paused time from a running clock', () => {
    expect(elapsedSeconds(base, 1_000_000 + 100_000)).toBe(80);
  });

  it('freezes while paused', () => {
    const paused = { ...base, status: 'paused' as const, pausedAt: 1_050_000 };
    expect(elapsedSeconds(paused, 9_999_999)).toBe(30);
  });

  it('stops at the finish time', () => {
    const finished = {
      ...base,
      status: 'finished' as const,
      finishedAt: 1_070_000,
    };
    expect(elapsedSeconds(finished, 9_999_999)).toBe(50);
  });
});

describe('watch heart rate', () => {
  it('keeps readings for the live recording, sorted, and drops repeats of a batch', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;

    await addHeartRateSamples(id, 'b2', [{ t: T0 + 60_000, bpm: 150 }]);
    await addHeartRateSamples(id, 'b1', [{ t: T0 + 30_000, bpm: 140 }]);
    await addHeartRateSamples(id, 'b1', [{ t: T0 + 30_000, bpm: 140 }]);

    expect(await getHeartRateSamples()).toEqual([
      { t: T0 + 30_000, bpm: 140 },
      { t: T0 + 60_000, bpm: 150 },
    ]);
  });

  it('ignores another recording and implausible readings', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;

    await addHeartRateSamples('rec-other', 'b1', [{ t: T0, bpm: 140 }]);
    await addHeartRateSamples(id, 'b2', [
      { t: T0, bpm: 0 },
      { t: T0, bpm: 400 },
    ]);

    expect(await getHeartRateSamples()).toEqual([]);
  });

  it('still takes a late batch after Finish and is cleared by discard', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;
    await finishRecording();

    await addHeartRateSamples(id, 'late', [{ t: T0, bpm: 120 }]);
    expect(await getHeartRateSamples()).toHaveLength(1);

    await discardRecording();
    expect(await getHeartRateSamples()).toEqual([]);
    expect(
      await AsyncStorage.getItem('@SparkyFitness/gpsRecording/heartRate')
    ).toBeNull();
  });

  it('survives a restart', async () => {
    await startRecording({ activity: 'run', notification });
    const id = (await storedSession())!.id;
    await addHeartRateSamples(id, 'b1', [{ t: T0, bpm: 130 }]);

    resetRecordingStateForTests();

    expect(await getHeartRateSamples()).toEqual([{ t: T0, bpm: 130 }]);
  });
});

describe('pause edge cases', () => {
  it('keeps the time recorded before a pause when finishing while paused', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(T0);
    await startRecording({ activity: 'run', notification });
    // 30 minutes in, pause, then wait 10 minutes before Finish.
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 30 * 60_000);
    await pauseRecording();
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 40 * 60_000);
    await finishRecording();

    const finished = (await storedSession())!;
    expect(finished.status).toBe('finished');
    expect(elapsedSeconds(finished)).toBe(30 * 60);
    jest.restoreAllMocks();
  });

  it('stays paused and can retry when resuming fails to start location updates', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    // The task was dropped while paused, so resume has to start it again.
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValueOnce(false);
    mockedLocation.startLocationUpdatesAsync.mockRejectedValueOnce(
      new Error('foreground service refused')
    );

    await expect(resumeRecording(notification)).rejects.toThrow('refused');
    expect((await storedSession())?.status).toBe('paused');
    expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalled();

    await resumeRecording(notification);
    expect((await storedSession())?.status).toBe('recording');
  });
});

describe('indoor recording', () => {
  it('starts without asking for location or running a location task', async () => {
    await startRecording({ activity: 'walk', indoor: true, notification });

    expect(mockedLocation.hasServicesEnabledAsync).not.toHaveBeenCalled();
    expect(
      mockedLocation.requestForegroundPermissionsAsync
    ).not.toHaveBeenCalled();
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    const stored = await storedSession();
    expect(stored?.status).toBe('recording');
    expect(stored?.indoor).toBe(true);
    expect(mockedBaseline).toHaveBeenCalledWith(true);
  });

  it('keeps the step counter taken at the start', async () => {
    mockedBaseline.mockResolvedValueOnce(1200);

    await startRecording({ activity: 'walk', indoor: true, notification });

    expect((await storedSession())?.stepCounterAtStart).toBe(1200);
  });

  it('does not read the step counter for a ride', async () => {
    await startRecording({ activity: 'ride', indoor: true, notification });

    expect(mockedBaseline).not.toHaveBeenCalled();
  });

  it('starts even when location services are off or permission is denied', async () => {
    mockedLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      granted: false,
    } as Location.LocationPermissionResponse);

    await startRecording({ activity: 'run', indoor: true, notification });

    expect((await storedSession())?.status).toBe('recording');
  });

  it('pauses and resumes without starting a location task', async () => {
    await startRecording({ activity: 'run', indoor: true, notification });
    await pauseRecording();
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    await resumeRecording(notification);

    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect((await storedSession())?.status).toBe('recording');
  });

  it('keeps an outdoor session outdoor', async () => {
    await startRecording({ activity: 'run', notification });
    expect((await storedSession())?.indoor).toBeUndefined();
  });
});

describe('auto-pause', () => {
  const moving = (seconds: number, metersNorth: number) => ({
    ...fix(seconds, metersNorth),
    speed: 3,
  });
  const standing = (seconds: number) => ({ ...fix(seconds, 0), speed: 0 });

  it('pauses itself when the person stops and resumes when they move', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await ingestFixes([moving(0, 0), moving(2, 6), moving(4, 12)]);
    await ingestFixes([standing(6), standing(10), standing(15)]);

    let stored = await storedSession();
    expect(stored?.status).toBe('paused');
    expect(stored?.autoPaused).toBe(true);
    expect(stored?.pausedAt).toBe(T0 + 6000);

    await ingestFixes([moving(30, 6), moving(31, 9), moving(33, 15)]);
    stored = await storedSession();
    expect(stored?.status).toBe('recording');
    expect(stored?.autoPaused).toBe(false);
    expect(stored?.seg).toBe(1);
    // Paused from the moment they stopped until they started moving again.
    expect(stored?.pausedMs).toBe(30_000 - 6_000);
    expect(mockedLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('never pauses when it was not asked for', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([standing(0), standing(10), standing(20), standing(30)]);
    expect((await storedSession())?.status).toBe('recording');
  });

  it('leaves a pause the person made alone', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await pauseRecording();
    await ingestFixes([moving(0, 0), moving(2, 6), moving(4, 12)]);
    const stored = await storedSession();
    expect(stored?.status).toBe('paused');
    expect(stored?.autoPaused).toBe(false);
  });

  it('drops fixes accepted after the moment an auto-pause is backdated to', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await ingestFixes([
      { ...fix(0, 0), speed: 3 },
      { ...fix(2, 10), speed: 3 },
    ]);
    // Reported speed is a stop, but the fixes still drift far enough to be
    // kept. The pause dates back to the first of them.
    await ingestFixes([
      { ...fix(4, 20), speed: 0.2 },
      { ...fix(6, 40), speed: 0.2 },
      { ...fix(8, 60), speed: 0.2 },
      { ...fix(10, 80), speed: 0.2 },
      { ...fix(12, 100), speed: 0.2 },
    ]);

    expect((await storedSession())?.pausedAt).toBe(T0 + 4000);
    const raw = await AsyncStorage.getItem(
      '@SparkyFitness/gpsRecording/chunk/0'
    );
    const kept = JSON.parse(raw ?? '[]') as { t: number }[];
    expect(kept.map((point) => point.t)).toEqual([T0, T0 + 2000, T0 + 4000]);
  });

  it('can be turned on mid-recording, starting fresh', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([standing(0), standing(10), standing(12)]);
    expect((await storedSession())?.status).toBe('recording');

    await setRecordingAutoPause(true, notification);
    expect((await storedSession())?.autoPause).toBe(true);
    // The stillness before it was turned on does not count.
    await ingestFixes([standing(13)]);
    expect((await storedSession())?.status).toBe('recording');
    await ingestFixes([standing(20), standing(25)]);
    expect((await storedSession())?.autoPaused).toBe(true);
  });

  it('resumes the session when turned off while it holds it paused', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await ingestFixes([standing(0), standing(10), standing(12)]);
    expect((await storedSession())?.autoPaused).toBe(true);

    await setRecordingAutoPause(false, notification);
    const stored = await storedSession();
    expect(stored?.autoPause).toBe(false);
    expect(stored?.status).toBe('recording');
  });

  it('leaves a pause the person made when turned off', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await pauseRecording();
    await setRecordingAutoPause(false, notification);
    expect((await storedSession())?.status).toBe('paused');
  });

  it('stays off for an indoor session', async () => {
    await startRecording({ activity: 'run', indoor: true, notification });
    await setRecordingAutoPause(true, notification);
    expect((await storedSession())?.autoPause).toBe(false);
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('switches the distance filter with it mid-recording', async () => {
    await startRecording({ activity: 'run', notification });
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 2 })
    );

    // On: fixes must keep coming while the person stands still.
    await setRecordingAutoPause(true, notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 0 })
    );

    await setRecordingAutoPause(false, notification);
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenLastCalledWith(
      GPS_RECORDING_TASK_NAME,
      expect.objectContaining({ distanceInterval: 2 })
    );
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(3);
  });

  it('keeps the setting when the task cannot be restarted', async () => {
    await startRecording({ activity: 'run', notification });
    mockedLocation.startLocationUpdatesAsync.mockRejectedValueOnce(
      new Error('not allowed')
    );
    await setRecordingAutoPause(true, notification);
    expect((await storedSession())?.autoPause).toBe(true);
  });

  it('lets the person resume an auto-pause by hand', async () => {
    await startRecording({ activity: 'run', autoPause: true, notification });
    await ingestFixes([standing(0), standing(10), standing(12)]);
    expect((await storedSession())?.autoPaused).toBe(true);
    await resumeRecording(notification);
    const stored = await storedSession();
    expect(stored?.status).toBe('recording');
    expect(stored?.autoPaused).toBe(false);
  });
});

describe('voice cues', () => {
  const stepNorth = (seconds: number, metersNorth: number) => ({
    ...fix(seconds, metersNorth),
    speed: 3,
  });
  const spoken = () =>
    (speakRecordingCue as jest.Mock).mock.calls.map(([text]) => text as string);

  it('stays quiet unless asked', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([stepNorth(0, 0), stepNorth(200, 1100)]);
    expect(speakRecordingCue).not.toHaveBeenCalled();
    expect(beginRecordingCues).not.toHaveBeenCalled();
  });

  it('announces each completed kilometer once', async () => {
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    expect(beginRecordingCues).toHaveBeenCalled();
    (speakRecordingCue as jest.Mock).mockClear();

    await ingestFixes([stepNorth(0, 0), stepNorth(100, 500)]);
    expect(spoken()).toHaveLength(0);

    await ingestFixes([stepNorth(210, 1100)]);
    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]).toMatch(/^1 kilometer\. Time /);

    // More of the same kilometer must not repeat it.
    await ingestFixes([stepNorth(230, 1200)]);
    expect(spoken()).toHaveLength(1);
    expect((await storedSession())?.cuedSplits).toBe(1);
  });

  it('says only the latest when several kilometers land in one batch', async () => {
    await startRecording({ activity: 'ride', audioCues: 'km', notification });
    (speakRecordingCue as jest.Mock).mockClear();
    await ingestFixes([stepNorth(0, 0), stepNorth(200, 3100)]);
    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]).toMatch(/^3 kilometers\./);
  });

  it('can be turned on mid-recording without announcing past kilometers', async () => {
    await startRecording({ activity: 'run', notification });
    await ingestFixes([stepNorth(0, 0), stepNorth(250, 1300)]);

    await setRecordingAudioCues('km');
    expect(beginRecordingCues).toHaveBeenCalled();
    expect((await storedSession())?.cuedSplits).toBe(1);
    await ingestFixes([stepNorth(260, 1400)]);
    expect(spoken()).toHaveLength(0);

    await ingestFixes([stepNorth(420, 2100)]);
    expect(spoken()).toHaveLength(1);
    expect(spoken()[0]).toMatch(/^2 kilometers\./);
  });

  it('can be turned off mid-recording', async () => {
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    (speakRecordingCue as jest.Mock).mockClear();
    await setRecordingAudioCues(undefined);
    expect((await storedSession())?.audioCues).toBeUndefined();
    await ingestFixes([stepNorth(0, 0), stepNorth(250, 1300)]);
    expect(spoken()).toHaveLength(0);
  });

  it('speaks pauses and resumes', async () => {
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    (speakRecordingCue as jest.Mock).mockClear();
    await pauseRecording();
    await resumeRecording(notification);
    expect(spoken()).toEqual(['Paused', 'Resumed']);
  });

  it('does not announce a zero GPS distance when an indoor recording finishes', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      notification,
    });
    (speakRecordingCue as jest.Mock).mockClear();
    (endRecordingCues as jest.Mock).mockClear();

    await finishRecording();

    expect(speakRecordingCue).not.toHaveBeenCalled();
    expect(endRecordingCues).toHaveBeenCalledTimes(1);
  });

  it('announces the distance when an outdoor recording finishes', async () => {
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    await ingestFixes([stepNorth(0, 0), stepNorth(10, 20)]);
    (speakRecordingCue as jest.Mock).mockClear();

    await finishRecording();

    expect(spoken()[0]).toMatch(/^Recording finished\./);
  });
});

describe('laps', () => {
  afterEach(() => jest.useRealTimers());

  it('records a lap press while recording and ignores a double tap', async () => {
    jest.useFakeTimers({ now: T0 + 60_000 });
    await startRecording({ activity: 'run', notification });
    expect(await markLap()).toBe(1);
    jest.setSystemTime(T0 + 61_000);
    expect(await markLap()).toBeNull();
    jest.setSystemTime(T0 + 90_000);
    expect(await markLap()).toBe(2);
    expect((await storedSession())?.laps).toEqual([T0 + 60_000, T0 + 90_000]);
  });

  it('does nothing while paused', async () => {
    await startRecording({ activity: 'run', notification });
    await pauseRecording();
    expect(await markLap()).toBeNull();
    expect((await storedSession())?.laps).toBeUndefined();
  });
});

describe('laps pressed on the watch', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the time of the press, not the time it arrived', async () => {
    jest.useFakeTimers({ now: T0 });
    await startRecording({ activity: 'run', notification });
    jest.setSystemTime(T0 + 120_000);
    expect(await markLap(T0 + 40_000)).toBe(1);
    expect((await storedSession())?.laps).toEqual([T0 + 40_000]);
  });

  it('keeps laps in order when an earlier press arrives after a later one', async () => {
    jest.useFakeTimers({ now: T0 });
    await startRecording({ activity: 'run', notification });
    jest.setSystemTime(T0 + 120_000);
    await markLap(T0 + 100_000);
    await markLap(T0 + 40_000);
    expect((await storedSession())?.laps).toEqual([T0 + 40_000, T0 + 100_000]);
  });

  it('does not announce the same trailing lap twice when an earlier press arrives late', async () => {
    jest.useFakeTimers({ now: T0 });
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    await ingestFixes([
      { ...fix(0, 0), speed: 3 },
      { ...fix(20, 80), speed: 3 },
    ]);
    (speakRecordingCue as jest.Mock).mockClear();
    jest.setSystemTime(T0 + 120_000);
    await markLap(T0 + 100_000);
    await markLap(T0 + 40_000);
    const laps = (speakRecordingCue as jest.Mock).mock.calls
      .map(([text]) => text as string)
      .filter((text) => text.startsWith('Lap '));
    expect(laps).toHaveLength(1);
    expect((await storedSession())?.cuedPartialLapMark).toBe(T0 + 100_000);
  });

  it('ignores a re-delivered press and a press from a bad clock', async () => {
    jest.useFakeTimers({ now: T0 });
    await startRecording({ activity: 'run', notification });
    jest.setSystemTime(T0 + 60_000);
    await markLap(T0 + 30_000);
    expect(await markLap(T0 + 30_000)).toBeNull();
    // Before the recording began: treated as pressed now.
    expect(await markLap(T0 - 999_000)).toBe(2);
    expect((await storedSession())?.laps).toEqual([T0 + 30_000, T0 + 60_000]);
  });
});
