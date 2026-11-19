import { Platform } from 'react-native';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isGarminAvailable: jest.fn(() => true),
  },
}));

import {
  GARMIN_WATCH_APP_RELEASED,
  isGarminWatchEnabled,
} from '../../src/constants/garmin';

const watch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { isGarminAvailable?: jest.Mock };
  }
).default;
const isGarminAvailable = watch.isGarminAvailable as jest.Mock;
const globals = globalThis as unknown as { __DEV__: boolean };

describe('isGarminWatchEnabled', () => {
  const originalOs = Platform.OS;
  const originalDev = globals.__DEV__;

  beforeEach(() => {
    Platform.OS = 'android';
    globals.__DEV__ = true;
    watch.isGarminAvailable = isGarminAvailable;
    isGarminAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    Platform.OS = originalOs;
    globals.__DEV__ = originalDev;
  });

  test('the watch app is not published yet', () => {
    expect(GARMIN_WATCH_APP_RELEASED).toBe(false);
  });

  test('is on in an Android development build with Garmin Connect', () => {
    expect(isGarminWatchEnabled()).toBe(true);
  });

  test('is off in a release build until the watch app is published', () => {
    globals.__DEV__ = false;

    expect(isGarminWatchEnabled()).toBe(false);
  });

  test('is off without Garmin Connect, asking again on every call', () => {
    isGarminAvailable.mockReturnValueOnce(false);
    expect(isGarminWatchEnabled()).toBe(false);
    // Installed since.
    expect(isGarminWatchEnabled()).toBe(true);
  });

  test('is off on iOS and on a module without Garmin', () => {
    Platform.OS = 'ios';
    expect(isGarminWatchEnabled()).toBe(false);

    Platform.OS = 'android';
    delete watch.isGarminAvailable;
    expect(isGarminWatchEnabled()).toBe(false);
  });
});
