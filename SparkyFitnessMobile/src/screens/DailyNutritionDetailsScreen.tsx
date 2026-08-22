import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useDailySummary } from '../hooks/useDailySummary';
import { useNutrientDisplayPreferences } from '../hooks/useNutrientDisplayPreferences';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useServerConnection } from '../hooks/useServerConnection';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import NutritionMacroCard from '../components/NutritionMacroCard';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import {
  resolveSupplementTotals,
  FOOD_VARIANT_NUTRIENT_FIELDS,
} from '@workspace/shared';
import type { FoodVariantNutrientField } from '@workspace/shared';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodEntry } from '../types/foodEntries';
import { formatLocalizedNumber } from '../localization';

type DailyNutritionDetailsScreenProps = RootStackScreenProps<'DailyNutritionDetails'>;

type GlycemicIndexValue = 'None' | 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';

/**
 * The API/database constrains glycemic_index to a controlled classification enum.
 * Keep the persisted value unchanged and localize only its presentation label.
 * Unknown future values remain readable rather than leaking an i18n key.
 */
export function getGlycemicIndexLabel(
  t: (key: string, options: { defaultValue: string }) => string,
  value: string,
): string {
  switch (value as GlycemicIndexValue) {
    case 'None':
      return t('nutrients.glycemicIndexNone', { defaultValue: 'None' });
    case 'Very Low':
      return t('nutrients.glycemicIndexVeryLow', { defaultValue: 'Very Low' });
    case 'Low':
      return t('nutrients.glycemicIndexLow', { defaultValue: 'Low' });
    case 'Medium':
      return t('nutrients.glycemicIndexMedium', { defaultValue: 'Medium' });
    case 'High':
      return t('nutrients.glycemicIndexHigh', { defaultValue: 'High' });
    case 'Very High':
      return t('nutrients.glycemicIndexVeryHigh', { defaultValue: 'Very High' });
    default:
      return value;
  }
}

