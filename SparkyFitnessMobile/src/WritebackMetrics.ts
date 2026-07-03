import type { ImageSourcePropType } from 'react-native';

// Writeback metrics (Sparky → OS health store). Kept separate from the read
// HealthMetrics list: those drive background-delivery subscriptions and inbound
// sync, whereas these are outbound and opt-in. Supported on both platforms — Health
// Connect on Android (healthconnect/writeback.ts) and HealthKit on iOS
// (healthkit/writeback.ts), resolved via the top-level ./writeback shim. Off by default.
//
// Mirrors the read metrics' shape (icon + category) so the UI can group them in
// the same accordion style. We start with Nutrition + Hydration; a follow-up PR
// will extend writeback to the other readable metrics (which is why this is a
// category-grouped list rather than a flat pair).

export type WritebackMetricId = 'nutrition' | 'hydration';

/** Inclusive local-calendar-day range (YYYY-MM-DD) for a targeted writeback removal.
 *  `null` removal means "all time" (full purge). */
export interface WritebackDateRange {
  from: string;
  to: string;
}

/** Result of a removal: `ok` is false if any record-type delete failed (partial). */
export interface WritebackRemovalResult {
  ok: boolean;
}

export interface WritebackMetric {
  id: WritebackMetricId;
  label: string;
  /** loadHealthPreference/saveHealthPreference key (under the @HealthConnect prefix on
   *  Android, @HealthKit on iOS — the platform-resolved preferences module owns it). */
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
