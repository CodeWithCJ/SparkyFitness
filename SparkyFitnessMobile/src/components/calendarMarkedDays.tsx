import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { type CalendarDay } from 'react-native-ui-datepicker';
import { toLocalDateString } from '../utils/dateUtils';

interface MarkedDayOptions {
  /** Calendar days (YYYY-MM-DD) to flag with a dot. */
  markedDates?: string[];
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
}

/**
 * A `Day` override for `react-native-ui-datepicker` that dots the given days,
 * ready to spread into the picker's `components` prop.
 *
 * Shared by the single-date and range sheets so a day carrying a photo looks
 * the same wherever it is picked from. Returns an empty object when there is
 * nothing to mark, which leaves the library's own day cell in place for every
 * caller that passes no dates.
 */
export function useMarkedDayComponent({
  markedDates,
  textPrimary,
  textMuted,
  accentPrimary,
}: MarkedDayOptions): { Day?: (day: CalendarDay) => React.ReactNode } {
  const markedSet = useMemo(() => new Set(markedDates ?? []), [markedDates]);

  // The library keeps its own Pressable and container styling around an
  // overridden Day, so selection, today, range and disabled backgrounds still
  // come from each sheet's `styles` map; only the label is ours to draw.
  const renderMarkedDay = useCallback(
    (day: CalendarDay) => {
      // CalendarDay.date is declared `string` by the library but actually
      // arrives as its internal dayjs object, so it goes through the same
      // `new Date(...)` + toLocalDateString conversion the change handlers use.
      // That also keeps the comparison on the local calendar day rather than a
      // UTC instant, which would mark the wrong cell either side of midnight.
      const dayString = toLocalDateString(
        new Date(day.date as unknown as string | number | Date)
      );
      const marked = markedSet.has(dayString);
      // Both ends of a range get the same solid accent fill a single selection
      // does, so the label and the dot have to invert there too or they vanish
      // into it.
      const onAccent = day.isSelected || day.rangeStart || day.rangeEnd;
      return (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              color: onAccent
                ? '#FFFFFF'
                : day.isDisabled
                  ? textMuted
                  : textPrimary,
            }}
          >
            {day.text}
          </Text>
          <View
            testID={marked ? 'calendar-day-marked' : 'calendar-day-unmarked'}
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              marginTop: 1,
              backgroundColor: marked
                ? onAccent
                  ? '#FFFFFF'
                  : accentPrimary
                : 'transparent',
            }}
          />
        </View>
      );
    },
    [markedSet, textPrimary, textMuted, accentPrimary]
  );

  return markedSet.size > 0 ? { Day: renderMarkedDay } : {};
}
