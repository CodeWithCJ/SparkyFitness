import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { REPORT_KEYS, type ReportKey } from '../constants/reports';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveKeyOrder } from '../utils/reorderUtils';
import { useScreenHeader } from '../hooks/useScreenHeader';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import Icon, { type IconName } from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';

type ReportsScreenProps = RootStackScreenProps<'Reports'>;

type ReportLink = {
  key: ReportKey;
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
};

const ReportsScreen: React.FC<ReportsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();

  const header = useScreenHeader({
    title: t('reports.title', { defaultValue: 'Reports' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'slider.horizontal.3',
      ionicon: 'options-outline',
      accessibilityLabel: t('reports.customize', {
        defaultValue: 'Customize reports',
      }),
      onPress: () => navigation.navigate('ReportsSettings'),
    },
  });

  const reportOrder = useAppPreferencesStore((s) => s.reportOrder);
  const hiddenReports = useAppPreferencesStore((s) => s.hiddenReports);

  const links: ReportLink[] = [
    {
      key: 'nutrition',
      icon: 'food',
      title: t('reports.nutrition', { defaultValue: 'Nutrition' }),
      subtitle: t('reports.nutritionSubtitle', {
        defaultValue: 'Calories, macros and daily averages',
      }),
      onPress: () => navigation.navigate('NutritionReport'),
    },
    {
      key: 'hydration',
      icon: 'water',
      title: t('reports.hydration', { defaultValue: 'Hydration' }),
      subtitle: t('reports.hydrationSubtitle', {
        defaultValue: 'Daily water, goal streaks and best days',
      }),
      onPress: () => navigation.navigate('HydrationReport'),
    },
    {
      key: 'substances',
      icon: 'chart-bar',
      title: t('reports.substances', { defaultValue: 'Caffeine and alcohol' }),
      subtitle: t('reports.substancesSubtitle', {
        defaultValue: 'Daily caffeine, alcohol totals and week by week',
      }),
      onPress: () => navigation.navigate('SubstancesReport'),
    },
    {
      key: 'sleep',
      icon: 'sleep-bedtime',
      title: t('reports.sleepAnalytics', { defaultValue: 'Sleep analytics' }),
      subtitle: t('reports.sleepAnalyticsSubtitle', {
        defaultValue: 'Stages, HRV, SpO2, respiration, stress and body battery',
      }),
      onPress: () => navigation.navigate('SleepAnalytics'),
    },
    {
      key: 'measurements',
      icon: 'measurements',
      title: t('reports.measurements', { defaultValue: 'Measurements' }),
      subtitle: t('reports.measurementsSubtitle', {
        defaultValue: 'Weight, body composition, tape measurements and steps',
      }),
      onPress: () => navigation.navigate('MeasurementsReport'),
    },
    {
      key: 'mood',
      icon: 'heart-rate',
      title: t('reports.mood', { defaultValue: 'Mood' }),
      subtitle: t('reports.moodSubtitle', {
        defaultValue: 'Mood history and most logged moods',
      }),
      onPress: () => navigation.navigate('MoodReport'),
    },
    {
      key: 'exercise',
      icon: 'workout-settings',
      title: t('reports.exercise', { defaultValue: 'Exercise' }),
      subtitle: t('reports.exerciseSubtitle', {
        defaultValue: 'Sets per muscle, body heat map and cardio sessions',
      }),
      onPress: () => navigation.navigate('ExerciseStatistics'),
    },
  ];

  const visibleLinks = resolveKeyOrder(reportOrder, REPORT_KEYS)
    .filter((key) => !hiddenReports.includes(key))
    .map((key) => links.find((link) => link.key === key))
    .filter((link): link is ReportLink => link !== undefined);

  return (
    <ReportScreenLayout header={header}>
      <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
        {visibleLinks.map((link, index) => (
          <Pressable
            key={link.key}
            testID={`reports-link-${link.key}`}
            className={`px-4 py-4 flex-row items-center ${
              index > 0 ? 'border-t border-border-subtle' : ''
            }`}
            onPress={link.onPress}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <View className="mr-3">
              <Icon name={link.icon} size={22} color="#999" />
            </View>
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold text-text-primary">
                {link.title}
              </Text>
              <Text className="text-sm text-text-secondary mt-0.5">
                {link.subtitle}
              </Text>
            </View>
            <Icon name="chevron-forward" size={20} color="#999" />
          </Pressable>
        ))}
      </View>
    </ReportScreenLayout>
  );
};

export default ReportsScreen;
