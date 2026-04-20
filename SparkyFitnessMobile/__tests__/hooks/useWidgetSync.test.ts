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

const setMock = (ExtensionStorage as any).__mockSet as jest.Mock;
const getMock = (ExtensionStorage as any).__mockGet as jest.Mock;
const reloadMock = (ExtensionStorage as any).__mockReload as jest.Mock;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;

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
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  it('writes both snapshots and reloads both widgets when calorieBalance + macros present', () => {
    renderHook(() => useWidgetSync(makeSummary()));

    const keys = setMock.mock.calls.map((call) => call[0]);
    expect(keys).toContain('calorieSnapshot');
    expect(keys).toContain('macroSnapshot');

    const macroCall = setMock.mock.calls.find((call) => call[0] === 'macroSnapshot');
    expect(macroCall?.[1]).toMatchObject({
      protein: 92,
      carbs: 180,
      fat: 55,
      calories: 1540,
    });

    const reloadedKinds = reloadMock.mock.calls.map((call) => call[0]);
    expect(reloadedKinds).toEqual(expect.arrayContaining(['widget', 'macroWidget']));
    expect(reloadedKinds).toHaveLength(2);
    expect(mockAddLog).not.toHaveBeenCalled();
  });

  it('writes only the macro snapshot when calorieBalance is undefined', () => {
    const summary = makeSummary({ calorieBalance: undefined as unknown as DailySummary['calorieBalance'] });
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

  it('writes nothing on Android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });

    renderHook(() => useWidgetSync(makeSummary()));

    expect(setMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
