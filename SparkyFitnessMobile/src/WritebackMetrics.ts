import type { ImageSourcePropType } from 'react-native';

// Health Connect writeback metrics (Sparky → HC). Kept separate from the read
// HealthMetrics list: those drive background-delivery subscriptions and inbound
// sync, whereas these are outbound, opt-in, and Android-only. Off by default.
//
// Mirrors the read metrics' shape (icon + category) so the UI can group them in
// the same accordion style. We start with Nutrition + Hydration; a follow-up PR
// will extend writeback to the other readable metrics (which is why this is a
// category-grouped list rather than a flat pair).

export type WritebackMetricId = 'nutrition' | 'hydration';

export interface WritebackMetric {
  id: WritebackMetricId;
  label: string;
  /** loadHealthPreference/saveHealthPreference key (under the @HealthConnect prefix). */
  preferenceKey: string;
  recordType: 'Nutrition' | 'Hydration';
  permission: { accessType: 'write'; recordType: 'Nutrition' | 'Hydration' };
  icon: ImageSourcePropType;
  category: string;
}

export const WRITEBACK_METRICS: WritebackMetric[] = [
  {
    id: 'nutrition',
    label: 'Nutrition',
    preferenceKey: 'writebackNutritionEnabled',
    recordType: 'Nutrition',
    permission: { accessType: 'write', recordType: 'Nutrition' },
    icon: require('../assets/icons/health-metrics/nutrition.png'),
    category: 'Nutrition',
  },
  {
    id: 'hydration',
    label: 'Hydration',
    preferenceKey: 'writebackHydrationEnabled',
    recordType: 'Hydration',
    permission: { accessType: 'write', recordType: 'Hydration' },
    icon: require('../assets/icons/health-metrics/hydration.png'),
    category: 'Nutrition',
  },
];

/** Order categories render in (mirrors the read section's grouping). */
export const WRITEBACK_CATEGORY_ORDER: string[] = ['Nutrition'];
