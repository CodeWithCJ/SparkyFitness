import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { useTranslation } from 'react-i18next';
import { toLocalDateString } from '../utils/dateUtils';
import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import {
  useCalendarPresentation,
  getCalendarWeekdayShortNames,
  getCalendarMonthNames,
} from '../utils/calendarLocalization';

export interface CalendarSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface CalendarSheetProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

interface CalendarContentProps extends CalendarSheetProps {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentPrimary: string;
}

/**
 * The keyed boundary is deliberately inside BottomSheetModal. A changed
 * selectedDate starts a fresh calendar view, while the sheet itself remains
 * mounted (and therefore does not dismiss or lose its lifecycle state).
 * Locale changes do not change this key, so manually navigated months survive
 * ordinary and language-driven rerenders.
 */
const CalendarContent = ({
  selectedDate,
  onSelectDate,
  textPrimary,
  textSecondary,
  textMuted,
  accentPrimary,
}: CalendarContentProps) => {
  const { appLocale, presentation } = useCalendarPresentation();
  const { t } = useTranslation();
  const weekdayLabels = useMemo(() => getCalendarWeekdayShortNames(appLocale), [appLocale]);
  const monthLabels = useMemo(() => getCalendarMonthNames(appLocale), [appLocale]);
  const [initialYear, initialMonth] = selectedDate.split('-').map(Number);
  const [visible, setVisible] = React.useState({ year: initialYear, month: initialMonth - 1 });

  const caption = `${monthLabels[visible.month] ?? ''} ${visible.year}`.trim();
  const shiftVisible = useCallback((delta: number) => {
    setVisible((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }, []);

  const [sy, sm, sd] = selectedDate.split('-').map(Number);
  const selectedDateValue = new Date(sy, sm - 1, sd);
  const handleChange = useCallback(
    ({ date }: { date: DateType }) => {
      if (!date) return;
      onSelectDate(toLocalDateString(new Date(date as string | number | Date)));
    },
    [onSelectDate],
  );
  const handleMonthChange = useCallback((value: number) => {
    setVisible((prev) => {
      const date = new Date(prev.year, value, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }, []);

  return (
    <BottomSheetView className="pb-safe-or-5 px-2">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
        <Pressable onPress={() => shiftVisible(-1)} hitSlop={12} accessibilityLabel={t('cycleCalendar.previousMonth', { defaultValue: 'Previous month' })}>
          <Icon name="chevron-back" size={18} color={textPrimary} />
        </Pressable>
        <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' }}>
          {caption}
        </Text>
        <Pressable onPress={() => shiftVisible(1)} hitSlop={12} accessibilityLabel={t('cycleCalendar.nextMonth', { defaultValue: 'Next month' })}>
          <Icon name="chevron-forward" size={18} color={textPrimary} />
        </Pressable>
      </View>
      <DateTimePicker
        mode="single"
        date={selectedDateValue}
        onChange={handleChange}
        month={visible.month}
        year={visible.year}
        onMonthChange={handleMonthChange}
        hideHeader
        locale={presentation.locale}
        firstDayOfWeek={presentation.firstDayOfWeek}
        key={`calendar-${presentation.locale}-${presentation.firstDayOfWeek}-${visible.month}-${visible.year}`}
        components={{
          Weekday: (weekday) => (
            <View style={{ minWidth: 30 }}>
              <Text style={{ color: textSecondary, fontSize: 12, textAlign: 'center' }}>
                {weekdayLabels[weekday.index] ?? weekday.name.short}
              </Text>
            </View>
          ),
          Month: (month) => (
            <View style={{ paddingVertical: 4, alignItems: 'center' }}>
              <Text style={{ color: textPrimary, fontSize: 14 }}>{monthLabels[month.index] ?? month.name.full}</Text>
            </View>
          ),
        }}
        styles={{
          selected: { backgroundColor: accentPrimary },
          selected_label: { color: '#FFFFFF' },
          today: { borderColor: accentPrimary, borderWidth: 1 },
          day_label: { color: textPrimary },
          weekday_label: { color: textSecondary },
          month_selector_label: { color: textPrimary, fontWeight: '600' },
          year_selector_label: { color: textPrimary, fontWeight: '600' },
          disabled_label: { color: textMuted },
          month_label: { color: textPrimary },
          year_label: { color: textPrimary },
          selected_month: { backgroundColor: accentPrimary },
          selected_month_label: { color: '#FFFFFF' },
          selected_year: { backgroundColor: accentPrimary },
          selected_year_label: { color: '#FFFFFF' },
        }}
      />
    </BottomSheetView>
  );
};

const CalendarSheet = React.forwardRef<CalendarSheetRef, CalendarSheetProps>(
  ({ selectedDate, onSelectDate }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] = useCSSVariable([
      '--color-surface', '--color-text-muted', '--color-accent-primary', '--color-text-primary', '--color-text-secondary',
    ]) as [string, string, string, string, string];
    const renderBackdrop = useSheetBackdrop();

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));
    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => sheetRef?.dismiss();
    }, []);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enableContentPanningGesture={Platform.OS !== 'android'}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <CalendarContent
          key={selectedDate}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            onSelectDate(date);
            bottomSheetRef.current?.dismiss();
          }}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
          textMuted={textMuted}
          accentPrimary={accentPrimary}
        />
      </BottomSheetModal>
    );
  },
);

CalendarSheet.displayName = 'CalendarSheet';
export default CalendarSheet;
