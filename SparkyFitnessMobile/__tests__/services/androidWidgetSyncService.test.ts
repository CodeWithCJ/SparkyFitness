import {
  clearAndroidWidgetSnapshots,
  getAndroidWidgetGeneration,
  refreshAndroidWidgetsFromServer,
} from '../../src/services/androidWidgetSyncService';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import { ensureTimezoneBootstrapped } from '../../src/services/api/preferencesApi';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from '../../src/services/dailySummaryService';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    setCalorieSnapshot: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    setMacroSnapshot: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
    setWaterSnapshot: jest.fn(() => Promise.resolve()),
    reloadWaterWidget: jest.fn(() => Promise.resolve()),
    clearSnapshots: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/services/api/preferencesApi', () => ({
  ensureTimezoneBootstrapped: jest.fn(),
}));

jest.mock('../../src/services/dailySummaryService', () => ({
  buildDailySummary: jest.fn(),
  loadDailySummaryRawData: jest.fn(),
}));

const summary = {
  date: '2026-10-19',
  // Differs from the balance's eaten only so the tests can tell which one
  // the macro snapshot reads.
  caloriesConsumed: 1500,
  calorieBalance: {
    eaten: 1540,
    burned: 200,
    remaining: 460,
    goal: 2000,
    progress: 77,
  },
  protein: { consumed: 92, goal: 150 },
  carbs: { consumed: 180, goal: 200 },
  fat: { consumed: 55, goal: 65 },
  waterConsumed: 1500,
  waterGoal: 2500,
  waterManual: 1000,
};

describe('androidWidgetSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ensureTimezoneBootstrapped as jest.Mock).mockResolvedValue('UTC');
    (buildDailySummary as jest.Mock).mockReturnValue(summary);
  });

  it('erases the snapshots and moves the generation on', async () => {
    const before = getAndroidWidgetGeneration();

    await clearAndroidWidgetSnapshots();

    expect(CalorieWidgetBridge.clearSnapshots).toHaveBeenCalledTimes(1);
    expect(getAndroidWidgetGeneration()).toBe(before + 1);
  });

  it('pushes the summary it loaded', async () => {
    (loadDailySummaryRawData as jest.Mock).mockResolvedValue({});

    await refreshAndroidWidgetsFromServer();

    expect(CalorieWidgetBridge.setCalorieSnapshot).toHaveBeenCalledTimes(1);
    expect(CalorieWidgetBridge.setMacroSnapshot).toHaveBeenCalledTimes(1);
    expect(CalorieWidgetBridge.setWaterSnapshot).toHaveBeenCalledTimes(1);
    const calorie = JSON.parse(
      (CalorieWidgetBridge.setCalorieSnapshot as jest.Mock).mock.calls[0][0]
    );
    expect(calorie).toMatchObject({
      date: '2026-10-19',
      food: 1540,
      burned: 200,
      goal: 2000,
      remaining: 460,
      progress: 0.77,
    });
    const macro = JSON.parse(
      (CalorieWidgetBridge.setMacroSnapshot as jest.Mock).mock.calls[0][0]
    );
    // The kcal eaten the large macro widget shows are the Dashboard's.
    expect(macro).toMatchObject({ calories: 1540, remaining: 460 });
    const water = JSON.parse(
      (CalorieWidgetBridge.setWaterSnapshot as jest.Mock).mock.calls[0][0]
    );
    expect(water).toMatchObject({
      date: '2026-10-19',
      consumedMl: 1500,
      goalMl: 2500,
      manualMl: 1000,
    });
    expect(water).not.toHaveProperty('drinkMl');
    expect(CalorieWidgetBridge.reloadWaterWidget).toHaveBeenCalledTimes(1);
  });

  it('drops a refresh for the previous account when the account changes mid-load', async () => {
    let finishLoading: (raw: object) => void = () => {};
    (loadDailySummaryRawData as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      })
    );

    const refresh = refreshAndroidWidgetsFromServer();
    await Promise.resolve();
    await clearAndroidWidgetSnapshots();
    finishLoading({});
    await refresh;

    expect(CalorieWidgetBridge.setCalorieSnapshot).not.toHaveBeenCalled();
    expect(CalorieWidgetBridge.setMacroSnapshot).not.toHaveBeenCalled();
    expect(CalorieWidgetBridge.setWaterSnapshot).not.toHaveBeenCalled();
  });
});
