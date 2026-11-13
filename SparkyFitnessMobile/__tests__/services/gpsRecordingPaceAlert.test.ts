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
  ingestFixes,
  noteLiveHeartRate,
  resetRecordingStateForTests,
  setRecordingHeartRateBand,
  setRecordingPaceBand,
  startRecording,
} from '../../src/services/gpsRecordingService';

const notification = { title: 'Recording', body: 'Tracking' };
const T0 = new Date(2026, 9, 10, 8, 0, 0).getTime();
const DEG_PER_METER = 1 / 111_194.9;
// 5:00 to 5:30 per km.
const band = { minSecondsPerKm: 300, maxSecondsPerKm: 330 };

/** Runs at `metersPerSecond` for `seconds`, a fix every 2 s, as the clock moves. */
async function runAt(metersPerSecond: number, seconds: number, from = 0) {
  for (let s = from; s <= from + seconds; s += 2) {
    jest.setSystemTime(T0 + s * 1000);
    await ingestFixes([
      {
        t: T0 + s * 1000,
        lat: 51.5 + s * metersPerSecond * DEG_PER_METER,
        lon: -0.12,
        alt: null,
        hacc: 5,
        vacc: null,
        speed: metersPerSecond,
        course: null,
      },
    ]);
  }
}

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(T0);
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

describe('pace alert', () => {
  test('buzzes and speaks when the pace stays too fast', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      paceBand: band,
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    jest.mocked(speakRecordingCue).mockClear();
    await runAt(5, 40);
    expect(fireImpactHaptic).toHaveBeenCalled();
    expect(speakRecordingCue).toHaveBeenCalledWith('Too fast. Ease off.');
  });

  test('says nothing inside the range', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      paceBand: band,
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    jest.mocked(speakRecordingCue).mockClear();
    // 3.2 m/s is 5:12 per km.
    await runAt(3.2, 60);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
    expect(speakRecordingCue).not.toHaveBeenCalled();
  });

  test('buzzes without speaking when voice cues are off', async () => {
    await startRecording({ activity: 'run', paceBand: band, notification });
    await runAt(2, 60);
    expect(fireImpactHaptic).toHaveBeenCalled();
    expect(speakRecordingCue).not.toHaveBeenCalled();
  });

  test('a range set mid-run applies, and clearing it stops the alerts', async () => {
    await startRecording({ activity: 'run', notification });
    await runAt(5, 40);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
    await setRecordingPaceBand(band);
    await runAt(5, 40, 42);
    expect(fireImpactHaptic).toHaveBeenCalled();

    jest.mocked(fireImpactHaptic).mockClear();
    await setRecordingPaceBand(undefined);
    await runAt(5, 80, 84);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test("a plan step's own range beats the run's range", async () => {
    // The run's range is 5:00-5:30; the one fast step allows 3:00-3:30,
    // so 5 m/s (3:20 per km) is on pace there.
    await startRecording({
      activity: 'run',
      paceBand: band,
      intervals: {
        style: 'fastEasy',
        steps: [
          {
            kind: 'work',
            seconds: 600,
            pace: { minSecondsPerKm: 180, maxSecondsPerKm: 210 },
          },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    await runAt(5, 80);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test('a step with no range of its own keeps the run range', async () => {
    await startRecording({
      activity: 'run',
      paceBand: band,
      intervals: { style: 'fastEasy', steps: [{ kind: 'work', seconds: 600 }] },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    await runAt(5, 60);
    expect(fireImpactHaptic).toHaveBeenCalled();
  });
});

describe('heart-rate alert', () => {
  const hrBand = { minBpm: 140, maxBpm: 160 };

  /** A reading every 3 s, as the watch sends them, for `seconds`. */
  async function readings(bpm: number, seconds: number, from = 0) {
    for (let s = from; s <= from + seconds; s += 3) {
      jest.setSystemTime(T0 + s * 1000);
      await noteLiveHeartRate('rec-' + T0, bpm);
    }
  }

  test('buzzes and speaks when the heart rate stays too high', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      heartRateBand: hrBand,
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    jest.mocked(speakRecordingCue).mockClear();
    await readings(178, 30);
    expect(fireImpactHaptic).toHaveBeenCalledTimes(1);
    expect(speakRecordingCue).toHaveBeenCalledWith(
      'Heart rate high. Ease off.'
    );
  });

  test('says nothing inside the range, or for another recording', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      heartRateBand: hrBand,
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    await readings(150, 60);
    await noteLiveHeartRate('someone-else', 200);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test('a plan step range beats the run range', async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      heartRateBand: hrBand,
      intervals: {
        style: 'fastEasy',
        steps: [
          {
            kind: 'work',
            seconds: 600,
            heartRate: { minBpm: 165, maxBpm: 185 },
          },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    // 178 is outside the run's range but inside the step's.
    await readings(178, 60);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test('a Zone 2 step forgives low readings while heart rate settles at the start', async () => {
    const zone2 = { minBpm: 111, maxBpm: 129 };
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: {
        style: 'runWalk',
        steps: [
          { kind: 'work', seconds: 4000, effort: 'zone2', heartRate: zone2 },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    // 105 is under the range, but heart rate is still settling in the first minutes.
    await readings(105, 30);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test('a Zone 2 step lets heart rate drift a few beats over late in a long run', async () => {
    const zone2 = { minBpm: 111, maxBpm: 129 };
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: {
        style: 'runWalk',
        steps: [
          { kind: 'work', seconds: 4000, effort: 'zone2', heartRate: zone2 },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    // 133 is four over the range, inside the drift allowance at 55 minutes.
    await readings(133, 30, 3300);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test('a Zone 2 step still alerts when heart rate stays above the range early on', async () => {
    const zone2 = { minBpm: 111, maxBpm: 129 };
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      intervals: {
        style: 'runWalk',
        steps: [
          { kind: 'work', seconds: 4000, effort: 'zone2', heartRate: zone2 },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    await readings(150, 30, 300);
    expect(fireImpactHaptic).toHaveBeenCalled();
  });

  test('a range set mid-run applies, and clearing it stops the alerts', async () => {
    await startRecording({ activity: 'run', notification });
    await readings(178, 30);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
    await setRecordingHeartRateBand(hrBand);
    await readings(178, 30, 33);
    expect(fireImpactHaptic).toHaveBeenCalled();

    jest.mocked(fireImpactHaptic).mockClear();
    await setRecordingHeartRateBand(undefined);
    await readings(178, 60, 66);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });

  test("switching the alert off also silences a plan step's own range", async () => {
    await startRecording({
      activity: 'run',
      audioCues: 'km',
      heartRateBand: hrBand,
      intervals: {
        style: 'fastEasy',
        steps: [
          {
            kind: 'work',
            seconds: 600,
            heartRate: { minBpm: 100, maxBpm: 120 },
          },
        ],
      },
      notification,
    });
    jest.mocked(fireImpactHaptic).mockClear();
    // 150 is above the step's range, so it alerts while the alert is on.
    await readings(150, 60);
    expect(fireImpactHaptic).toHaveBeenCalled();

    jest.mocked(fireImpactHaptic).mockClear();
    await setRecordingHeartRateBand(undefined);
    await readings(150, 90, 66);
    expect(fireImpactHaptic).not.toHaveBeenCalled();
  });
});
