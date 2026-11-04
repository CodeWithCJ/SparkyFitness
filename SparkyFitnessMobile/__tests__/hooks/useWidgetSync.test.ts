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

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    setCalorieSnapshot: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    setMacroSnapshot: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
    setWaterSnapshot: jest.fn(() => Promise.resolve()),
    reloadWaterWidget: jest.fn(() => Promise.resolve()),
    clearSnapshots: jest.fn(() => Promise.resolve()),
    isAvailable: true,
  },
}));

import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import { clearAndroidWidgetSnapshots } from '../../src/services/androidWidgetSyncService';

const setMock = (ExtensionStorage as any).__mockSet as jest.Mock;
const getMock = (ExtensionStorage as any).__mockGet as jest.Mock;
const reloadMock = (ExtensionStorage as any).__mockReload as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const androidSetSnapshot = CalorieWidgetBridge.setCalorieSnapshot as jest.Mock;
const androidReload = CalorieWidgetBridge.reloadWidget as jest.Mock;
const androidSetMacroSnapshot =
  CalorieWidgetBridge.setMacroSnapshot as jest.Mock;
const androidReloadMacro = CalorieWidgetBridge.reloadMacroWidget as jest.Mock;
const androidSetWaterSnapshot =
  CalorieWidgetBridge.setWaterSnapshot as jest.Mock;
