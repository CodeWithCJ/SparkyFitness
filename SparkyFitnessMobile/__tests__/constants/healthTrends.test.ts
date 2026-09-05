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
    };

    for (const key of HEALTH_TREND_KEYS) {
      expect(HEALTH_TREND_LABELS[key](i18n.t)).toBe(englishDefaults[key]);
    }
  });

  test('the default order leads with the trends the pager shipped with', () => {
    // A user who never opens the settings screen must see exactly the pager they had
    // before it became configurable, so these keys stay frozen in this order.
    expect(HEALTH_TREND_KEYS.slice(0, 3)).toEqual(['steps', 'weight', 'sleep']);
  });
});
