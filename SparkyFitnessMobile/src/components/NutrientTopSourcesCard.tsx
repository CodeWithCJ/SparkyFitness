import { useCSSVariable } from 'uniwind';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';

import Icon from './Icon';
import { formatTooltipDate } from './charts/chartFormatting';
import { formatLocalizedNumber } from '../localization';
import { MEAL_CONFIG, getLocalizedMealLabel } from '../constants/meals';
import { buildTopSources, mealTypesInEntries } from '../utils/nutrientSources';
import type { FoodEntry } from '../types/foodEntries';

type NutrientTopSourcesCardProps = {
  entries: FoodEntry[];
  isLoading: boolean;
  isError: boolean;
  nutrientKey: string;
  nutrientLabel: string;
  unit: string;
  /** `YYYY-MM-DD` day picked on the chart, or null for the whole range. */
  selectedDay: string | null;
  /** Localized label for `selectedDay`. */
  selectedDayLabel: string;
  onClearDay: () => void;
  /** Opens one contributing diary entry. */
  onViewEntry: (entry: FoodEntry) => void;
};

const formatAmount = (value: number) =>
  formatLocalizedNumber(value, {
    maximumFractionDigits: value % 1 !== 0 ? 1 : 0,
  });

const NutrientTopSourcesCard: React.FC<NutrientTopSourcesCardProps> = ({
  entries,
  isLoading,
  isError,
  nutrientKey,
  nutrientLabel,
  unit,
  selectedDay,
  selectedDayLabel,
  onClearDay,
  onViewEntry,
}) => {
  const { t } = useTranslation();
  const chevronColor = useCSSVariable('--color-progress-track') as string;
  const [mealType, setMealType] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const mealTypes = useMemo(() => mealTypesInEntries(entries), [entries]);
  // A meal type that has dropped out of the range (e.g. after a range switch) is no filter.
  const activeMealType =
    mealType && mealTypes.includes(mealType) ? mealType : null;

  const { sources } = useMemo(
    () =>
      buildTopSources(entries, nutrientKey, {
        day: selectedDay,
        mealType: activeMealType,
      }),
    [entries, nutrientKey, selectedDay, activeMealType]
  );

  const mealLabel = (name: string) =>
    MEAL_CONFIG[name.toLowerCase()]
      ? getLocalizedMealLabel(t, name.toLowerCase())
      : name;

  return (
    <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-text-primary text-base font-bold">
          {t('nutrientTrends.topSources.title', {
            defaultValue: 'Top Sources',
          })}
        </Text>
        {selectedDay ? (
          <TouchableOpacity
            onPress={onClearDay}
            accessibilityRole="button"
            accessibilityLabel={t('nutrientTrends.topSources.clearDay', {
              defaultValue: 'Show whole period',
            })}
            testID="top-sources-clear-day"
          >
            <Text className="text-accent-primary text-sm font-semibold">
              {selectedDayLabel} ✕
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {mealTypes.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
        >
          {[null, ...mealTypes].map((name) => {
            const active = name === activeMealType;
            return (
              <TouchableOpacity
                key={name ?? 'all'}
                onPress={() => setMealType(name)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`top-sources-meal-${name ?? 'all'}`}
                className={`px-3 py-1.5 rounded-full mr-2 ${
                  active ? 'bg-accent-primary' : 'bg-background'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  {name
                    ? mealLabel(name)
                    : t('nutrientTrends.topSources.allMeals', {
                        defaultValue: 'All meals',
                      })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <Text className="text-text-muted text-sm">
          {t('common.loading', { defaultValue: 'Loading...' })}
        </Text>
      ) : isError ? (
        <Text className="text-text-muted text-sm">
          {t('nutrientTrends.topSources.loadFailed', {
            defaultValue: 'Failed to load food sources',
          })}
        </Text>
      ) : sources.length === 0 ? (
        <Text className="text-text-muted text-sm">
          {t('nutrientTrends.topSources.empty', {
            defaultValue: 'No {{nutrient}} logged for this selection',
            nutrient: nutrientLabel,
          })}
        </Text>
      ) : (
        sources.map((source, index) => {
          const expanded = source.key === expandedKey;
          return (
            <View
              key={source.key}
              className={
                index < sources.length - 1
                  ? 'border-b border-border-subtle'
                  : ''
              }
              testID={`top-source-${index}`}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setExpandedKey(expanded ? null : source.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                testID={`top-source-toggle-${index}`}
                className="py-2"
              >
                <View className="flex-row justify-between items-baseline">
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-text-primary text-sm font-semibold"
                      numberOfLines={1}
                    >
                      {source.name}
                    </Text>
                    {source.brand ? (
                      <Text
                        className="text-text-muted text-xs"
                        numberOfLines={1}
                      >
                        {source.brand}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-text-primary text-sm font-semibold">
                      {formatAmount(source.amount)} {unit}
                    </Text>
                    <Icon
                      name={expanded ? 'chevron-down' : 'chevron-forward'}
                      size={14}
                      color={chevronColor}
                    />
                  </View>
                </View>
                <View className="flex-row items-center mt-1.5">
                  <View className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
                    <View
                      className="h-1.5 rounded-full bg-accent-primary"
                      style={{ width: `${Math.round(source.share * 100)}%` }}
                    />
                  </View>
                  <Text className="text-text-muted text-xs ml-2 w-10 text-right">
                    {t('nutrientTrends.topSources.share', {
                      defaultValue: '{{percent}}%',
                      percent: Math.round(source.share * 100),
                    })}
                  </Text>
                </View>
              </TouchableOpacity>

              {expanded ? (
                <View className="pb-2">
                  {source.entries.map(({ entry, amount }) => (
                    <TouchableOpacity
                      key={entry.id}
                      activeOpacity={0.7}
                      onPress={() => onViewEntry(entry)}
                      accessibilityRole="button"
                      testID={`top-source-entry-${entry.id}`}
                      className="flex-row justify-between items-center py-1.5 pl-3"
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-text-secondary text-xs">
                          {formatTooltipDate(entry.entry_date)}
                        </Text>
                        <Text className="text-text-muted text-xs">
                          {mealLabel(entry.meal_type)} ·{' '}
                          {t('nutrientTrends.topSources.servingAmount', {
                            defaultValue: '{{quantity}} {{unit}}',
                            quantity: formatAmount(entry.quantity),
                            unit: entry.unit,
                          })}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-text-secondary text-xs font-semibold">
                          {formatAmount(amount)} {unit}
                        </Text>
                        <Icon
                          name="chevron-forward"
                          size={12}
                          color={chevronColor}
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
};

export default NutrientTopSourcesCard;
