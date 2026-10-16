import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

import { readStepCounterSinceBoot } from '../../modules/step-counter';
import {
  captureStepCounterBaseline,
  getStepsBetween,
} from '../../src/services/stepCounter';

jest.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getStepCountAsync: jest.fn(),
  },
}));
jest.mock('../../modules/step-counter', () => ({
  readStepCounterSinceBoot: jest.fn(),
}));

const pedometer = jest.mocked(Pedometer);
const readCounter = jest.mocked(readStepCounterSinceBoot);
const permission = (granted: boolean, canAskAgain = true) =>
  ({ granted, canAskAgain }) as Awaited<
    ReturnType<typeof Pedometer.getPermissionsAsync>
  >;

const START = Date.UTC(2026, 9, 8, 10, 0, 0);
const END = START + 30 * 60_000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  pedometer.isAvailableAsync.mockResolvedValue(true);
  pedometer.getPermissionsAsync.mockResolvedValue(permission(true));
  pedometer.getStepCountAsync.mockResolvedValue({ steps: 3900 });
  readCounter.mockResolvedValue(5000);
});

afterEach(() => jest.restoreAllMocks());

describe('getStepsBetween', () => {
  it('returns the steps the phone counted over the window', async () => {
    expect(await getStepsBetween(START, END, { askForPermission: false })).toBe(
      3900
    );
    expect(pedometer.getStepCountAsync).toHaveBeenCalledWith(
      new Date(START),
      new Date(END)
    );
  });

  it('on Android subtracts the counter taken at the start', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(
      await getStepsBetween(START, END, {
        askForPermission: false,
        stepCounterAtStart: 1100,
      })
    ).toBe(3900);
    expect(pedometer.getStepCountAsync).not.toHaveBeenCalled();
    expect(readCounter).toHaveBeenCalledTimes(1);
  });

  it('on Android says nothing without a start reading, or after a reboot', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(
      await getStepsBetween(START, END, { askForPermission: true })
    ).toBeNull();
    expect(readCounter).not.toHaveBeenCalled();

    readCounter.mockResolvedValue(40);
    expect(
      await getStepsBetween(START, END, {
        askForPermission: true,
        stepCounterAtStart: 1100,
      })
    ).toBeNull();
  });

  it('says nothing without a pedometer or for an empty window', async () => {
    pedometer.isAvailableAsync.mockResolvedValue(false);
    expect(
      await getStepsBetween(START, END, { askForPermission: true })
    ).toBeNull();

    pedometer.isAvailableAsync.mockResolvedValue(true);
    expect(
      await getStepsBetween(END, START, { askForPermission: true })
    ).toBeNull();
  });

  it('does not ask for access when it was told not to', async () => {
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false));

    expect(
      await getStepsBetween(START, END, { askForPermission: false })
    ).toBeNull();
    expect(pedometer.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks once when allowed to, and carries on if it is granted', async () => {
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false));
    pedometer.requestPermissionsAsync.mockResolvedValue(permission(true));

    expect(await getStepsBetween(START, END, { askForPermission: true })).toBe(
      3900
    );
    expect(pedometer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('gives up when access is refused, or cannot be asked for again', async () => {
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false));
    pedometer.requestPermissionsAsync.mockResolvedValue(permission(false));
    expect(
      await getStepsBetween(START, END, { askForPermission: true })
    ).toBeNull();

    pedometer.requestPermissionsAsync.mockClear();
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false, false));
    expect(
      await getStepsBetween(START, END, { askForPermission: true })
    ).toBeNull();
    expect(pedometer.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    pedometer.getStepCountAsync.mockRejectedValue(new Error('motion denied'));

    expect(
      await getStepsBetween(START, END, { askForPermission: false })
    ).toBeNull();
  });
});

describe('captureStepCounterBaseline', () => {
  it('does nothing on iOS, which queries the window later', async () => {
    expect(await captureStepCounterBaseline(true)).toBeNull();
    expect(readCounter).not.toHaveBeenCalled();
  });

  it('reads the counter on Android, asking only when told to', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false));
    pedometer.requestPermissionsAsync.mockResolvedValue(permission(true));

    expect(await captureStepCounterBaseline(true)).toBe(5000);
    expect(pedometer.requestPermissionsAsync).toHaveBeenCalledTimes(1);

    pedometer.requestPermissionsAsync.mockClear();
    pedometer.getPermissionsAsync.mockResolvedValue(permission(false));
    expect(await captureStepCounterBaseline(false)).toBeNull();
    expect(pedometer.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
