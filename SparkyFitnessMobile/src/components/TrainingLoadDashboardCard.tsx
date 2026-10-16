import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LoadStatus } from '@workspace/shared';

import Icon from './Icon';
import { formatLocalizedNumber } from '../localization';
import { useTrainingLoad } from '../hooks/useTrainingLoad';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type TrainingLoadDashboardCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface TrainingLoadDashboardCardProps {
  navigation: TrainingLoadDashboardCardNavigation;
}

const BAR_AREA_HEIGHT = 32;

const STATUS_COLOR: Record<LoadStatus, string> = {
  noData: 'text-text-secondary',
  learning: 'text-text-secondary',
  low: 'text-text-secondary',
  steady: 'text-text-success',
  high: 'text-text-warning',
  spike: 'text-text-danger-subtle',
};

/**
 * The Dashboard's short take on training load: this week against the usual,
 * a one-line verdict and the four weekly bars. A tap opens Exercise
 * Statistics, where the full card and its explanation live. Nothing shows
 * until a workout has been logged, so a new account is not given an empty card.
 */
const TrainingLoadDashboardCard: React.FC<TrainingLoadDashboardCardProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const visible = useAppPreferencesStore((s) => s.trainingLoadCardVisible);
  const { load, isError } = useTrainingLoad(visible);

  // A failed first request leaves no data, and the card would simply vanish.
  // An empty response stays hidden, a failure says so.
  if (!load && isError) {
    return (
      <View
        testID="training-load-dashboard-card-error"
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      >
        <Text className="font-bold text-text-secondary">
          {t('trainingLoadCard.title', { defaultValue: 'Training Load' })}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {t('trainingLoadCard.loadFailed', {
            defaultValue: 'Could not load your training load.',
          })}
        </Text>
      </View>
    );
  }
  if (!load || load.status === 'noData') return null;

  const verdict = (() => {
    switch (load.status) {
      case 'learning':
        return t('trainingLoadCard.learning', {
          defaultValue: 'Still learning your normal',
        });
      case 'low':
        return t('trainingLoadCard.low', {
          defaultValue: 'Lighter than usual',
        });
      case 'steady':
        return t('trainingLoadCard.steady', {
          defaultValue: 'In line with your usual',
        });
      case 'high':
        return t('trainingLoadCard.high', {
          defaultValue: 'Higher than usual: keep the next few easy',
        });
      default:
        return t('trainingLoadCard.spike', {
          defaultValue: 'A big jump: ease off',
        });
    }
  })();
  const peak = Math.max(1, ...load.weeks.map((week) => week.load));

  return (
    <TouchableOpacity
      testID="training-load-dashboard-card"
      onPress={() => navigation.navigate('ExerciseStatistics')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('trainingLoadCard.openA11y', {
        defaultValue: 'Open training load',
      })}
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-bold text-text-secondary">
          {t('trainingLoadCard.title', { defaultValue: 'Training Load' })}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-accent-primary font-medium">
            {t('trainingLoadCard.details', { defaultValue: 'Details' })}
          </Text>
          <Icon
            name="chevron-forward"
            size={14}
            color={accentPrimary}
            style={{ marginLeft: 2 }}
          />
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-4">
          <View className="flex-row items-end">
            <Text className="text-text-primary text-2xl font-bold">
              {formatLocalizedNumber(load.acute)}
            </Text>
            <Text className="text-text-secondary text-sm ml-1 mb-0.5">
              {t('trainingLoadCard.usual', {
                average: formatLocalizedNumber(load.chronic),
                defaultValue: 'this week · usual {{average}}',
              })}
            </Text>
          </View>
          <Text className={`text-sm mt-1 ${STATUS_COLOR[load.status]}`}>
            {verdict}
          </Text>
          {load.recovery === 'takeRest' ? (
            <Text className="text-text-primary text-sm font-semibold mt-1">
              {t('trainingLoadCard.takeRest', {
                defaultValue: 'Take a rest day or an easy session.',
              })}
            </Text>
          ) : load.recovery === 'ready' ? (
            <Text className="text-text-primary text-sm font-semibold mt-1">
              {t('trainingLoadCard.ready', {
                defaultValue: 'You are rested and ready.',
              })}
            </Text>
          ) : null}
          <Text className="text-text-muted text-xs mt-2">
            {t('trainingLoadCard.explain', {
              defaultValue:
                'Adds up how long and how hard your workouts were. Usual is your 4-week average. Bars show the last 4 weeks; green is this week.',
            })}
          </Text>
        </View>
        <View
          className="flex-row items-end"
          style={{ height: BAR_AREA_HEIGHT, width: 72, gap: 4 }}
        >
          {load.weeks.map((week, index) => (
            <View
              key={week.start}
              testID="training-load-dashboard-bar"
              className={`flex-1 rounded-t-sm ${
                index === load.weeks.length - 1
                  ? 'bg-exercise'
                  : 'bg-progress-track'
              }`}
              style={{
                height: Math.max(
                  3,
                  Math.round((week.load / peak) * BAR_AREA_HEIGHT)
                ),
              }}
            />
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default TrainingLoadDashboardCard;
