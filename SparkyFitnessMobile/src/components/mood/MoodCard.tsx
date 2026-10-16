import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { moodByName, moodValueToTag } from '@workspace/shared';

import Icon from '../Icon';
import { getAppLocale } from '../../localization';
import { useMoodEntriesBetween } from '../../hooks/useMood';
import { getBuiltInMoodLabels } from './moodLabels';
import { addDays, getTodayDate } from '../../utils/dateUtils';
import type { RootStackParamList, TabParamList } from '../../types/navigation';

type MoodCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MoodCardProps {
  navigation: MoodCardNavigation;
  date?: string;
}

export default function MoodCard({ navigation, date }: MoodCardProps) {
  const { t } = useTranslation();
  const selectedDate = date || getTodayDate();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const labels = useMemo(() => getBuiltInMoodLabels(t), [t]);

  const weekStart = addDays(selectedDate, -6);
  const entries = useMoodEntriesBetween(weekStart, selectedDate);

  const todayEntry = entries.find((e) => e.entry_date === selectedDate);
  const todayMood = todayEntry
    ? moodByName(moodValueToTag(todayEntry.mood_value))
    : null;

  const locale = getAppLocale();
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(selectedDate, i - 6);
      const entry = entries.find((e) => e.entry_date === day);
      const [y, m, d] = day.split('-').map(Number);
      return {
        day,
        emoji: entry
          ? moodByName(moodValueToTag(entry.mood_value))?.emoji
          : null,
        label: new Date(y, m - 1, d).toLocaleDateString(locale, {
          weekday: 'narrow',
        }),
      };
    });
  }, [entries, locale, selectedDate]);

  const moodLabel = todayMood
    ? (labels[todayMood.name] ?? todayMood.displayName)
    : null;
  const accessibilityLabel = moodLabel
    ? t('mood.card.loggedA11y', {
        defaultValue: 'Mood on {{date}}: {{mood}}',
        date: selectedDate,
        mood: moodLabel,
      })
    : t('mood.card.emptyA11y', {
        defaultValue: 'Mood on {{date}}: none logged',
        date: selectedDate,
      });

  const openLog = () => navigation.navigate('MoodLog', { date: selectedDate });

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={openLog}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Icon name="mood" size={18} color={accentPrimary} />
          <Text className="text-md font-bold text-text-secondary ml-2">
            {t('mood.logTitle', { defaultValue: 'Mood' })}
          </Text>
        </View>
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      </View>

      {todayMood ? (
        <Text className="text-sm font-medium text-text-primary mb-3">
          {todayMood.emoji} {labels[todayMood.name] ?? todayMood.displayName}
        </Text>
      ) : (
        <View className="flex-row items-center justify-between py-1 mb-3">
          <Text className="text-sm text-text-muted flex-1 mr-2">
            {t('mood.card.notLogged', {
              defaultValue: 'No mood logged for this day',
            })}
          </Text>
          <TouchableOpacity
            onPress={openLog}
            className="px-2.5 py-1.5 rounded-lg bg-accent-primary"
          >
            <Text className="text-xs font-semibold text-white">
              {t('mood.card.log', { defaultValue: '+ Log' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="pt-2.5 border-t border-border/40">
        <Text className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">
          {t('mood.card.trend7d', { defaultValue: '7-Day Trend' })}
        </Text>
        <View className="flex-row justify-between items-center px-1">
          {days.map((d) => (
            <View key={d.day} className="items-center">
              <View
                className={`w-7 h-7 rounded-full items-center justify-center bg-raised ${
                  d.day === selectedDate ? 'border-2 border-accent-primary' : ''
                }`}
              >
                {d.emoji ? (
                  <Text style={{ fontSize: 15 }}>{d.emoji}</Text>
                ) : (
                  <View className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
                )}
              </View>
              <Text
                className={`text-[10px] mt-1 ${
                  d.day === selectedDate
                    ? 'font-bold text-accent-primary'
                    : 'text-text-muted'
                }`}
              >
                {d.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}
