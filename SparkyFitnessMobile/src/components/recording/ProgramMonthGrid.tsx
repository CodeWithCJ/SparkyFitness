import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import { getCalendarWeekdayShortNames } from '../../utils/calendarLocalization';
import { monthGridWeeks, shiftMonth } from '../../utils/monthGrid';
import type { TimelineItem } from '../../utils/programTimeline';

interface Props {
  /** The month shown, YYYY-MM. */
  month: string;
  onMonthChange: (month: string) => void;
  /** 0 = Sunday ... 6 = Saturday. */
  firstDayOfWeek: number;
  /** Today, YYYY-MM-DD. */
  today: string;
  /** The program's workouts by the day they were done or are due. */
  itemsByDay: ReadonlyMap<string, readonly TimelineItem[]>;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}

const dayNumber = (day: string): number => Number(day.slice(8, 10));

/**
 * A month of a program: each day with workouts gets a dot, green for the ones
 * done and the accent colour for the one due and those to come. A tap selects
 * the day; the screen shows its workouts underneath.
 */
const ProgramMonthGrid: React.FC<Props> = ({
  month,
  onMonthChange,
  firstDayOfWeek,
  today,
  itemsByDay,
  selectedDay,
  onSelectDay,
}) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const locale = getAppLocale();
  const weeks = useMemo(
    () => monthGridWeeks(month, firstDayOfWeek),
    [month, firstDayOfWeek]
  );
  const weekdayNames = useMemo(() => {
    const names = getCalendarWeekdayShortNames(locale);
    return Array.from(
      { length: 7 },
      (_, i) => names[(firstDayOfWeek + i) % 7] ?? ''
    );
  }, [locale, firstDayOfWeek]);
  const dayLabel = (day: string): string =>
    new Date(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      dayNumber(day)
    ).toLocaleDateString(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  const [year, monthNumber] = month.split('-').map(Number);
  const title = new Date(year, monthNumber - 1, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View className="bg-surface rounded-xl p-3" testID="program-month-grid">
      <View className="flex-row items-center justify-between mb-2">
        <Pressable
          testID="month-previous"
          accessibilityRole="button"
          accessibilityLabel={t('runPrograms.monthGrid.previous', {
            defaultValue: 'Previous month',
          })}
          hitSlop={8}
          onPress={() => onMonthChange(shiftMonth(month, -1))}
        >
          <Icon name="chevron-back" size={20} color={accent || '#3B82F6'} />
        </Pressable>
        <Text className="text-text-primary text-base font-semibold">
          {title}
        </Text>
        <Pressable
          testID="month-next"
          accessibilityRole="button"
          accessibilityLabel={t('runPrograms.monthGrid.next', {
            defaultValue: 'Next month',
          })}
          hitSlop={8}
          onPress={() => onMonthChange(shiftMonth(month, 1))}
        >
          <Icon name="chevron-forward" size={20} color={accent || '#3B82F6'} />
        </Pressable>
      </View>
      <View className="flex-row mb-1">
        {weekdayNames.map((name, i) => (
          <Text
            key={`${name}-${i}`}
            className="flex-1 text-center text-text-muted text-xs"
          >
            {name}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].day} className="flex-row">
          {week.map(({ day, inMonth }) => {
            const items = itemsByDay.get(day) ?? [];
            const selected = day === selectedDay;
            const isToday = day === today;
            const done = items.some((item) => item.state === 'done');
            const ahead = items.some((item) => item.state !== 'done');
            return (
              <Pressable
                key={day}
                testID={`month-day-${day}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  items.length === 0
                    ? t('runPrograms.monthGrid.dayA11yNone', {
                        date: dayLabel(day),
                        defaultValue: '{{date}}, no workouts',
                      })
                    : t('runPrograms.monthGrid.dayA11y', {
                        date: dayLabel(day),
                        count: items.length,
                        formattedCount: formatLocalizedNumber(items.length),
                        defaultValue: '{{date}}, {{formattedCount}} workouts',
                        defaultValue_one:
                          '{{date}}, {{formattedCount}} workout',
                        defaultValue_other:
                          '{{date}}, {{formattedCount}} workouts',
                      })
                }
                onPress={() => onSelectDay(day)}
                className={`flex-1 items-center py-1.5 my-0.5 mx-0.5 rounded-lg ${
                  selected ? 'bg-accent-primary/15' : ''
                } ${isToday ? 'border border-accent-primary' : ''}`}
              >
                <Text
                  className={`text-sm ${
                    inMonth ? 'text-text-primary' : 'text-text-muted'
                  } ${isToday ? 'font-bold' : ''}`}
                >
                  {dayNumber(day)}
                </Text>
                <View className="flex-row gap-0.5 mt-0.5 h-1.5">
                  {done ? (
                    <View
                      testID={`month-dot-done-${day}`}
                      className="w-1.5 h-1.5 rounded-full bg-text-success"
                    />
                  ) : null}
                  {ahead ? (
                    <View
                      testID={`month-dot-ahead-${day}`}
                      className="w-1.5 h-1.5 rounded-full bg-accent-primary"
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

export default ProgramMonthGrid;
