import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  HEALTH_TREND_KEYS,
  HEALTH_TREND_LABELS,
} from '../../src/constants/healthTrends';

describe('healthTrends registry', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('every registered key has a label resolver', () => {
    expect(new Set(Object.keys(HEALTH_TREND_LABELS))).toEqual(
      new Set(HEALTH_TREND_KEYS)
    );

    const englishDefaults: Record<string, string> = {
      steps: 'Steps',
      weight: 'Weight',
      sleep: 'Sleep',
      hydration: 'Hydration',
      calories: 'Calories',
      vo2max: 'VO2 max',
      heartRate: 'Resting Heart Rate',
      mood: 'Mood',
    };

    for (const key of HEALTH_TREND_KEYS) {
      expect(HEALTH_TREND_LABELS[key](i18n.t)).toBe(englishDefaults[key]);
    }
  });

  test('the default order leads with the trends the pager shipped with', () => {
    // A user who never opens the settings screen must see exactly what they saw before
    // hydration was registered, so the first three keys are frozen in place.
    expect(HEALTH_TREND_KEYS.slice(0, 3)).toEqual(['steps', 'weight', 'sleep']);
  });

  test('registers calories as the newest trend', () => {
    expect(HEALTH_TREND_KEYS).toContain('calories');
    expect(HEALTH_TREND_LABELS.calories(i18n.t)).toBe('Calories');
  });

  test('registers mood as the newest trend, after vo2max', () => {
    expect(HEALTH_TREND_KEYS.indexOf('mood')).toBe(
      HEALTH_TREND_KEYS.indexOf('vo2max') + 1
    );
    expect(HEALTH_TREND_LABELS.mood(i18n.t)).toBe('Mood');
  });
});
