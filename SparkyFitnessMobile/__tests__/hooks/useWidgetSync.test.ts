jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: { iosAppGroup: 'group.test.sparkyfitness' },
    },
  },
}));

import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { ExtensionStorage } from '@bacons/apple-targets';
import { useWidgetSync } from '../../src/hooks/useWidgetSync';
import { addLog } from '../../src/services/LogService';
import { getTodayDate } from '../../src/utils/dateUtils';
import type { DailySummary } from '../../src/types/dailySummary';

jest.mock('@bacons/apple-targets', () => {
  const mockSet = jest.fn();
  const mockGet = jest.fn(() => 'stored');
  const mockReload = jest.fn();

  class ExtensionStorage {
    appGroup: string;
    constructor(group: string) {
      this.appGroup = group;
    }
    set(key: string, value: unknown) {
      mockSet(key, value);
    }
    get(key: string) {
      return mockGet(key);
    }
    static reloadWidget(name?: string) {
      mockReload(name);
    }
  }
  (ExtensionStorage as any).__mockSet = mockSet;
  (ExtensionStorage as any).__mockGet = mockGet;
  (ExtensionStorage as any).__mockReload = mockReload;

  return { ExtensionStorage };
});

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/native/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    setCalorieSnapshot: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    setMacroSnapshot: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
    isAvailable: true,
  },
}));

import { CalorieWidgetBridge } from '../../src/native/CalorieWidgetBridge';

const setMock = (ExtensionStorage as any).__mockSet as jest.Mock;
const getMock = (ExtensionStorage as any).__mockGet as jest.Mock;
const reloadMock = (ExtensionStorage as any).__mockReload as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const androidSetSnapshot = CalorieWidgetBridge.setCalorieSnapshot as jest.Mock;
const androidReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const androidSetMacroSnapshot =
  CalorieWidgetBridge.setMacroSnapshot as jest.Mock;
const androidReloadMacro =
  CalorieWidgetBridge.reloadMacroWidget as jest.Mock;

const flushWidgetPush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const makeSummary = (overrides: Partial<DailySummary> = {}): DailySummary => ({
  date: getTodayDate(),
  calorieGoal: 2000,
  caloriesConsumed: 1540,
  caloriesBurned: 200,
  activeCalories: 150,
  otherExerciseCalories: 50,
  stepCalories: 0,
  exerciseMinutes: 30,
  exerciseMinutesGoal: 30,
  exerciseCaloriesGoal: 300,
  netCalories: 1340,
  remainingCalories: 660,
  protein: { consumed: 92, goal: 150 },
  carbs: { consumed: 180, goal: 200 },
  fat: { consumed: 55, goal: 65 },
  fiber: { consumed: 20, goal: 30 },
  waterConsumed: 1500,
  waterGoal: 2500,
  foodEntries: [],
  exerciseEntries: [],
  calorieBalance: {
    eaten: 1540,
    burned: 200,
    remaining: 460,
    goal: 2000,
    net: 1340,
    progress: 77,
    bmr: 1700,
    exerciseSource: 'active',
  },
  ...overrides,
});

