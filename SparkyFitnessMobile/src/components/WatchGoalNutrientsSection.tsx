import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { getNutrientLabel } from '../constants/nutrients';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useServerConnection } from '../hooks/useServerConnection';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveKeyOrder } from '../utils/reorderUtils';
import { WATCH_STANDARD_NUTRIENT_KEYS } from '../utils/watchNutrients';
import { ReorderSwitchList } from './ReorderSwitchList';

/**
 * Which nutrients a watch's Goals page lists under the calorie ring, and in
 * what order. Settings → Apple Watch / Wear OS and Settings → Garmin both
 * show it over the same preference, so a change reaches every watch.
 */
export const WatchGoalNutrientsSection: React.FC = () => {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });

  const watchNutrientOrder = useAppPreferencesStore(
    (s) => s.watchNutrientOrder
  );
  const shownWatchNutrients = useAppPreferencesStore(
    (s) => s.shownWatchNutrients
  );
  const setWatchNutrientOrder = useAppPreferencesStore(
    (s) => s.setWatchNutrientOrder
  );
  const setWatchNutrientShown = useAppPreferencesStore(
    (s) => s.setWatchNutrientShown
  );

  // Standard nutrients, then the account's custom ones, in the saved order.
  const nutrientItems = useMemo(() => {
    const customNames = customNutrients.map((def) => def.name);
    return resolveKeyOrder(watchNutrientOrder, [
      ...WATCH_STANDARD_NUTRIENT_KEYS,
      ...customNames,
    ]).map((key) => ({
      key,
      label: customNames.includes(key) ? key : getNutrientLabel(t, key),
    }));
  }, [watchNutrientOrder, customNutrients, t]);

  return (
    <>
      <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
        {t('watchSettings.nutrientsTitle', {
          defaultValue: 'Goals page nutrients',
        })}
      </Text>
      <Text className="text-text-secondary text-sm mb-4">
        {t('watchSettings.nutrientsDescription', {
          defaultValue:
            'Choose the nutrients listed under the calorie ring on your watch, and drag to set their order. Each shows today’s amount against its goal.',
        })}
      </Text>
      <ReorderSwitchList
        items={nutrientItems}
        testIDPrefix="watch-nutrient"
        isEnabled={(key) => shownWatchNutrients.includes(key)}
        onToggle={setWatchNutrientShown}
        onReorder={setWatchNutrientOrder}
        reorderA11yLabel={(name) =>
          t('watchSettings.reorder', {
            defaultValue: 'Reorder {{name}}',
            name,
          })
        }
        reorderA11yHint={t('watchSettings.nutrientReorderHint', {
          defaultValue: 'Changes where this nutrient sits on your watch',
        })}
      />
    </>
  );
};
