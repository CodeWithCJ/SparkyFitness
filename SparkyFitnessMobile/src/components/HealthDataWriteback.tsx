import React, { useState } from 'react';
import { View, Text, Switch, Image, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import CollapsibleSection from './CollapsibleSection';
import Button from './ui/Button';
import BottomSheetPicker from './BottomSheetPicker';
import {
  WRITEBACK_METRICS,
  WRITEBACK_CATEGORY_ORDER,
  type WritebackMetric,
} from '../WritebackMetrics';
import { useTranslation } from 'react-i18next';

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

const WRITEBACK_METRIC_LABEL_KEYS: Record<string, string> = {
  nutrition: 'healthWriteback.metrics.nutrition',
  hydration: 'healthWriteback.metrics.hydration',
};

const WRITEBACK_CATEGORY_LABEL_KEYS: Record<string, string> = {
  Nutrition: 'healthDataSync.categories.Nutrition',
};

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
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const { t } = useTranslation();
  const translate = t;

  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }

  const storeName = Platform.OS === 'ios' ? t('healthDataSync.appleHealth') : t('healthDataSync.healthConnect');
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

  const renderMetricItem = (metric: WritebackMetric) => (
    <View key={metric.id} className="flex-row justify-between items-center mb-2">
      <View className="flex-row items-center flex-1 mr-2">
        <Image source={metric.icon} className="w-6 h-6" />
        <Text className="ml-2 text-base text-text-primary flex-shrink" numberOfLines={1}>
          {WRITEBACK_METRIC_LABEL_KEYS[metric.id]
            ? translate(WRITEBACK_METRIC_LABEL_KEYS[metric.id])
            : metric.label}
        </Text>
      </View>
      <Switch
        onValueChange={(newValue) => handleToggleWriteback(metric, newValue)}
        value={!!writebackStates[metric.id]}
        trackColor={{ false: formDisabled, true: formEnabled }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-lg font-bold mb-1 text-text-primary">{t('healthWriteback.writeTo', { storeName })}</Text>
      <Text className="text-sm text-text-muted mb-3">
        {t('healthWriteback.description', { storeName })}
      </Text>
      {WRITEBACK_CATEGORY_ORDER.map((category) => {
        const metricsInCategory = grouped[category];
        if (!metricsInCategory || metricsInCategory.length === 0) {
          return null;
        }
        return (
          <CollapsibleSection
            key={category}
            title={WRITEBACK_CATEGORY_LABEL_KEYS[category]
              ? translate(WRITEBACK_CATEGORY_LABEL_KEYS[category])
              : category}
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
         title={t('healthWriteback.removeTitle', { storeName })}
        options={[
           { label: t('healthWriteback.allTime'), value: 'all' },
           { label: t('healthWriteback.pickDateRange'), value: 'range' },
        ]}
        onSelect={(scope) => (scope === 'all' ? onRemoveAllData() : onRemoveDateRange())}
        renderTrigger={({ onPress }) => (
          <Button variant="ghost" onPress={onPress} className="mt-2 py-1 px-0 self-start">
            <Text className="text-sm font-medium text-text-danger-subtle">
              {t('healthWriteback.removeData', { storeName })}
            </Text>
          </Button>
        )}
      />
    </View>
  );
};

export default HealthDataWriteback;