const DailyNutritionDetailsScreen: React.FC<DailyNutritionDetailsScreenProps> = ({ route, navigation }) => {
  const { t } = useTranslation();
  const { date } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { isConnected } = useServerConnection();

  const { summary, isLoading, isError } = useDailySummary({ date });
  const { preferences } = useNutrientDisplayPreferences({ enabled: isConnected });
  const { customNutrients: customDefs } = useCustomNutrients({ enabled: isConnected });

  const [accentColor, progressTrackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-progress-track',
  ]) as [string, string];

  // Configure screen header
  const header = useScreenHeader({
    title: t('dailyNutritionDetails.title', { defaultValue: 'Nutrition Details' }),
    left: { kind: 'back' },
  });

  // Calculate standard nutrient totals from food entries
  const calculateNutrientTotal = (entries: FoodEntry[], key: keyof FoodEntry): number => {
    return entries.reduce((total, entry) => {
      if (!entry.serving_size) return total;
      const value = entry[key];
      if (typeof value !== 'number') return total;
      return total + (value * entry.quantity) / entry.serving_size;
    }, 0);
  };

  // Determine standard and custom display items ordered and filtered by report_tabular preference
  const displayGroups = useMemo(() => {
    if (!summary) return null;

    const reportPref = preferences.find(
      (p) => p.view_group === 'report_tabular' && p.platform === 'mobile',
    ) || preferences.find(
      (p) => p.view_group === 'report_tabular' && p.platform === 'web',
    );

    // Default visible keys in a logical fallback order if no report preferences are found
    const visibleKeys = reportPref
      ? (reportPref.visible_nutrients as string[])
      : [
          'dietary_fiber',
          'sugars',
          'saturated_fat',
          'trans_fat',
          'cholesterol',
          'sodium',
          'potassium',
          'vitamin_a',
          'vitamin_c',
          'calcium',
          'iron',
        ];

    // Build lists of nutrients grouped into categories for a clean dashboard view
    const standardItems: {
      key: string;
      label: string;
      unit: string;
      consumed: number;
      goal?: number;
    }[] = [];

    const customItems: {
      key: string;
      label: string;
      unit: string;
      consumed: number;
      goal?: number;
    }[] = [];

    // Logged supplement doses, full width and zero-filled, so a fixed nutrient computed
    // from food entries below can have its supplement contribution added back (#2145).
    const supplements = resolveSupplementTotals(summary.supplementTotals);
    const isFixedNutrient = (key: string): key is FoodVariantNutrientField =>
      (FOOD_VARIANT_NUTRIENT_FIELDS as readonly string[]).includes(key);

    // Filter and compute standard nutrients in order of visibleKeys
    for (const key of visibleKeys) {
      // Exclude base macros from the detailed breakdown if they are already visible in top card
      if (['calories', 'protein', 'carbs', 'fat'].includes(key)) {
        continue;
      }

      if (key === 'glycemic_index') {
        standardItems.push({
          key,
          label: getNutrientLabel(t, key),
          unit: '',
          consumed: 0, // categorical, handled specifically in render
          goal: undefined,
        });
        continue;
      }

      const meta = NUTRIENT_META[key];
      if (meta) {
        // Fields the summary already rolls up include logged supplement doses; recomputing
        // one from foodEntries would print a different number from the macro card at the
        // top of this same screen. Fiber is the one that reaches here today, since the
        // other rolled-up fields are excluded above, but keying on the set rather than on
        // fiber keeps that true if the exclusion list ever changes.
        const rolledUp: Record<string, number> = {
          protein: summary.protein.consumed,
          carbs: summary.carbs.consumed,
          fat: summary.fat.consumed,
          dietary_fiber: summary.fiber.consumed,
        };
        // Anything not already rolled up is derived from food entries here, which is
        // food-only. Every fixed nutrient a supplement can carry has to have its dose
        // contribution added back, or this screen shows a smaller calcium than Reports
        // does for the same day.
        const consumed =
          rolledUp[key] ??
          calculateNutrientTotal(summary.foodEntries, key as keyof FoodEntry) +
            (isFixedNutrient(key) ? supplements[key] : 0);
        const goal = summary.goals[key as keyof typeof summary.goals] as number | undefined;

        standardItems.push({
          key,
          label: getNutrientLabel(t, key),
          unit: meta.unit,
          consumed,
          goal: goal && goal > 0 ? goal : undefined,
        });
      }
    }

    // Process custom user-defined nutrients
    const seenCustom = new Set<string>();
    for (const def of customDefs) {
      const isVisible = !reportPref || visibleKeys.includes(def.name);
      if (isVisible) {
        const consumed = summary.customNutrientTotals[def.name] ?? 0;
        const goal = summary.customNutrientGoals[def.name] ?? undefined;
        customItems.push({
          key: def.name,
          label: def.name,
          unit: def.unit || 'g',
          consumed,
          goal: goal && goal > 0 ? goal : undefined,
        });
        seenCustom.add(def.name);
      }
    }

    // Add any logged custom nutrients not in current custom definitions
    for (const [name, consumed] of Object.entries(summary.customNutrientTotals)) {
      if (seenCustom.has(name)) continue;
      const isVisible = !reportPref || visibleKeys.includes(name);
      if (isVisible) {
        const goal = summary.customNutrientGoals[name] ?? undefined;
        customItems.push({
          key: name,
          label: name,
          unit: 'g',
          consumed,
          goal: goal && goal > 0 ? goal : undefined,
        });
      }
    }

    return { standardItems, customItems };
  }, [summary, preferences, customDefs, t]);

  if (isLoading) {
    return <StatusView loading className="bg-background" />;
  }

  if (isError || !summary) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-4">
        <Text className="text-text-primary text-base font-semibold mb-2">
          {t('dailyNutritionDetails.loadFailed', { defaultValue: 'Failed to load nutrition details' })}
        </Text>
        <Text className="text-text-secondary text-sm text-center">
          {t('dailyNutritionDetails.tryAgain', { defaultValue: 'Please check your connection and try again.' })}
        </Text>
      </View>
    );
  }

  const goalPercentages = {
    calories: summary.calorieGoal > 0 ? Math.round((summary.caloriesConsumed / summary.calorieGoal) * 100) : null,
    protein: summary.protein.goal > 0 ? Math.round((summary.protein.consumed / summary.protein.goal) * 100) : null,
    carbs: summary.carbs.goal > 0 ? Math.round((summary.carbs.consumed / summary.carbs.goal) * 100) : null,
    fat: summary.fat.goal > 0 ? Math.round((summary.fat.consumed / summary.fat.goal) * 100) : null,
  };

  const renderNutrientRow = (item: {
    key: string;
    label: string;
    unit: string;
    consumed: number;
    goal?: number;
  }) => {
    if (item.key === 'glycemic_index') {
      const giValues = summary.foodEntries
        .map((e) => e.glycemic_index)
        .filter((gi) => gi && gi !== 'None');
      const giValue = giValues[0] ?? 'None';
      const giDisplayValue = getGlycemicIndexLabel(t, giValue);

      return (
        <View key={item.key} className="py-3 border-b border-border-subtle">
          <View className="flex-row justify-between items-center">
            <Text className="text-text-secondary text-sm font-medium">{item.label}</Text>
            <Text className="text-text-primary text-sm font-semibold">{giDisplayValue}</Text>
          </View>
        </View>
      );
    }

    const hasGoal = item.goal !== undefined && item.goal > 0;
    const progressPercent = hasGoal ? Math.min(Math.round((item.consumed / (item.goal || 1)) * 100), 100) : 0;

    let subText = '';
    if (hasGoal) {
      const diff = item.goal! - item.consumed;
      const remainingLabel = diff > 0 ? t('dailyNutritionDetails.left', { defaultValue: '{{value}}{{unit}} left', value: formatLocalizedNumber(Math.round(diff)), unit: item.unit }) : diff < 0 ? t('dailyNutritionDetails.over', { defaultValue: '{{value}}{{unit}} over', value: formatLocalizedNumber(Math.round(Math.abs(diff))), unit: item.unit }) : t('dailyNutritionDetails.met', { defaultValue: 'met' });
      const pct = Math.round((item.consumed / item.goal!) * 100);
      subText = t('dailyNutritionDetails.percentRemaining', { defaultValue: '{{percent}}% · {{remaining}}', percent: pct, remaining: remainingLabel });
    }

    return (
      <TouchableOpacity
        key={item.key}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate('NutrientTrends', {
            nutrientKey: item.key,
            nutrientLabel: item.label,
            unit: item.unit,
            goal: item.goal,
          })
        }
        className="py-3 border-b border-border-subtle"
      >
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-text-secondary text-sm font-medium">{item.label}</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-text-primary text-sm font-semibold">
              {formatLocalizedNumber(Math.round(item.consumed))}{item.unit}
              {hasGoal && ` / ${formatLocalizedNumber(Math.round(item.goal!))}${item.unit}`}
            </Text>
            <Icon name="chevron-forward" size={14} color={progressTrackColor} />
          </View>
        </View>
        {hasGoal && (
          <>
            <View className="h-1.5 bg-progress-track rounded-full overflow-hidden mt-1" style={{ backgroundColor: progressTrackColor }}>
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: accentColor,
                  width: `${progressPercent}%`,
                }}
              />
            </View>
            <Text className="text-[10px] text-text-muted mt-1">
              {subText}
            </Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this modal
      // sheet already starts below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Macronutrients Card */}
        <NutritionMacroCard
          calories={summary.caloriesConsumed}
          protein={summary.protein.consumed}
          carbs={summary.carbs.consumed}
          fat={summary.fat.consumed}
          fiber={summary.fiber.consumed}
          goalPercentages={goalPercentages}
          showNetCarbs={false}
          calorieGoal={summary.calorieGoal}
          proteinGoal={summary.protein.goal}
          carbsGoal={summary.carbs.goal}
          fatGoal={summary.fat.goal}
        />



        {/* Predefined Nutrients Section */}
        {displayGroups && displayGroups.standardItems.length > 0 && (
          <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
            <Text className="text-text-primary text-base font-bold mb-2">{t('dailyNutritionDetails.nutrientBreakdown', { defaultValue: 'Nutrient Breakdown' })}</Text>
            {displayGroups.standardItems.map(renderNutrientRow)}
          </View>
        )}

        {/* Custom Nutrients Section */}
        {displayGroups && displayGroups.customItems.length > 0 && (
          <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
            <Text className="text-text-primary text-base font-bold mb-2">{t('dailyNutritionDetails.customTracked', { defaultValue: 'Custom Tracked Nutrients' })}</Text>
            {displayGroups.customItems.map(renderNutrientRow)}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default DailyNutritionDetailsScreen;