describe('useWidgetSync', () => {
  beforeEach(() => {
    setMock.mockReset();
    getMock.mockReset().mockReturnValue('stored');
    reloadMock.mockReset();
    mockAddLog.mockReset();
    androidSetSnapshot.mockReset().mockResolvedValue(undefined);
    androidReload.mockReset().mockResolvedValue(undefined);
    androidSetMacroSnapshot.mockReset().mockResolvedValue(undefined);
    androidReloadMacro.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', {
      get: () => 'ios',
      configurable: true,
    });
  });

  it('writes both snapshots and reloads both widgets when calorieBalance + macros present', () => {
    renderHook(() => useWidgetSync(makeSummary()));

    const keys = setMock.mock.calls.map(call => call[0]);
    expect(keys).toContain('calorieSnapshot');
    expect(keys).toContain('macroSnapshot');

    const macroCall = setMock.mock.calls.find(
      call => call[0] === 'macroSnapshot',
    );
    expect(macroCall?.[1]).toMatchObject({
      protein: 92,
      carbs: 180,
      fat: 55,
      calories: 1540,
    });

    const reloadedKinds = reloadMock.mock.calls.map(call => call[0]);
    expect(reloadedKinds).toEqual(
      expect.arrayContaining(['widget', 'macroWidget']),
    );
    expect(reloadedKinds).toHaveLength(2);
    expect(mockAddLog).not.toHaveBeenCalled();
  });

  it('writes only the macro snapshot when calorieBalance is undefined', () => {
    const summary = makeSummary({
      calorieBalance: undefined as unknown as DailySummary['calorieBalance'],
    });
    renderHook(() => useWidgetSync(summary));

    const keys = setMock.mock.calls.map(call => call[0]);
    expect(keys).toEqual(['macroSnapshot']);

    const reloadedKinds = reloadMock.mock.calls.map(call => call[0]);
    expect(reloadedKinds).toEqual(['macroWidget']);
    expect(mockAddLog).not.toHaveBeenCalled();
  });

  it('writes nothing when the summary date is not today', () => {
    renderHook(() => useWidgetSync(makeSummary({ date: '2000-01-01' })));

    expect(setMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('pushes calorie and macro snapshots to Android bridge and does not touch iOS ExtensionStorage', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() => useWidgetSync(makeSummary()));

    // iOS path must not run
    expect(setMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    const [payloadJson] = androidSetSnapshot.mock.calls[0];
    const payload = JSON.parse(payloadJson as string);
    expect(payload).toMatchObject({
      date: getTodayDate(),
      remaining: 460,
      goal: 2000,
      progress: 0.77,
    });
    expect(androidReload).toHaveBeenCalledTimes(1);

    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    const [macroPayloadJson] = androidSetMacroSnapshot.mock.calls[0];
    const macroPayload = JSON.parse(macroPayloadJson as string);
    expect(macroPayload).toMatchObject({
      date: getTodayDate(),
      protein: 92,
      carbs: 180,
      fat: 55,
      calories: 1540,
    });
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('skips Android pushes when only non-rendered summary fields change', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });

    await flushWidgetPush();

    rerender({
      summary: makeSummary({
        waterConsumed: 1800,
        fiber: { consumed: 22, goal: 30 },
      }),
    });

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReload).toHaveBeenCalledTimes(1);
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('pushes Android snapshot again when rendered calorie fields change', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });

    await flushWidgetPush();

    rerender({
      summary: makeSummary({
        calorieBalance: {
          eaten: 1540,
          burned: 200,
          remaining: 400,
          goal: 2000,
          net: 1340,
          progress: 80,
          bmr: 1700,
          exerciseSource: 'active',
        },
      }),
    });

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(2);
    expect(androidReload).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(androidSetSnapshot.mock.calls[1][0] as string);
    expect(payload).toMatchObject({
      remaining: 400,
      goal: 2000,
      progress: 0.8,
    });
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('pushes Android macro snapshot again when rendered macro fields change', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });

    await flushWidgetPush();

    rerender({
      summary: makeSummary({
        caloriesConsumed: 1600,
        protein: { consumed: 100, goal: 150 },
        carbs: { consumed: 190, goal: 200 },
      }),
    });

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReload).toHaveBeenCalledTimes(1);
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(2);
    expect(androidReloadMacro).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(
      androidSetMacroSnapshot.mock.calls[1][0] as string,
    );
    expect(payload).toMatchObject({
      calories: 1600,
      protein: 100,
      carbs: 190,
      fat: 55,
    });
  });

  it('pushes Android macro snapshot when calorieBalance is missing', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    const summary = makeSummary({
      calorieBalance: undefined as unknown as DailySummary['calorieBalance'],
    });

    renderHook(() => useWidgetSync(summary));

    await flushWidgetPush();

    expect(androidSetSnapshot).not.toHaveBeenCalled();
    expect(androidReload).not.toHaveBeenCalled();
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('continues Android macro push when calorie widget push fails', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    androidSetSnapshot.mockRejectedValueOnce(new Error('calorie failed'));

    renderHook(() => useWidgetSync(makeSummary()));

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReload).not.toHaveBeenCalled();
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Android calorie widget push failed'),
      'ERROR',
    );
  });

  it('retries Android macro push without rolling back calorie dedupe when macro push fails', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    androidSetMacroSnapshot.mockRejectedValueOnce(new Error('macro failed'));

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });

    await flushWidgetPush();

    rerender({ summary: makeSummary() });

    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    expect(androidReload).toHaveBeenCalledTimes(1);
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(2);
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Android macro widget push failed'),
      'ERROR',
    );
  });
});
