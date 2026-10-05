import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import type { TrainingConsistency } from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber, useAppLocale } from '../../localization';
import {
  getCalendarMonthNames,
  getCalendarWeekdayShortNames,
} from '../../utils/calendarLocalization';
import { localizeExerciseTaxonomyValue } from '../../localization/exerciseTaxonomy';
import {
  WEEKDAY_LABEL_ROWS,
  monthColumnLabels,
  muscleWeekRows,
  trainingCalendarWeeks,
  weekdayRowLabels,
} from '../../utils/trainingConsistency';

interface TrainingConsistencyCardProps {
  data: TrainingConsistency | undefined;
  isLoading: boolean;
  isError: boolean;
}

const WEEKDAY_LABEL_WIDTH = 26;
const MONTH_LABEL_HEIGHT = 14;
// Space between squares. The grid, not the layout engine, owns every size: a
// square's side and its row pitch are both worked out from the width here, so
// the weekday labels (one pitch tall each) line up with their rows.
const CELL_GAP = 2;

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-1 items-center">
    <Text className="text-text-secondary text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-lg font-bold">{value}</Text>
  </View>
);

const TrainingConsistencyCard: React.FC<TrainingConsistencyCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();
  const appLocale = useAppLocale();
  const [gridWidth, setGridWidth] = useState(0);
  const firstDayOfWeek = data?.firstDayOfWeek ?? 1;
  const weekdayShort = useMemo(
    () =>
      weekdayRowLabels(firstDayOfWeek, getCalendarWeekdayShortNames(appLocale)),
    [appLocale, firstDayOfWeek]
  );
  const weekdayLong = useMemo(
    () =>
      weekdayRowLabels(
        firstDayOfWeek,
        getCalendarWeekdayShortNames(appLocale, 'long')
      ),
    [appLocale, firstDayOfWeek]
  );
  const monthLabels = useMemo(
    () =>
      data
        ? monthColumnLabels(
            data.weeks.map((week) => week.weekStart),
            getCalendarMonthNames(appLocale, 'short')
          )
        : [],
    [appLocale, data]
  );
  const calendar = useMemo(
    () => (data ? trainingCalendarWeeks(data) : []),
    [data]
  );
  const pitch = gridWidth / Math.max(calendar.length, 1);
  const cellSize = Math.max(0, pitch - CELL_GAP);
  const rows = useMemo(
    () => (data ? muscleWeekRows(data.muscleSets) : []),
    [data]
  );

  const weeksLabel = (count: number) =>
    t('exerciseStatistics.consistency.weeks', {
      count,
      formattedCount: formatLocalizedNumber(count),
      defaultValue: '{{formattedCount}} weeks',
      defaultValue_one: '{{formattedCount}} week',
      defaultValue_other: '{{formattedCount}} weeks',
    });

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.consistency.loadFailed', {
            defaultValue: 'Could not load your training consistency.',
          })}
        </Text>
      ) : null;
    }
    const lastWeek = data.weeks[data.weeks.length - 1];
    return (
      <>
        <View className="flex-row mb-4">
          <Stat
            label={t('exerciseStatistics.consistency.streak', {
              defaultValue: 'Week streak',
            })}
            value={weeksLabel(data.weeklyStreak.current)}
          />
          <Stat
            label={t('exerciseStatistics.consistency.longest', {
              defaultValue: 'Longest',
            })}
            value={weeksLabel(data.weeklyStreak.longest)}
          />
          <Stat
            label={t('exerciseStatistics.consistency.thisWeek', {
              defaultValue: 'This week',
            })}
            value={t('exerciseStatistics.consistency.days', {
              count: lastWeek?.workoutDays ?? 0,
              formattedCount: formatLocalizedNumber(lastWeek?.workoutDays ?? 0),
              defaultValue: '{{formattedCount}} days',
              defaultValue_one: '{{formattedCount}} day',
              defaultValue_other: '{{formattedCount}} days',
            })}
          />
        </View>

        <View className="flex-row">
          <View style={{ width: WEEKDAY_LABEL_WIDTH }}>
            <View style={{ height: MONTH_LABEL_HEIGHT }} />
            {weekdayShort.map((name, row) => (
              <View
                key={row}
                className="justify-center"
                style={{ height: pitch }}
              >
                {WEEKDAY_LABEL_ROWS.includes(row) ? (
                  <Text
                    className="text-text-muted"
                    style={{ fontSize: 9 }}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
          <View
            className="flex-1"
            onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}
            accessible
            accessibilityLabel={t(
              'exerciseStatistics.consistency.calendarA11y',
              {
                count: data.trainingDays.length,
                weeks: data.weeks.length,
                defaultValue:
                  'Training calendar: {{count}} workout days in the last {{weeks}} weeks',
                defaultValue_one:
                  'Training calendar: {{count}} workout day in the last {{weeks}} weeks',
                defaultValue_other:
                  'Training calendar: {{count}} workout days in the last {{weeks}} weeks',
              }
            )}
          >
            <View className="flex-row" style={{ height: MONTH_LABEL_HEIGHT }}>
              {calendar.map((week, index) => (
                <View key={week.weekStart} style={{ width: pitch }}>
                  {monthLabels[index] ? (
                    <Text
                      className="text-text-muted"
                      style={{ fontSize: 9, width: 40 }}
                      numberOfLines={1}
                    >
                      {monthLabels[index]}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <View className="flex-row">
              {calendar.map((week) => (
                <View key={week.weekStart} style={{ width: pitch }}>
                  {week.cells.map((cell) => (
                    <View
                      key={cell.day}
                      testID={`consistency-${cell.state}`}
                      className={`rounded-sm ${
                        cell.state === 'trained'
                          ? 'bg-exercise'
                          : cell.state === 'rest'
                            ? 'bg-progress-track'
                            : 'bg-transparent'
                      }`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        marginBottom: CELL_GAP,
                      }}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>

        <View
          className="flex-row items-center mt-2"
          testID="consistency-legend"
        >
          <View className="w-2.5 h-2.5 rounded-sm bg-exercise mr-1" />
          <Text className="text-text-secondary text-xs mr-3">
            {t('exerciseStatistics.consistency.legendTrained', {
              defaultValue: 'Workout day',
            })}
          </Text>
          <View className="w-2.5 h-2.5 rounded-sm bg-progress-track mr-1" />
          <Text className="text-text-secondary text-xs">
            {t('exerciseStatistics.consistency.legendRest', {
              defaultValue: 'No workout',
            })}
          </Text>
        </View>
        <Text className="text-text-muted text-xs mt-1">
          {t('exerciseStatistics.consistency.legendHelp', {
            defaultValue: 'Each square is a day and each column is a week.',
          })}
        </Text>

        <Text className="text-text-primary text-sm font-bold mt-4 mb-1">
          {t('exerciseStatistics.consistency.setsTitle', {
            defaultValue: 'Sets per muscle',
          })}
        </Text>
        {rows.length === 0 ? (
          <Text className="text-text-muted text-xs">
            {t('exerciseStatistics.consistency.noSets', {
              defaultValue: 'No sets logged this week or last.',
            })}
          </Text>
        ) : (
          <>
            <View className="flex-row justify-end pb-1">
              <Text className="text-xs text-text-muted w-20 text-right">
                {t('exerciseStatistics.consistency.thisWeek', {
                  defaultValue: 'This week',
                })}
              </Text>
              <Text className="text-xs text-text-muted w-20 text-right">
                {t('exerciseStatistics.consistency.lastWeek', {
                  defaultValue: 'Last week',
                })}
              </Text>
            </View>
            {rows.map((row, index) => (
              <View
                key={row.muscle}
                className={`flex-row items-center py-2 ${
                  index === rows.length - 1
                    ? ''
                    : 'border-b border-border-subtle'
                }`}
              >
                <Text className="flex-1 text-text-primary text-sm">
                  {localizeExerciseTaxonomyValue(t, 'muscle', row.muscle)}
                </Text>
                <Text className="w-20 text-right text-text-primary text-sm font-semibold">
                  {formatLocalizedNumber(row.thisWeek)}
                </Text>
                <Text className="w-20 text-right text-text-secondary text-sm">
                  {formatLocalizedNumber(row.lastWeek)}
                </Text>
              </View>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.consistency.title', {
          defaultValue: 'Training Consistency',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.consistency.subtitle', {
          count: data?.weeks.length ?? 0,
          formattedCount: formatLocalizedNumber(data?.weeks.length ?? 0),
          first: weekdayLong[0] ?? '',
          last: weekdayLong[6] ?? '',
          defaultValue: 'Last {{formattedCount}} weeks, {{first}} to {{last}}',
          defaultValue_one:
            'Last {{formattedCount}} week, {{first}} to {{last}}',
          defaultValue_other:
            'Last {{formattedCount}} weeks, {{first}} to {{last}}',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default TrainingConsistencyCard;
