import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from '../Icon';
import { useOralCareDay } from '../../hooks/useOralCare';
import { formatOralCareClock } from '../../utils/oralCare';
import type { RootStackParamList, TabParamList } from '../../types/navigation';

type OralCareCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface OralCareCardProps {
  navigation: OralCareCardNavigation;
  selectedDate: string;
}

/** The selected day's brushing against the goal, with the streak. */
const OralCareCard: React.FC<OralCareCardProps> = ({
  navigation,
  selectedDate,
}) => {
  const { t } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const { data: day } = useOralCareDay(selectedDate);
  if (!day) return null;

  const target = day.settings.daily_target;
  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('OralCare', { date: selectedDate })}
      accessibilityRole="button"
      accessibilityLabel={t('oralCare.card.a11y', {
        defaultValue: 'Oral care, brushed {{brushed}} of {{target}}',
        brushed: day.brushing_count,
        target,
      })}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-md font-bold text-text-secondary">
          {t('oralCare.title', { defaultValue: 'Oral care' })}
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() =>
              navigation.navigate('OralCareLog', { date: selectedDate })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('oralCare.actions.log', {
              defaultValue: 'Log',
            })}
          >
            <Icon name="add" size={18} color={accentPrimary} />
          </Pressable>
          <Icon name="chevron-forward" size={14} color={accentPrimary} />
        </View>
      </View>
      <View className="flex-row items-end justify-between">
        <View className="flex-row gap-1.5">
          {Array.from({ length: Math.max(target, day.brushing_count) }).map(
            (_, i) => (
              <View
                key={i}
                className={`h-3 w-7 rounded-full ${
                  i < day.brushing_count ? 'bg-sky-500' : 'bg-border-subtle'
                }`}
              />
            )
          )}
        </View>
        <Text className="text-sm text-text-secondary">
          {formatOralCareClock(day.brushing_seconds)}
        </Text>
      </View>
      <Text className="text-xs text-text-muted mt-2">
        {t('oralCare.stats.streak', {
          defaultValue: 'Streak: {{count}} days',
          count: day.streak,
        })}
      </Text>
    </Pressable>
  );
};

export default OralCareCard;
