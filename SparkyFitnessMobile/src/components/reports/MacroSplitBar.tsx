import React from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { formatLocalizedNumber } from '../../localization';
import type { MacroSplit } from '../../utils/nutritionReport';

interface MacroSplitBarProps {
  split: MacroSplit;
  labels: { protein: string; carbs: string; fat: string };
}

/** One bar of protein / carbs / fat shares of macro calories, with a legend underneath. */
const MacroSplitBar: React.FC<MacroSplitBarProps> = ({ split, labels }) => {
  const [proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string];

  const parts = [
    {
      key: 'protein',
      label: labels.protein,
      pct: split.proteinPct,
      color: proteinColor,
    },
    {
      key: 'carbs',
      label: labels.carbs,
      pct: split.carbsPct,
      color: carbsColor,
    },
    { key: 'fat', label: labels.fat, pct: split.fatPct, color: fatColor },
  ];

  return (
    <View testID="macro-split">
      <View className="flex-row h-3 rounded-full overflow-hidden">
        {parts.map((part) => (
          <View
            key={part.key}
            style={{
              flex: Math.max(part.pct, 0.01),
              backgroundColor: part.color,
            }}
          />
        ))}
      </View>
      <View className="flex-row justify-between mt-3">
        {parts.map((part) => (
          <View key={part.key} className="flex-row items-center">
            <View
              className="w-2.5 h-2.5 rounded-full mr-1.5"
              style={{ backgroundColor: part.color }}
            />
            <Text
              className="text-text-secondary text-sm"
              testID={`macro-split-${part.key}`}
            >
              {part.label} {formatLocalizedNumber(Math.round(part.pct))}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export default MacroSplitBar;
