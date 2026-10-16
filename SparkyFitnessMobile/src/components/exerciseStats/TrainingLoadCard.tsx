import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { LoadStatus, TrainingLoad } from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber } from '../../localization';

interface TrainingLoadCardProps {
  data: TrainingLoad | undefined;
  isLoading: boolean;
  isError: boolean;
}

const BAR_AREA_HEIGHT = 64;

const STATUS_COLOR: Record<LoadStatus, string> = {
  noData: 'text-text-secondary',
  learning: 'text-text-secondary',
  low: 'text-text-secondary',
  steady: 'text-text-success',
  high: 'text-text-warning',
  spike: 'text-text-danger-subtle',
};

/**
 * This week's workout load against the last four weeks, with a plain-language
 * verdict and a nudge to rest after a hard stretch. The score is minutes
 * weighted by heart-rate intensity, so it is a guide, not a measurement.
 */
const TrainingLoadCard: React.FC<TrainingLoadCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();

  const statusText = (status: LoadStatus): string => {
    switch (status) {
      case 'learning':
        return t('exerciseStatistics.load.status.learning', {
          defaultValue:
            'Still learning your normal. Keep logging and this will start to compare your weeks.',
        });
      case 'low':
        return t('exerciseStatistics.load.status.low', {
          defaultValue:
            'Lighter than your usual. A good time to add a little, or enjoy the rest.',
        });
      case 'steady':
        return t('exerciseStatistics.load.status.steady', {
          defaultValue: 'In line with your usual training. A steady build.',
        });
      case 'high':
        return t('exerciseStatistics.load.status.high', {
          defaultValue:
            'Higher than your usual. Fine for a week, but keep the next few easy.',
        });
      case 'spike':
        return t('exerciseStatistics.load.status.spike', {
          defaultValue:
            'A big jump from your usual. Ramping up this fast raises the risk of injury, so ease off.',
        });
      default:
        return t('exerciseStatistics.load.status.noData', {
          defaultValue: 'No workouts logged in the last four weeks.',
        });
    }
  };

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.load.loadFailed', {
            defaultValue: 'Could not load your training load.',
          })}
        </Text>
      ) : null;
    }
    const peak = Math.max(1, ...data.weeks.map((week) => week.load));
    return (
      <>
        <View className="flex-row items-end mb-1">
          <Text className="text-text-primary text-3xl font-bold">
            {formatLocalizedNumber(data.acute)}
          </Text>
          <Text className="text-text-secondary text-sm ml-1 mb-1">
            {t('exerciseStatistics.load.thisWeek', {
              average: formatLocalizedNumber(data.chronic),
              defaultValue: 'this week · usual {{average}}',
            })}
          </Text>
        </View>
        <Text className={`text-sm mb-3 ${STATUS_COLOR[data.status]}`}>
          {statusText(data.status)}
        </Text>
        <View
          className="flex-row items-end"
          style={{ height: BAR_AREA_HEIGHT, gap: 8 }}
        >
          {data.weeks.map((week, index) => {
            const current = index === data.weeks.length - 1;
            return (
              <View
                key={week.start}
                testID="training-load-bar"
                className={`flex-1 rounded-t-md ${
                  current ? 'bg-exercise' : 'bg-progress-track'
                }`}
                style={{
                  height: Math.max(
                    4,
                    Math.round((week.load / peak) * BAR_AREA_HEIGHT)
                  ),
                }}
                accessibilityLabel={t('exerciseStatistics.load.weekA11y', {
                  load: formatLocalizedNumber(week.load),
                  defaultValue: 'Week load {{load}}',
                })}
              />
            );
          })}
        </View>
        <View className="flex-row justify-between mt-1">
          <Text className="text-text-muted text-xs">
            {t('exerciseStatistics.load.fourWeeksAgo', {
              defaultValue: '4 weeks ago',
            })}
          </Text>
          <Text className="text-text-muted text-xs">
            {t('exerciseStatistics.load.last7', {
              defaultValue: 'Last 7 days',
            })}
          </Text>
        </View>
        {data.recovery === 'takeRest' ? (
          <Text className="text-text-primary text-sm font-semibold mt-3">
            {t('exerciseStatistics.load.takeRest', {
              defaultValue:
                'Take a rest day or an easy session before your next hard one.',
            })}
          </Text>
        ) : data.recovery === 'ready' ? (
          <Text className="text-text-primary text-sm font-semibold mt-3">
            {t('exerciseStatistics.load.ready', {
              defaultValue: 'You are rested and ready for a good session.',
            })}
          </Text>
        ) : null}
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.load.title', { defaultValue: 'Training Load' })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.load.subtitle', {
          defaultValue:
            'Workout minutes weighted by heart rate, this week against the last four.',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default TrainingLoadCard;