const androidReloadWater = CalorieWidgetBridge.reloadWaterWidget as jest.Mock;

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
    tdeeProjection: null,
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
    androidSetWaterSnapshot.mockReset().mockResolvedValue(undefined);
    androidReloadWater.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(Platform, 'OS', {
      get: () => 'ios',
      configurable: true,
    });
  });

  it('writes both snapshots and reloads both widgets when calorieBalance + macros present', () => {
    renderHook(() => useWidgetSync(makeSummary()));

    const keys = setMock.mock.calls.map((call) => call[0]);
    expect(keys).toContain('calorieSnapshot');
    expect(keys).toContain('macroSnapshot');

    const macroCall = setMock.mock.calls.find(
      (call) => call[0] === 'macroSnapshot'
    );
    expect(macroCall?.[1]).toMatchObject({
      protein: 92,
      carbs: 180,
      fat: 55,
      calories: 1540,
    });

    const reloadedKinds = reloadMock.mock.calls.map((call) => call[0]);
    expect(reloadedKinds).toEqual(
      expect.arrayContaining(['widget', 'macroWidget'])
    );
    expect(reloadedKinds).toHaveLength(2);
    expect(mockAddLog).not.toHaveBeenCalled();
  });

  it('writes the iOS calorie snapshot unchanged', () => {
    // The flat totals differ from the balance only so this test can tell
    // which ones the payload reads: iOS has always read the balance.
    renderHook(() =>
      useWidgetSync(
        makeSummary({
          caloriesConsumed: 1500,
          caloriesBurned: 180,
          calorieGoal: 2100,
        })
      )
    );

    const calorieCall = setMock.mock.calls.find(
      (call) => call[0] === 'calorieSnapshot'
    );
    // The builder is shared with Android now; iOS must get exactly the keys
    // and values it always had.
    expect(calorieCall?.[1]).toEqual({
      date: getTodayDate(),
      food: 1540,
      burned: 200,
      goal: 2000,
      remaining: 460,
      progress: 0.77,
      lastUpdated: expect.any(Number),
    });
  });

  it('writes and reloads the water snapshot when water info is given', () => {
    renderHook(() =>
      useWidgetSync(makeSummary({ waterConsumed: 473, waterGoal: 2000 }), {
        drinkMl: 473.176,
        unit: 'oz',
        canLog: true,
      })
    );

    const waterCall = setMock.mock.calls.find(
      (call) => call[0] === 'waterSnapshot'
    );
    expect(waterCall?.[1]).toMatchObject({
      consumedMl: 473,
      goalMl: 2000,
      drinkMl: 473.176,
      unit: 'oz',
      canLog: 1,
    });
    expect(reloadMock.mock.calls.map((call) => call[0])).toContain(
      'waterWidget'
    );
  });

  it('writes only the macro snapshot when calorieBalance is undefined', () => {
    const summary = makeSummary({
      calorieBalance: undefined as unknown as DailySummary['calorieBalance'],
    });
    renderHook(() => useWidgetSync(summary));

    const keys = setMock.mock.calls.map((call) => call[0]);
    expect(keys).toEqual(['macroSnapshot']);

    const reloadedKinds = reloadMock.mock.calls.map((call) => call[0]);
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
      food: 1540,
      burned: 200,
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
      remaining: 460,
      // The widget's per-macro bars need each goal to show real progress; without
      // them it can only compare macros against each other, which barely moves
      // across the day (#2228).
      proteinGoal: 150,
      carbsGoal: 200,
      fatGoal: 65,
    });
    expect(androidReloadMacro).toHaveBeenCalledTimes(1);
  });

  it('re-pushes the macro snapshot when only a macro goal changes', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });
    await flushWidgetPush();
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);

    // Consumption is identical, so a snapshot keyed only on consumed grams
    // would dedupe this away and leave the bars rendering against a stale goal.
    rerender({
      summary: makeSummary({ protein: { consumed: 92, goal: 180 } }),
    });
    await flushWidgetPush();

    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(2);
    const latest = JSON.parse(
      androidSetMacroSnapshot.mock.calls[1][0] as string
    );
    expect(latest).toMatchObject({ protein: 92, proteinGoal: 180 });
    expect(androidReloadMacro).toHaveBeenCalledTimes(2);
  });

  it('re-pushes the calorie snapshot when only the calories burned change', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });
    await flushWidgetPush();
    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);

    // In the fixed-goal mode exercise does not move what is left, so only the
    // Burned figure the wider widget shows changes.
    const summary = makeSummary();
    rerender({
      summary: {
        ...summary,
        calorieBalance: { ...summary.calorieBalance, burned: 350 },
      },
    });
    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(androidSetSnapshot.mock.calls[1][0] as string)
    ).toMatchObject({
      burned: 350,
      remaining: 460,
    });
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
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

  it('pushes the same Android snapshots again after an account change clears them', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    const { rerender } = renderHook(({ summary }) => useWidgetSync(summary), {
      initialProps: { summary: makeSummary() },
    });
    await flushWidgetPush();

    // The same person signing in again gets the same figures, which the
    // dedupe would otherwise skip and leave the cleared widgets empty.
    await clearAndroidWidgetSnapshots();
    rerender({ summary: makeSummary() });
    await flushWidgetPush();

    expect(androidSetSnapshot).toHaveBeenCalledTimes(2);
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(2);
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
          tdeeProjection: null,
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
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(2);
    expect(androidReloadMacro).toHaveBeenCalledTimes(2);
    const macroPayload = JSON.parse(
      androidSetMacroSnapshot.mock.calls[1][0] as string
    );
    expect(macroPayload).toMatchObject({
      remaining: 400,
    });
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
      androidSetMacroSnapshot.mock.calls[1][0] as string
    );
    // The kcal eaten come from the calorie balance, as on the Dashboard, not
    // from the flat caloriesConsumed.
    expect(payload).toMatchObject({
      calories: 1540,
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
      'ERROR'
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
      'ERROR'
    );
  });

  it('pushes the Android water snapshot with the drink when water info is given', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() =>
      useWidgetSync(makeSummary(), { drinkMl: 250, unit: 'ml', canLog: true })
    );
    await flushWidgetPush();

    expect(androidSetWaterSnapshot).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      androidSetWaterSnapshot.mock.calls[0][0] as string
    );
    expect(payload).toMatchObject({
      date: getTodayDate(),
      consumedMl: 1500,
      goalMl: 2500,
      drinkMl: 250,
      unit: 'ml',
      canLog: true,
    });
    expect(androidReloadWater).toHaveBeenCalledTimes(1);
  });

  it('sends a null drink for a container linked to a food, which hides the buttons', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() =>
      useWidgetSync(makeSummary(), { drinkMl: null, unit: 'oz', canLog: true })
    );
    await flushWidgetPush();

    const payload = JSON.parse(
      androidSetWaterSnapshot.mock.calls[0][0] as string
    );
    expect(payload).toMatchObject({ drinkMl: null, unit: 'oz' });
  });

  it('does not push the Android water snapshot without the water details', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() => useWidgetSync(makeSummary()));
    await flushWidgetPush();

    expect(androidSetWaterSnapshot).not.toHaveBeenCalled();
    expect(androidReloadWater).not.toHaveBeenCalled();
  });

  it('sends the manual part of the day to the Android water widget', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() =>
      useWidgetSync(makeSummary({ waterManual: 750 }), {
        drinkMl: 250,
        unit: 'ml',
        canLog: true,
      })
    );
    await flushWidgetPush();

    expect(
      JSON.parse(androidSetWaterSnapshot.mock.calls[0][0] as string)
    ).toMatchObject({ manualMl: 750 });
  });

  it('leaves the drink out while the containers load, so the widget keeps its buttons', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });

    renderHook(() =>
      useWidgetSync(makeSummary(), { unit: 'ml', canLog: true })
    );
    await flushWidgetPush();

    const payload = JSON.parse(
      androidSetWaterSnapshot.mock.calls[0][0] as string
    );
    expect(payload).not.toHaveProperty('drinkMl');
    expect(payload).toMatchObject({ unit: 'ml', canLog: true });
  });

  it('pushes the Android water snapshot again only when its figures change', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    const water = { drinkMl: 250, unit: 'ml', canLog: true };

    const { rerender } = renderHook(
      ({ summary }) => useWidgetSync(summary, water),
      { initialProps: { summary: makeSummary() } }
    );
    await flushWidgetPush();

    rerender({ summary: makeSummary({ fiber: { consumed: 22, goal: 30 } }) });
    await flushWidgetPush();
    expect(androidSetWaterSnapshot).toHaveBeenCalledTimes(1);

    rerender({ summary: makeSummary({ waterConsumed: 1750 }) });
    await flushWidgetPush();
    expect(androidSetWaterSnapshot).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(androidSetWaterSnapshot.mock.calls[1][0] as string)
    ).toMatchObject({ consumedMl: 1750 });
  });

  it('retries the Android water push alone after it fails', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    androidSetWaterSnapshot.mockRejectedValueOnce(new Error('water failed'));
    const water = { drinkMl: 250, unit: 'ml', canLog: true };

    const { rerender } = renderHook(
      ({ summary }) => useWidgetSync(summary, water),
      { initialProps: { summary: makeSummary() } }
    );
    await flushWidgetPush();

    rerender({ summary: makeSummary() });
    await flushWidgetPush();

    expect(androidSetWaterSnapshot).toHaveBeenCalledTimes(2);
    expect(androidReloadWater).toHaveBeenCalledTimes(1);
    expect(androidSetSnapshot).toHaveBeenCalledTimes(1);
    expect(androidSetMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('Android water widget push failed'),
      'ERROR'
    );
  });
});
