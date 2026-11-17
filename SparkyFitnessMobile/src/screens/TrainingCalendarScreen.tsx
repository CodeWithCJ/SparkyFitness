import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CalendarWeekTotals,
  CompletedItem,
  PlannedItem,
} from '@workspace/shared';
import { LOAD_SPORT_GROUPS, addDays, weekStartOf } from '@workspace/shared';
import DayMarks from '../components/trainingCalendar/DayMarks';
import WeekProgressBar from '../components/trainingCalendar/WeekProgressBar';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useTrainingCalendar } from '../hooks/useTrainingCalendar';
import { useTrainingCalendarColors } from '../hooks/useTrainingCalendarColors';
import { formatLocalizedNumber, useAppLocale } from '../localization';
import { getCalendarWeekdayShortNames } from '../utils/calendarLocalization';
import { distanceFromKm } from '../utils/unitConversions';
import { formatDate, formatShortDate, getTodayDate } from '../utils/dateUtils';
import {
  REST_DAY_AHEAD_DAYS,
  SPORT_ICONS,
  dayMarks,
  itemsByDay,
  monthRange,
  orderWeeks,
  weekDays,
  weekSummary,
  type DayItems,
} from '../utils/trainingCalendar';
import {
  markA11yLabel,
  plannedItemLabel,
  plannedStatusLabel,
  sportLoadLabel,
} from '../utils/trainingCalendarLabels';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'TrainingCalendar'>;
type ViewMode = 'month' | 'week';

const EMPTY_DAY: DayItems = { planned: [], completed: [] };
const SPORTS = LOAD_SPORT_GROUPS;
/** Width of the week total at the end of each row of the grid. */
const WEEK_TOTAL_WIDTH = 44;

/**
 * A month and week calendar of what was planned (the run program and the
 * scheduled workout plans) against what was done (the diary's workouts), with
 * a status on every planned item, weekly totals and a day's detail.
 */
const TrainingCalendarScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const appLocale = useAppLocale();
  const { preferences } = usePreferences();
  const firstDayOfWeek =
    typeof preferences?.first_day_of_week === 'number' &&
    preferences.first_day_of_week >= 0 &&
    preferences.first_day_of_week <= 6
      ? preferences.first_day_of_week
      : 0;
  const colors = useTrainingCalendarColors();
  // The device's day until the server has said what day it is for the person;
  // everything that depends on today (the ring, the "Today" label, week tags,
  // the opening selection) follows the person's own day once it is known.
  const deviceToday = getTodayDate();
  const [serverToday, setServerToday] = useState<string | null>(null);
  const today = serverToday ?? deviceToday;
  const [mode, setMode] = useState<ViewMode>('month');
  // What the person picked; until they pick, the view sits on today.
  const [anchorPick, setAnchorPick] = useState<string | null>(null);
  const [selectedPick, setSelectedPick] = useState<string | null>(null);
  const anchor = anchorPick ?? today;
  const selected = selectedPick ?? today;
  const [showEarlier, setShowEarlier] = useState(false);
  const [loadHelpOpen, setLoadHelpOpen] = useState(false);

  const month = anchor.slice(0, 7);
  const range = monthRange(month, firstDayOfWeek);
  const { data, isLoading, isError, refetch } = useTrainingCalendar(
    range.start,
    range.end
  );
  if (data?.today && data.today !== serverToday) setServerToday(data.today);
  const header = useScreenHeader({
    title: t('screens.trainingCalendar', { defaultValue: 'Training calendar' }),
    left: { kind: 'back' },
  });

  const days = useMemo(() => itemsByDay(data), [data]);
  const weekdayNames = useMemo(() => {
    const names = getCalendarWeekdayShortNames(appLocale);
    return Array.from(
      { length: 7 },
      (_, i) => names[(firstDayOfWeek + i) % 7]!
    );
  }, [appLocale, firstDayOfWeek]);

  const select = (day: string) => setSelectedPick(day);

  // Switching views keeps the selected day: the grid, the detail and the totals
  // all open on the week or month that holds it.
  const changeMode = (next: ViewMode) => {
    setMode(next);
    setAnchorPick(selected);
    setShowEarlier(false);
  };

  const move = (direction: -1 | 1) => {
    const next =
      mode === 'week'
        ? addDays(anchor, 7 * direction)
        : addDays(`${month}-01`, direction === 1 ? 32 : -1).slice(0, 7) + '-01';
    setAnchorPick(next);
    setSelectedPick(next);
    setShowEarlier(false);
  };

  const title =
    mode === 'month'
      ? new Intl.DateTimeFormat(appLocale, {
          month: 'long',
          year: 'numeric',
        }).format(
          new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1)
        )
      : t('trainingCalendar.weekOf', {
          date: formatShortDate(weekStartOf(anchor, firstDayOfWeek), appLocale),
          defaultValue: 'Week of {{date}}',
        });

  const minutes = (value: number) =>
    t('trainingCalendar.minutesShort', {
      value: formatLocalizedNumber(Math.round(value)),
      defaultValue: '{{value}} min',
    });

  const distanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';
  const distance = (km: number) => {
    const value = formatLocalizedNumber(distanceFromKm(km, distanceUnit), {
      maximumFractionDigits: 1,
    });
    return distanceUnit === 'miles'
      ? t('trainingCalendar.distanceMiles', {
          value,
          defaultValue: '{{value}} mi',
        })
      : t('trainingCalendar.distanceKm', {
          value,
          defaultValue: '{{value}} km',
        });
  };

  const weekStart = weekStartOf(selected, firstDayOfWeek);
  const todayWeekStart = weekStartOf(today, firstDayOfWeek);
  const selectedWeek = data?.weeks.find((w) => w.start === weekStart);
  const detail = days.get(selected) ?? EMPTY_DAY;

  const dayA11yLabel = (day: string) => {
    const items = days.get(day) ?? EMPTY_DAY;
    const marks = dayMarks(items);
    const date =
      day === today
        ? t('date.today', { defaultValue: 'Today' })
        : formatDate(day, appLocale);
    if (marks.length === 0) {
      return t('trainingCalendar.dayA11yNone', {
        date,
        defaultValue: '{{date}}, nothing planned or logged',
      });
    }
    return t('trainingCalendar.dayA11y', {
      date,
      marks: marks.map((m) => markA11yLabel(t, m.sport, m.status)).join('; '),
      defaultValue: '{{date}}: {{marks}}',
    });
  };

  const renderDayCell = (day: string) => {
    const items = days.get(day) ?? EMPTY_DAY;
    const marks = dayMarks(items);
    const isToday = day === today;
    const inMonth = mode === 'week' || day.slice(0, 7) === month;
    return (
      <Pressable
        key={day}
        testID={`calendar-day-${day}`}
        accessibilityRole="button"
        accessibilityLabel={dayA11yLabel(day)}
        accessibilityState={{ selected: day === selected }}
        onPress={() => select(day)}
        className={`flex-1 items-center py-1.5 rounded-lg ${
          day === selected ? 'bg-accent-primary/20' : ''
        }`}
        style={{ minHeight: 52 }}
      >
        <View
          testID={isToday ? 'calendar-today-ring' : undefined}
          className={`items-center justify-center rounded-full ${
            isToday ? 'border-2 border-accent-primary' : ''
          }`}
          style={{ width: 26, height: 26 }}
        >
          <Text
            className={`text-sm ${
              !inMonth
                ? 'text-text-muted'
                : marks.length > 0
                  ? 'text-text-primary font-semibold'
                  : 'text-text-secondary'
            }`}
          >
            {Number(day.slice(8))}
          </Text>
        </View>
        <DayMarks marks={marks} />
      </Pressable>
    );
  };

  const renderWeekTotal = (weekStartDay: string) => {
    const week = data?.weeks.find((w) => w.start === weekStartDay);
    const summary = weekSummary(week);
    const isCurrentWeek = weekStartDay === todayWeekStart;
    return (
      <Pressable
        key={`total-${weekStartDay}`}
        testID={`week-total-${weekStartDay}`}
        accessibilityRole="button"
        accessibilityLabel={
          summary
            ? summary.planned > 0
              ? t('trainingCalendar.weekTotalA11y', {
                  done: summary.done,
                  planned: summary.planned,
                  defaultValue: '{{done}} of {{planned}} planned sessions done',
                })
              : t('trainingCalendar.weekLoggedA11y', {
                  count: summary.done,
                  defaultValue: '{{count}} sessions logged',
                })
            : t('trainingCalendar.weekEmptyA11y', {
                defaultValue: 'No sessions this week',
              })
        }
        onPress={() => select(weekStartDay)}
        className="items-center justify-center"
        style={{ width: WEEK_TOTAL_WIDTH }}
      >
        {summary ? (
          <Text
            className={`text-xs font-semibold ${
              isCurrentWeek ? 'text-accent-primary' : 'text-text-secondary'
            }`}
          >
            {summary.planned > 0
              ? t('trainingCalendar.weekTotalShort', {
                  done: summary.done,
                  planned: summary.planned,
                  defaultValue: '{{done}}/{{planned}}',
                })
              : formatLocalizedNumber(summary.done)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // A run program workout opens its own screen (steps, the run it was done as,
  // repeat or skip); a workout plan item has no screen of its own.
  const renderPlanned = (item: PlannedItem) => {
    const programIndex =
      item.source === 'runProgram' && item.workoutNumber != null
        ? item.workoutNumber - 1
        : null;
    return (
      <Pressable
        key={item.id}
        testID={`planned-${item.id}`}
        disabled={programIndex === null}
        accessibilityRole={programIndex === null ? undefined : 'button'}
        onPress={() =>
          programIndex === null
            ? undefined
            : navigation.navigate('RunProgramWorkout', { index: programIndex })
        }
        className="flex-row items-center bg-raised rounded-lg px-3 py-2.5 mt-2"
      >
        <View
          className="w-1.5 self-stretch rounded-full mr-3"
          style={{ backgroundColor: colors.status[item.status] }}
        />
        <View className="flex-1">
          <Text className="text-text-primary text-base font-semibold">
            {plannedItemLabel(t, item)}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5">
            <Text style={{ color: colors.status[item.status] }}>
              {plannedStatusLabel(t, item.status)}
            </Text>
            {' · '}
            {sportLoadLabel(t, item.sport)}
            {item.plannedMinutes != null
              ? ` · ${
                  item.completedMinutes > 0
                    ? t('trainingCalendar.minutesOf', {
                        done: formatLocalizedNumber(item.completedMinutes),
                        planned: formatLocalizedNumber(
                          Math.round(item.plannedMinutes)
                        ),
                        defaultValue: '{{done}} of {{planned}} min',
                      })
                    : minutes(item.plannedMinutes)
                }`
              : ''}
          </Text>
        </View>
        {programIndex !== null ? (
          <View className="w-8 h-8 rounded-full border border-border-subtle items-center justify-center ml-2">
            <Icon name="chevron-forward" size={16} color={colors.extra} />
          </View>
        ) : null}
      </Pressable>
    );
  };

  // A completed row wears the colour of the planned item it counted for, or
  // the extra colour when nothing was planned: sport is in the text.
  const plannedStatus = new Map(detail.planned.map((p) => [p.id, p.status]));
  const renderCompleted = (item: CompletedItem) => (
    <View key={item.id} className="flex-row items-center py-2">
      <View
        className="w-2 h-8 rounded-full mr-3"
        style={{
          backgroundColor:
            item.plannedItemId !== null && plannedStatus.has(item.plannedItemId)
              ? colors.status[plannedStatus.get(item.plannedItemId)!]
              : colors.extra,
        }}
      />
      <View className="flex-1">
        <Text className="text-text-primary text-sm font-semibold">
          {item.name ?? sportLoadLabel(t, item.sport)}
        </Text>
        <Text className="text-text-secondary text-xs">
          {sportLoadLabel(t, item.sport)} · {minutes(item.minutes)}
          {item.distanceKm != null ? ` · ${distance(item.distanceKm)}` : ''}
          {' · '}
          {t('trainingCalendar.loadValue', {
            value: formatLocalizedNumber(item.load),
            defaultValue: 'load {{value}}',
          })}
          {item.loadBasis === 'estimated'
            ? ` ${t('trainingCalendar.estimated', { defaultValue: '(estimated, no heart rate)' })}`
            : ''}
        </Text>
      </View>
      {item.plannedItemId === null ? (
        <Text className="text-text-muted text-xs">
          {t('trainingCalendar.extra', { defaultValue: 'Extra' })}
        </Text>
      ) : null}
    </View>
  );

  // The week holding today is labelled and in the accent colour; weeks still
  // ahead are dimmed, since nothing in them can be done yet.
  const renderTotals = (week: CalendarWeekTotals, index: number) => {
    const isCurrent = week.start === todayWeekStart;
    const isAhead = week.start > todayWeekStart;
    const sessionsDone = week.doneSessions + week.partialSessions;
    const percent =
      week.plannedSessions > 0 && !isAhead
        ? Math.min(
            1,
            Math.floor((sessionsDone / week.plannedSessions) * 100) / 100
          )
        : null;
    const extraMinutes = Math.round(
      week.completedMinutes - week.matchedMinutes
    );
    return (
      <View
        key={week.start}
        testID={`week-row-${week.start}`}
        className={`py-3 ${index > 0 ? 'border-t border-border-subtle' : ''} ${
          week.start === weekStart
            ? 'border-l-2 border-accent-primary pl-2'
            : ''
        }`}
        style={isAhead ? { opacity: 0.6 } : undefined}
      >
        <View className="flex-row items-center justify-between mb-0.5">
          <Text
            className={`text-xs ${
              isCurrent
                ? 'text-accent-primary font-semibold'
                : 'text-text-secondary'
            }`}
          >
            {t('trainingCalendar.weekOf', {
              date: formatShortDate(week.start, appLocale),
              defaultValue: 'Week of {{date}}',
            })}
          </Text>
          {isCurrent || isAhead ? (
            <Text
              testID={`week-tag-${week.start}`}
              className="text-text-muted text-xs"
            >
              {isCurrent
                ? t('trainingCalendar.totals.thisWeek', {
                    defaultValue: 'This week',
                  })
                : t('trainingCalendar.totals.ahead', {
                    defaultValue: 'Upcoming',
                  })}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-baseline justify-between">
          <Text className="text-text-primary text-base font-semibold flex-1">
            {week.plannedSessions > 0
              ? t('trainingCalendar.totals.sessions', {
                  done: week.doneSessions + week.partialSessions,
                  planned: week.plannedSessions,
                  defaultValue: '{{done}} of {{planned}} planned sessions',
                })
              : t('trainingCalendar.totals.sessionsLogged', {
                  count: week.completedSessions,
                  defaultValue: '{{count}} sessions logged',
                })}
            {week.plannedSessions > 0 && week.extraSessions > 0 ? (
              <Text className="text-accent-primary text-sm font-normal">
                {` · ${t('trainingCalendar.totals.extra', {
                  count: week.extraSessions,
                  defaultValue: '{{count}} extra',
                })}`}
              </Text>
            ) : null}
          </Text>
          {percent !== null ? (
            <Text
              testID={`week-percent-${week.start}`}
              className="text-sm font-semibold ml-2"
              style={{ color: colors.status.done }}
            >
              {formatLocalizedNumber(percent, { style: 'percent' })}
            </Text>
          ) : null}
        </View>
        <WeekProgressBar week={week} />
        <View className="flex-row flex-wrap items-center">
          <Text className="text-text-secondary text-xs">
            {week.plannedMinutes > 0
              ? t('trainingCalendar.totals.minutes', {
                  done: formatLocalizedNumber(Math.round(week.matchedMinutes)),
                  planned: formatLocalizedNumber(
                    Math.round(week.plannedMinutes)
                  ),
                  defaultValue: 'Time {{done}} of {{planned}} min',
                })
              : t('trainingCalendar.totals.minutesDone', {
                  done: formatLocalizedNumber(
                    Math.round(week.completedMinutes)
                  ),
                  defaultValue: 'Time {{done}} min',
                })}
            {week.plannedMinutes > 0 && extraMinutes >= 1 ? (
              <Text className="text-accent-primary">
                {` ${t('trainingCalendar.totals.minutesExtra', {
                  extra: formatLocalizedNumber(extraMinutes),
                  defaultValue: '(+{{extra}} min extra)',
                })}`}
              </Text>
            ) : null}
            {' · '}
          </Text>
          <Pressable
            testID={`load-help-${week.start}`}
            accessibilityRole="button"
            accessibilityLabel={t('trainingCalendar.loadHelpA11y', {
              defaultValue: 'What is training load?',
            })}
            accessibilityState={{ expanded: loadHelpOpen }}
            onPress={() => setLoadHelpOpen((open) => !open)}
            hitSlop={8}
            className="flex-row items-center"
          >
            <Text className="text-text-secondary text-xs">
              {week.plannedLoad > 0
                ? t('trainingCalendar.totals.load', {
                    done: formatLocalizedNumber(Math.round(week.matchedLoad)),
                    planned: formatLocalizedNumber(
                      Math.round(week.plannedLoad)
                    ),
                    defaultValue: 'Training load {{done}} of {{planned}}',
                  }) +
                  (week.completedLoad - week.matchedLoad >= 1
                    ? ` ${t('trainingCalendar.totals.loadExtra', {
                        extra: formatLocalizedNumber(
                          Math.round(week.completedLoad - week.matchedLoad)
                        ),
                        defaultValue: '(+{{extra}} extra)',
                      })}`
                    : '')
                : t('trainingCalendar.totals.loadDone', {
                    done: formatLocalizedNumber(Math.round(week.completedLoad)),
                    defaultValue: 'Training load {{done}}',
                  })}
            </Text>
            <Icon
              name="info-circle"
              size={13}
              color={colors.mutedIcon}
              style={{ marginLeft: 3 }}
            />
          </Pressable>
          {week.completedDistanceKm > 0 ? (
            <Text className="text-text-secondary text-xs">
              {` · ${distance(week.completedDistanceKm)}`}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const body = () => {
    if (isLoading) return <StatusView loading />;
    if (!data) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('trainingCalendar.loadFailed', {
            defaultValue: 'Could not load your training calendar.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      );
    }
    const gridDays =
      mode === 'month' ? range.days : weekDays(anchor, firstDayOfWeek);
    const rows = Array.from({ length: gridDays.length / 7 }, (_, i) =>
      gridDays.slice(i * 7, i * 7 + 7)
    );
    const { visible, earlier } =
      mode === 'month'
        ? orderWeeks(
            data.weeks.filter(
              (w) => w.plannedSessions + w.completedSessions > 0
            ),
            today
          )
        : { visible: selectedWeek ? [selectedWeek] : [], earlier: [] };
    const totalsWeeks = showEarlier ? [...visible, ...earlier] : visible;
    const sportsOnGrid = new Set(
      gridDays.flatMap((day) =>
        dayMarks(days.get(day) ?? EMPTY_DAY).map((m) => m.sport)
      )
    );
    const visibleSports = SPORTS.filter((sport) => sportsOnGrid.has(sport));
    return (
      <>
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row mb-1">
            {weekdayNames.map((name, i) => (
              <Text
                key={i}
                className="flex-1 text-center text-text-muted text-xs"
              >
                {name}
              </Text>
            ))}
            <Text
              className="text-center text-text-muted text-xs font-semibold uppercase"
              style={{ width: WEEK_TOTAL_WIDTH }}
            >
              {t('trainingCalendar.weekTotalHeader', { defaultValue: 'Total' })}
            </Text>
          </View>
          {rows.map((row) => (
            <View key={row[0]} className="flex-row">
              {row.map((day) => renderDayCell(day))}
              {renderWeekTotal(row[0]!)}
            </View>
          ))}
          <View
            testID="calendar-legend"
            className="flex-row flex-wrap mt-2"
            style={{ gap: 10 }}
          >
            {(['done', 'partial', 'missed', 'upcoming'] as const).map(
              (status) => (
                <View key={status} className="flex-row items-center">
                  <View
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: colors.status[status] }}
                  />
                  <Text className="text-text-muted text-xs">
                    {plannedStatusLabel(t, status)}
                  </Text>
                </View>
              )
            )}
            <View className="flex-row items-center">
              <View
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: colors.extra, opacity: 0.5 }}
              />
              <Text className="text-text-muted text-xs">
                {t('trainingCalendar.extra', { defaultValue: 'Extra' })}
              </Text>
            </View>
          </View>
          {visibleSports.length > 0 ? (
            <View
              testID="calendar-sport-legend"
              className="flex-row flex-wrap mt-2"
              style={{ gap: 10 }}
            >
              {visibleSports.map((sport) => (
                <View key={sport} className="flex-row items-center">
                  <View className="mr-1">
                    <Icon
                      name={SPORT_ICONS[sport]}
                      size={13}
                      color={colors.mutedIcon}
                    />
                  </View>
                  <Text className="text-text-muted text-xs">
                    {sportLoadLabel(t, sport)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-text-primary text-lg font-bold flex-1">
              {selected === today
                ? t('date.today', { defaultValue: 'Today' })
                : formatDate(selected, appLocale)}
            </Text>
            {selected === today ? (
              <View className="bg-accent-primary/15 rounded-full px-2.5 py-1">
                <Text className="text-accent-primary text-xs font-bold uppercase">
                  {new Intl.DateTimeFormat(appLocale, {
                    weekday: 'long',
                  }).format(
                    new Date(
                      Number(today.slice(0, 4)),
                      Number(today.slice(5, 7)) - 1,
                      Number(today.slice(8))
                    )
                  )}
                </Text>
              </View>
            ) : null}
          </View>
          {detail.planned.length === 0 && detail.completed.length === 0 ? (
            <Text testID="empty-day" className="text-text-muted text-sm">
              {selected <= addDays(today, REST_DAY_AHEAD_DAYS)
                ? t('trainingCalendar.restDay', { defaultValue: 'Rest day' })
                : t('trainingCalendar.emptyDay', {
                    defaultValue: 'Nothing planned or logged this day.',
                  })}
            </Text>
          ) : (
            <>
              {detail.planned.length > 0 ? (
                <Text className="text-text-muted text-xs font-semibold uppercase mt-2">
                  {t('trainingCalendar.planned', { defaultValue: 'Planned' })}
                </Text>
              ) : null}
              {detail.planned.map(renderPlanned)}
              {detail.completed.length > 0 ? (
                <Text className="text-text-muted text-xs font-semibold uppercase mt-3">
                  {t('trainingCalendar.completed', {
                    defaultValue: 'Completed',
                  })}
                </Text>
              ) : null}
              {detail.completed.map(renderCompleted)}
            </>
          )}
        </View>

        {totalsWeeks.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <Text className="text-text-primary text-lg font-bold mb-1">
              {t('trainingCalendar.totals.title', {
                defaultValue: 'Planned vs completed',
              })}
            </Text>
            {loadHelpOpen ? (
              <View
                testID="load-help"
                className="bg-background rounded-lg p-3 mb-3"
              >
                <Text className="text-text-primary text-xs font-semibold mb-1">
                  {t('exerciseStatistics.load.title', {
                    defaultValue: 'Training Load',
                  })}
                </Text>
                <Text className="text-text-secondary text-xs">
                  {t('exerciseStatistics.load.subtitle', {
                    defaultValue:
                      'Workout minutes weighted by heart rate, this week against the last four.',
                  })}{' '}
                  {t('trainingCalendar.load.method', {
                    defaultValue:
                      'Load is minutes weighted by your average heart rate (1 to 5, from how close it was to your maximum). A workout with no heart rate counts at a moderate weight of 2, so a strength session with no watch still counts by its time. Effort ratings are not used.',
                  })}
                </Text>
              </View>
            ) : null}
            {totalsWeeks.map(renderTotals)}
            {earlier.length > 0 ? (
              <Pressable
                testID="toggle-earlier-weeks"
                accessibilityRole="button"
                onPress={() => setShowEarlier((open) => !open)}
                className="items-center py-1"
              >
                <Text className="text-accent-primary text-sm font-semibold">
                  {showEarlier
                    ? t('trainingCalendar.hideEarlier', {
                        defaultValue: 'Hide earlier weeks',
                      })
                    : t('trainingCalendar.showEarlier', {
                        count: earlier.length,
                        defaultValue: 'Show earlier weeks ({{count}})',
                      })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('trainingCalendar.previous', {
              defaultValue: 'Previous',
            })}
            onPress={() => move(-1)}
            hitSlop={12}
          >
            <Icon name="chevron-back" size={22} color={colors.mutedIcon} />
          </Pressable>
          <Text className="text-text-primary text-xl font-bold">{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('trainingCalendar.next', {
              defaultValue: 'Next',
            })}
            onPress={() => move(1)}
            hitSlop={12}
          >
            <Icon name="chevron-forward" size={22} color={colors.mutedIcon} />
          </Pressable>
        </View>
        <View className="mb-4">
          <SegmentedControl<ViewMode>
            segments={[
              {
                key: 'month',
                label: t('trainingCalendar.month', { defaultValue: 'Month' }),
              },
              {
                key: 'week',
                label: t('trainingCalendar.week', { defaultValue: 'Week' }),
              },
            ]}
            activeKey={mode}
            onSelect={changeMode}
          />
        </View>
        {isError && data ? (
          <Text className="text-text-secondary text-xs mb-2">
            {t('trainingCalendar.refreshFailed', {
              defaultValue: 'Could not refresh. Showing the last result.',
            })}
          </Text>
        ) : null}
        {body()}
      </ScrollView>
    </>
  );
};

export default TrainingCalendarScreen;
