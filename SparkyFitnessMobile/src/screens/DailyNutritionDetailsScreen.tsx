import React, { useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useDailySummary } from '../hooks/useDailySummary';
import { useNutrientDisplayPreferences } from '../hooks/useNutrientDisplayPreferences';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useServerConnection } from '../hooks/useServerConnection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { NUTRIENT_META } from '../constants/nutrients';
import NutritionMacroCard from '../components/NutritionMacroCard';
import Icon from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodEntry } from '../types/foodEntries';

type DailyNutritionDetailsScreenProps = RootStackScreenProps<'DailyNutritionDetails'>;

const DailyNutritionDetailsScreen: React.FC<DailyNutritionDetailsScreenProps> = ({ route, navigation }) => {
  const { date } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
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
    title: 'Nutrition Details',
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

    // Filter and compute standard nutrients in order of visibleKeys
    for (const key of visibleKeys) {
      // Exclude base macros from the detailed breakdown if they are already visible in top card
      if (['calories', 'protein', 'carbs', 'fat'].includes(key)) {
        continue;
      }

      if (key === 'glycemic_index') {
        standardItems.push({
          key,
          label: NUTRIENT_META[key]?.label ?? 'Glycemic Index',
          unit: '',
          consumed: 0, // categorical, handled specifically in render
          goal: undefined,
        });
        continue;
      }

      const meta = NUTRIENT_META[key];
      if (meta) {
        const consumed = calculateNutrientTotal(summary.foodEntries, key as keyof FoodEntry);
        const goal = summary.goals[key as keyof typeof summary.goals] as number | undefined;

        standardItems.push({
          key,
          label: meta.label,
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
  }, [summary, preferences, customDefs]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !summary) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-4">
        <Text className="text-text-primary text-base font-semibold mb-2">
          Failed to load nutrition details
        </Text>
        <Text className="text-text-secondary text-sm text-center">
          Please check your connection and try again.
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
      const giValue = giValues.length > 0 ? giValues[0] : 'None';

      return (
        <View key={item.key} className="py-3 border-b border-border-subtle">
          <View className="flex-row justify-between items-center">
            <Text className="text-text-secondary text-sm font-medium">{item.label}</Text>
            <Text className="text-text-primary text-sm font-semibold">{giValue}</Text>
          </View>
        </View>
      );
    }

    const hasGoal = item.goal !== undefined && item.goal > 0;
    const progressPercent = hasGoal ? Math.min(Math.round((item.consumed / (item.goal || 1)) * 100), 100) : 0;

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
        <View className="flex-row justify-between items-baseline mb-1">
          <Text className="text-text-secondary text-sm font-medium">{item.label}</Text>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-text-primary text-sm font-semibold">
              {Math.round(item.consumed).toLocaleString()}
              <Text className="text-text-muted text-xs font-normal"> {item.unit}</Text>
              {hasGoal && (
                <Text className="text-text-muted text-xs font-normal">
                  {` / ${Math.round(item.goal!).toLocaleString()} ${item.unit}`}
                </Text>
              )}
            </Text>
            <Icon name="chevron-forward" size={14} color={progressTrackColor} />
          </View>
        </View>
        {hasGoal && (
          <View className="h-1.5 bg-progress-track rounded-full overflow-hidden mt-1" style={{ backgroundColor: progressTrackColor }}>
            <View
              className="h-full rounded-full"
              style={{
                backgroundColor: accentColor,
                width: `${progressPercent}%`,
              }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
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
            <Text className="text-text-primary text-base font-bold mb-2">Nutrient Breakdown</Text>
            {displayGroups.standardItems.map(renderNutrientRow)}
          </View>
        )}

        {/* Custom Nutrients Section */}
        {displayGroups && displayGroups.customItems.length > 0 && (
          <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
            <Text className="text-text-primary text-base font-bold mb-2">Custom Tracked Nutrients</Text>
            {displayGroups.customItems.map(renderNutrientRow)}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default DailyNutritionDetailsScreen;
