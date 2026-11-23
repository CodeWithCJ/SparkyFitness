import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import type {
  LoadBySport,
  LoadSportGroup,
  TrainingCalendarResponse,
} from '@workspace/shared';
import StatusView from '../StatusView';
import Icon from '../Icon';
import { formatLocalizedNumber } from '../../localization';
import { useTrainingCalendarColors } from '../../hooks/useTrainingCalendarColors';
import {
  SPORT_LOAD_WEEKS,
  currentSplits,
  sportShares,
} from '../../utils/trainingCalendar';
import { sportLoadLabel } from '../../utils/trainingCalendarLabels';

interface SportLoadCardProps {
  data: TrainingCalendarResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onOpenCalendar: () => void;
}

const BAR_HEIGHT = 56;

/** One stacked bar and a legend row per sport. */
const SplitBlock: React.FC<{
  title: string;
  bySport: LoadBySport | undefined;
}> = ({ title, bySport }) => {
  const { t } = useTranslation();
  const colors = useTrainingCalendarColors();
  const shares = sportShares(bySport);
  const total = shares.reduce((sum, s) => sum + s.load, 0);
  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-text-primary text-sm font-semibold">{title}</Text>
        <Text className="text-text-secondary text-sm">
          {formatLocalizedNumber(total)}
        </Text>
      </View>
      {shares.length === 0 ? (
        <Text className="text-text-muted text-xs">
          {t('trainingCalendar.load.noneYet', {
            defaultValue: 'No workouts logged yet.',
          })}
        </Text>
      ) : (
        <>
          <View className="flex-row h-2 rounded-full overflow-hidden mb-2">
            {shares.map((s) => (
              <View
                key={s.sport}
                style={{
                  flex: s.share,
                  backgroundColor: colors.sport[s.sport],
                }}
              />
            ))}
          </View>
          {shares.map((s) => (
            <View key={s.sport} className="flex-row items-center mb-0.5">
              <View
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: colors.sport[s.sport] }}
              />
              <Text className="text-text-secondary text-xs flex-1">
                {sportLoadLabel(t, s.sport)}
              </Text>
              <Text className="text-text-secondary text-xs">
                {formatLocalizedNumber(s.load)} ·{' '}
                {formatLocalizedNumber(s.share, {
                  style: 'percent',
                  maximumFractionDigits: 0,
                })}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
};

/**
 * Training load split by sport: the split of this week and this month, and the
 * last eight weeks stacked by sport, over today's fitness, fatigue and form.
 * Load is the same estimate as the training load card (minutes weighted by
 * average heart rate; a workout without one counts at the moderate weight).
 */
const SportLoadCard: React.FC<SportLoadCardProps> = ({
  data,
  isLoading,
  isError,
  onOpenCalendar,
}) => {
  const { t } = useTranslation();
  const colors = useTrainingCalendarColors();

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('trainingCalendar.load.loadFailed', {
            defaultValue: 'Could not load your load by sport.',
          })}
        </Text>
      ) : null;
    }
    const weeks = data.sportLoad.weeks.slice(-SPORT_LOAD_WEEKS);
    const peak = Math.max(
      1,
      ...weeks.map((w) =>
        Object.values(w.bySport).reduce((sum, v) => sum + v, 0)
      )
    );
    const { week, month } = currentSplits(data, data.today);
    const point = data.fitnessFatigue.today;
    const sports = Object.keys(colors.sport) as LoadSportGroup[];
    return (
      <>
        <SplitBlock
          title={t('trainingCalendar.load.thisWeek', {
            defaultValue: 'This week',
          })}
          bySport={week}
        />
        <SplitBlock
          title={t('trainingCalendar.load.thisMonth', {
            defaultValue: 'This month',
          })}
          bySport={month}
        />
        <Text className="text-text-primary text-sm font-semibold mb-1">
          {t('trainingCalendar.load.weekly', {
            defaultValue: 'Weekly load',
          })}
        </Text>
        <View
          className="flex-row items-end"
          style={{ height: BAR_HEIGHT, gap: 4 }}
        >
          {weeks.map((w) => (
            <View
              key={w.start}
              testID="sport-load-bar"
              className="flex-1 justify-end"
              style={{ height: BAR_HEIGHT }}
            >
              {sports.map((sport) => {
                const value = w.bySport[sport] ?? 0;
                return value > 0 ? (
                  <View
                    key={sport}
                    style={{
                      height: Math.max(1, (value / peak) * BAR_HEIGHT),
                      backgroundColor: colors.sport[sport],
                    }}
                  />
                ) : null;
              })}
            </View>
          ))}
        </View>
        {point ? (
          <View className="flex-row justify-between mt-3">
            {(
              [
                ['fitness', point.fitness],
                ['fatigue', point.fatigue],
                ['form', point.form],
              ] as const
            ).map(([key, value]) => (
              <View key={key} className="items-center flex-1">
                <Text className="text-text-primary text-lg font-bold">
                  {formatLocalizedNumber(Math.round(value))}
                </Text>
                <Text className="text-text-muted text-xs">
                  {key === 'fitness'
                    ? t('exerciseStatistics.fitness.fitness', {
                        defaultValue: 'Fitness',
                      })
                    : key === 'fatigue'
                      ? t('exerciseStatistics.fitness.fatigue', {
                          defaultValue: 'Fatigue',
                        })
                      : t('exerciseStatistics.fitness.formLabel', {
                          defaultValue: 'Form',
                        })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text className="text-text-muted text-xs mt-3">
          {t('trainingCalendar.load.method', {
            defaultValue:
              'Load is minutes weighted by your average heart rate (1 to 5, from how close it was to your maximum). A workout with no heart rate counts at a moderate weight of 2, so a strength session with no watch still counts by its time. Effort ratings are not used.',
          })}
        </Text>
        <Pressable
          className="flex-row items-center justify-between mt-3"
          onPress={onOpenCalendar}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          <Text className="text-accent-primary text-sm font-semibold">
            {t('trainingCalendar.load.openCalendar', {
              defaultValue: 'Open training calendar',
            })}
          </Text>
          <Icon name="chevron-forward" size={18} color={colors.mutedIcon} />
        </Pressable>
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('trainingCalendar.load.title', { defaultValue: 'Load by Sport' })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('trainingCalendar.load.subtitle', {
          defaultValue:
            'Where your training load comes from: running, cycling, walking, strength and other.',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default SportLoadCard;
