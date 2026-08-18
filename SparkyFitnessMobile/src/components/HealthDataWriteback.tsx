import React, { useState } from 'react';
import { View, Text, Image, Platform } from 'react-native';
import CollapsibleSection from './CollapsibleSection';
import Button from './ui/Button';
import BottomSheetPicker from './BottomSheetPicker';
import Switch from './ui/Switch';
import { useTranslation } from 'react-i18next';
import { getHealthMetricLabel, getHealthCategoryLabel } from '../HealthMetrics';
import {
  WRITEBACK_METRICS,
  WRITEBACK_CATEGORY_ORDER,
  type WritebackMetric,
} from '../WritebackMetrics';

interface HealthDataWritebackProps {
  writebackStates: Record<string, boolean>;
  handleToggleWriteback: (metric: WritebackMetric, newValue: boolean) => void;
  /** Delete all SparkyFitness-written records (full purge — caller confirms). */
  onRemoveAllData: () => void;
  /** Open the date-range picker to remove a window of records. */
  onRemoveDateRange: () => void;
}

// Remove-scope choices shown in the bottom-sheet menu.
type RemoveScope = 'all' | 'range';

const groupByCategory = (metrics: WritebackMetric[]): Record<string, WritebackMetric[]> =>
  metrics.reduce(
    (acc, metric) => {
      (acc[metric.category] ??= []).push(metric);
      return acc;
    },
    {} as Record<string, WritebackMetric[]>,
  );

/**
 * Opt-in toggles for writing SparkyFitness diary data out to the OS health store
 * (Health Connect on Android, Apple Health on iOS). Grouped into accordion categories
 * to match the read "Health Data to Sync" card. Mobile-only; renders nothing elsewhere.
 */
const HealthDataWriteback: React.FC<HealthDataWritebackProps> = ({
  writebackStates,
  handleToggleWriteback,
  onRemoveAllData,
  onRemoveDateRange,
}) => {
  const { t } = useTranslation();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  const storeName = Platform.OS === 'ios' ? t('healthSync.appleHealth', { defaultValue: 'Apple Health' }) : t('healthSync.healthConnect', { defaultValue: 'Health Connect' });
  const grouped = groupByCategory(WRITEBACK_METRICS);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const renderMetricItem = (metric: WritebackMetric) => {
    const metricLabel = getHealthMetricLabel(t, metric);
    return (
    <View key={metric.id} className="flex-row justify-between items-center mb-2">
      <View className="flex-row items-center flex-1 mr-2">
        <Image source={metric.icon} className="w-6 h-6" />
        <Text className="ml-2 text-base text-text-primary flex-shrink" numberOfLines={1}>
          {metricLabel}
        </Text>
      </View>
      <Switch
        accessibilityLabel={t('healthSync.writeMetricLabel', { defaultValue: 'Write {{metric}} to {{store}}', metric: metricLabel, store: storeName })}
        accessibilityHint={t('healthSync.writeMetricHint', { defaultValue: 'Toggles writing this metric to the health store.' })}
        onValueChange={(newValue) => handleToggleWriteback(metric, newValue)}
        value={!!writebackStates[metric.id]}
      />
    </View>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-1 text-text-primary">{t('healthSync.writeTitle', { defaultValue: 'Write to {{store}}', store: storeName })}</Text>
      <Text className="text-sm text-text-muted mb-3">
        {t('healthSync.writeSummary', { defaultValue: 'Syncs the data you log in SparkyFitness out to {{store}}, keeping the two in sync.', store: storeName })}
      </Text>
      {WRITEBACK_CATEGORY_ORDER.map((category) => {
        const metricsInCategory = grouped[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={getHealthCategoryLabel(t, category)}
            expanded={!collapsedCategories.has(category)}
            onToggle={() => toggleCategory(category)}
            itemCount={metricsInCategory.length}
          >
            {metricsInCategory.map(renderMetricItem)}
          </CollapsibleSection>
        );
      })}
      <BottomSheetPicker<RemoveScope>
        value={'' as RemoveScope}
        title={t('healthSync.removeFrom', { defaultValue: 'Remove from {{store}}', store: storeName })}
        options={[
          { label: t('healthSync.allTime', { defaultValue: 'All time' }), value: 'all' },
          { label: t('healthSync.pickDateRange', { defaultValue: 'Pick a date range…' }), value: 'range' },
        ]}
        onSelect={(scope) => (scope === 'all' ? onRemoveAllData() : onRemoveDateRange())}
        renderTrigger={({ onPress }) => (
          <Button variant="ghost" onPress={onPress} className="mt-2 py-1 px-0 self-start">
            <Text className="text-sm font-medium text-text-danger-subtle">
              {t('healthSync.removeData', { defaultValue: 'Remove SparkyFitness data from {{store}}', store: storeName })}
            </Text>
          </Button>
        )}
      />
    </View>
  );
};

export default HealthDataWriteback;
