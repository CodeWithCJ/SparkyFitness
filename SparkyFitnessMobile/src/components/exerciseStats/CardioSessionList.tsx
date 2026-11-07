import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import {
  cardioSessionHeadline,
  daysBetween,
  type ExerciseActivityQueryItem,
  EnergyUnit,
} from '@workspace/shared';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import Icon from '../Icon';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { energyUnitLabel, formatEnergyNumber } from '../../utils/energyUnit';

interface CardioSessionListProps {
  sessions: readonly ExerciseActivityQueryItem[];
  distanceUnit: 'km' | 'miles';
  today: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onOpen: (session: ExerciseActivityQueryItem) => void;
}

const dateFromDay = (day: string) => {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1);
};

const dayLabel = (t: TFunction, day: string, today: string) => {
  const age = daysBetween(day.slice(0, 10), today);
  if (age <= 0) {
    return t('exerciseStatistics.recovery.today', { defaultValue: 'Today' });
  }
  if (age === 1) {
    return t('exerciseStatistics.recovery.yesterday', {
      defaultValue: 'Yesterday',
    });
  }
  const locale = getAppLocale();
  return age < 7
    ? dateFromDay(day).toLocaleDateString(locale, { weekday: 'long' })
    : dateFromDay(day).toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
      });
};

const headlineText = (
  t: TFunction,
  session: ExerciseActivityQueryItem,
  distanceUnit: 'km' | 'miles',
  energyUnit: EnergyUnit
) => {
  const stat = cardioSessionHeadline(session);
  if (stat.kind === 'distance') {
    const value = formatLocalizedNumber(stat.value, {
      minimumFractionDigits: stat.value >= 10 ? 1 : 2,
      maximumFractionDigits: stat.value >= 10 ? 1 : 2,
    });
    return `${value} ${
      distanceUnit === 'miles'
        ? t('exerciseStatistics.cardio.unitMi', { defaultValue: 'mi' })
        : t('exerciseStatistics.cardio.unitKm', { defaultValue: 'km' })
    }`;
  }
  if (stat.kind === 'calories') {
    return t('exerciseStatistics.cardio.caloriesWithUnit', {
      defaultValue: '{{value}} {{unit}}',
      value: formatEnergyNumber(stat.value, energyUnit),
      unit: energyUnitLabel(energyUnit, t),
    });
  }
  return t('exerciseStatistics.cardio.minutes', {
    count: stat.value,
    formattedCount: formatLocalizedNumber(stat.value),
    defaultValue: '{{formattedCount}} min',
    defaultValue_one: '{{formattedCount}} min',
    defaultValue_other: '{{formattedCount}} min',
  });
};

/** Cardio sessions newest first, grouped by month. Strength is left out. */
const CardioSessionList: React.FC<CardioSessionListProps> = ({
  sessions,
  distanceUnit,
  today,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onOpen,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();

  const groups = useMemo(() => {
    const locale = getAppLocale();
    const result: { label: string; items: ExerciseActivityQueryItem[] }[] = [];
    for (const session of sessions) {
      const label = dateFromDay(session.entryDate).toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric',
      });
      const last = result[result.length - 1];
      if (last && last.label === label) {
        last.items.push(session);
      } else {
        result.push({ label, items: [session] });
      }
    }
    return result;
  }, [sessions]);

  return (
    <View>
      {groups.map((group) => (
        <View key={group.label} className="mb-3">
          <Text className="text-text-secondary text-sm font-semibold mb-2">
            {group.label}
          </Text>
          <View className="bg-surface rounded-xl shadow-sm overflow-hidden">
            {group.items.map((session, index) => (
              <Pressable
                key={session.id}
                onPress={() => onOpen(session)}
                accessibilityRole="button"
                className={`px-4 py-3 flex-row items-center justify-between ${
                  index < group.items.length - 1
                    ? 'border-b border-border-subtle'
                    : ''
                }`}
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-text-primary text-sm" numberOfLines={1}>
                    {session.exerciseName}
                  </Text>
                  <Text className="text-text-primary text-lg font-semibold">
                    {headlineText(t, session, distanceUnit, energyUnit)}
                  </Text>
                </View>
                <Text className="text-text-secondary text-sm mr-2">
                  {dayLabel(t, session.entryDate, today)}
                </Text>
                <Icon name="chevron-forward" size={16} color="#999" />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      {hasMore ? (
        <Pressable
          onPress={onLoadMore}
          disabled={isLoadingMore}
          accessibilityRole="button"
          className="py-3 items-center rounded-lg border border-border-subtle"
        >
          {isLoadingMore ? (
            <ActivityIndicator />
          ) : (
            <Text className="text-text-secondary text-sm font-medium">
              {t('exerciseStatistics.cardio.olderSessions', {
                defaultValue: 'Older sessions',
              })}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
};

export default CardioSessionList;
