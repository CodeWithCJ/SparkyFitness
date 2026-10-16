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

import { speakRecordingCue } from '../../src/services/recordingCues';
import {
  ingestFixes,
  resetRecordingStateForTests,
  startRecording,
  tickIntervals,
} from '../../src/services/gpsRecordingService';

const notification = { title: 'Recording', body: 'Tracking' };
const T0 = new Date(2026, 9, 10, 8, 0, 0).getTime();
const DEG_PER_METER = 1 / 111_194.9;

/** Runs north at `metersPerSecond`, a fix every 2 s, from `from` to `to` seconds. */
async function runAt(metersPerSecond: number, from: number, to: number) {
  for (let s = from; s <= to; s += 2) {
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

const spoken = () =>
  (speakRecordingCue as jest.Mock).mock.calls.map(([text]) => text as string);

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

describe('distance milestones', () => {
  test('5K is said in the same breath as the fifth kilometer, once', async () => {
    await startRecording({ activity: 'run', audioCues: 'km', notification });
    await runAt(5, 0, 1010);
    const fifth = spoken().filter((text) => text.includes('5K done'));
    expect(fifth).toHaveLength(1);
    expect(fifth[0]).toMatch(/^5 kilometers\./);
    // Nothing else repeats it.
    await runAt(5, 1012, 1100);
    expect(spoken().filter((text) => text.includes('5K done'))).toHaveLength(1);
  });

  test('in miles it comes between splits, on its own', async () => {
    await startRecording({ activity: 'run', audioCues: 'miles', notification });
    await runAt(5, 0, 1010);
    expect(spoken()).toContain('5K done. Nice work.');
  });

  test('indoors has no distance to judge, so no milestone', async () => {
    await startRecording({
      activity: 'run',
      indoor: true,
      audioCues: 'km',
      checkInMinutes: 5,
      notification,
    });
    jest.setSystemTime(T0 + 60 * 60 * 1000);
    await tickIntervals();
    expect(spoken().some((text) => text.includes('5K'))).toBe(false);
  });
});
