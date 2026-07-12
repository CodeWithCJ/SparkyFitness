import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import VerifiedBadge from './VerifiedBadge';
import { buildNutrientDisplayList, type NutrientDisplayItem } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';
import NutritionMacroCard, { type NutritionGoalPercentages } from './NutritionMacroCard';
import { useCustomNutrients, useServerConnection } from '../hooks';

interface FoodNutritionSummaryProps {
  name: string;
  brand?: string | null;
  values: FoodDisplayValues;
  servings?: number;
  goalPercentages?: NutritionGoalPercentages;
  goalsLoading?: boolean;
  // Opt-in: when true and values.fiber is available, the carbs row of the
  // macro card swaps to "Net Carbs" (max(0, carbs - fiber)), and a
  // "Total Carbs" row is injected into the nutrient breakdown below.
  // Applied across all surfaces (food detail, meal detail, meal-type detail,
  // food entry, food photo flow) when user_preferences.show_net_carbs is
  // enabled.
  showNetCarbs?: boolean;
  provider_verified?: boolean;
  /** Raw custom nutrient values for this food/variant (key = nutrient name, value = amount per serving). */
  customNutrients?: Record<string, string | number> | null;
}

const FoodNutritionSummary: React.FC<FoodNutritionSummaryProps> = ({
  name,
  brand,
  values,
  servings = 1,
  goalPercentages,
  goalsLoading,
  showNetCarbs = false,
  provider_verified = false,
  customNutrients,
}) => {
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { isConnected } = useServerConnection();
  const { customNutrients: customNutrientDefs } = useCustomNutrients({ enabled: isConnected });

  const [showMoreNutrients, setShowMoreNutrients] = useState(false);

  const scale = (value: number) => value * servings;
  // Gate the Total Carbs row injection on the same condition NutritionMacroCard
  // uses to swap the macro bar to "Net Carbs" — if fiber is unavailable the
  // bar falls back to total carbs and the row would otherwise duplicate it.
  const useNetCarbs = showNetCarbs && values.fiber !== undefined;
  const { primary: primaryNutrients, additional: additionalNutrients } = useMemo(
    () =>
      buildNutrientDisplayList(values, {
        showNetCarbs: useNetCarbs,
        // Pass raw carbs; renderRow scales by `servings` like every other row.
        carbs: useNetCarbs ? values.carbs : undefined,
      }),
    [values, useNetCarbs],
  );

  // Build custom nutrient rows: show ALL user-defined custom nutrients (from defs),
  // using values from the prop when available and 0 otherwise. Also include any
  // prop values not covered by the current user definitions.
  const customNutrientRows = useMemo((): NutrientDisplayItem[] => {
    const rows: NutrientDisplayItem[] = [];
    const seen = new Set<string>();

    for (const def of customNutrientDefs) {
      const rawValue = customNutrients?.[def.name];
      const value = rawValue == null
        ? 0
        : typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      rows.push({ label: def.name, value: isNaN(value) ? 0 : value, unit: def.unit });
      seen.add(def.name);
    }

    if (customNutrients) {
      for (const [name, rawValue] of Object.entries(customNutrients)) {
        if (seen.has(name)) continue;
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
        if (isNaN(value)) continue;
        rows.push({ label: name, value, unit: '' });
      }
    }

    return rows;
  }, [customNutrients, customNutrientDefs]);

  const renderRow = (nutrient: NutrientDisplayItem, showBorder: boolean) => (
    <View
      key={nutrient.label}
      className={`flex-row justify-between py-1 ${showBorder ? 'border-b border-border-subtle' : ''}`}
    >
      <Text className="text-text-secondary text-sm">{nutrient.label}</Text>
      <Text className="text-text-primary text-sm">
        {Math.round(scale(nutrient.value))}
        {nutrient.unit}
      </Text>
    </View>
  );

  const hasAdditional = additionalNutrients.length > 0 || customNutrientRows.length > 0;
  const showAdditionalRows = showMoreNutrients && hasAdditional;
  const layoutTransition = LinearTransition.duration(250);

  return (
    <Animated.View className="gap-4" layout={layoutTransition}>
      <View>
        <View className="flex-row items-start gap-1.5">
          <Text className="text-text-primary text-3xl font-bold flex-shrink">{name}</Text>
          {provider_verified ? <VerifiedBadge size="md" style={{ marginTop: 5 }} /> : null}
        </View>
        {brand ? (
          <Text className="text-text-secondary text-base mt-1">{brand}</Text>
        ) : null}
      </View>

      <NutritionMacroCard
        calories={scale(values.calories)}
        protein={scale(values.protein)}
        carbs={scale(values.carbs)}
        fat={scale(values.fat)}
        fiber={values.fiber !== undefined ? scale(values.fiber) : undefined}
        goalPercentages={goalPercentages}
        goalsLoading={goalsLoading}
        showNetCarbs={showNetCarbs}
      />

      {primaryNutrients.length > 0 ? (
        <Animated.View className="rounded-xl" layout={layoutTransition}>
          {primaryNutrients.map((nutrient, index) => {
            const isLastVisible =
              index === primaryNutrients.length - 1 && !showAdditionalRows;
            return renderRow(nutrient, !isLastVisible);
          })}
          {showAdditionalRows ? (
            <Animated.View
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(150)}
              layout={layoutTransition}
            >
              {additionalNutrients.map((nutrient, index) =>
                renderRow(nutrient, index < additionalNutrients.length - 1 || customNutrientRows.length > 0),
              )}
              {customNutrientRows.map((nutrient, index) =>
                renderRow(nutrient, index < customNutrientRows.length - 1),
              )}
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}

      {hasAdditional ? (
        <Animated.View layout={layoutTransition}>
          <Button
            variant="ghost"
            onPress={() => setShowMoreNutrients((prev) => !prev)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="self-start py-0 px-0"
          >
            <Text style={{ color: accentColor }} className="text-sm font-medium">
              {showMoreNutrients ? 'Hide extra nutrients ▴' : 'Show more nutrients ▾'}
            </Text>
          </Button>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
};

export default FoodNutritionSummary;
