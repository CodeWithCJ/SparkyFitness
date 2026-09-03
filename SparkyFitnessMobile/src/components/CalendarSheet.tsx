import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { useTranslation } from 'react-i18next';
import { toLocalDateString } from '../utils/dateUtils';
import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { useMarkedDayComponent } from './calendarMarkedDays';
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
  /**
   * Calendar days (YYYY-MM-DD) to flag with a dot, e.g. days that already have
   * a progress photo. Optional: without it the picker renders the library's own
   * day cell, so existing callers are untouched.
   */
  markedDates?: string[];
}

interface CalendarContentProps extends CalendarSheetProps {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentPrimary: string;
}

type PickerView = 'day' | 'month' | 'year';

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
  markedDates,
}: CalendarContentProps) => {
  const { appLocale, presentation } = useCalendarPresentation();
  const { t } = useTranslation();
  const weekdayLabels = useMemo(
    () => getCalendarWeekdayShortNames(appLocale),
    [appLocale]
  );
  const monthLabels = useMemo(
    () => getCalendarMonthNames(appLocale),
    [appLocale]
  );
  const markedDayComponent = useMarkedDayComponent({
    markedDates,
    textPrimary,
    textMuted,
    accentPrimary,
  });

  const [initialYear, initialMonth] = selectedDate.split('-').map(Number);
  const [visible, setVisible] = useState({
    year: initialYear,
    month: initialMonth - 1,
  });
  // react-native-ui-datepicker only honours `initialView` on mount. The parent
  // tracks `pickerView` ('day' | 'month' | 'year') as logical UI state and a
  // separate `pickerMountVersion` token that increments ONLY when the user
  // explicitly opens the quick-jump grid from the header. The token drives the
  // `key` so the picker remounts with the correct `initialView`. Selecting a
  // month/year calls onMonthChange/onYearChange, which update the visible
  // month/year and reset back to the day grid WITHOUT touching the token, so a
  // stale 'month'/'year' state after a no-op same-month/year tap does NOT remount
  // the picker back into the grid.
  const [pickerView, setPickerView] = useState<PickerView>('day');
  const [pickerMountVersion, setPickerMountVersion] = useState(0);

  const openQuickJump = useCallback((view: 'month' | 'year') => {
    setPickerView(view);
    setPickerMountVersion((v) => v + 1);
  }, []);

  const shiftVisible = useCallback(
    (delta: number) => {
      setVisible((prev) => {
        // In the month grid prev/next moves by year; in the day grid by month.
        const step =
          pickerView === 'month' || pickerView === 'year' ? 12 * delta : delta;
        const date = new Date(prev.year, prev.month + step, 1);
        return { year: date.getFullYear(), month: date.getMonth() };
      });
      // The chevron always returns to the day grid so accessibility labels and
      // subsequent navigation reflect month (not year) stepping. This also covers
      // the case where the library internally returned to day view after the
      // user tapped the already-selected month/year, which does NOT fire
      // onMonthChange/onYearChange (see react-native-ui-datepicker v3.1.2).
      // Only logical state is reset — the mount token is NOT bumped so the picker
      // is not forced back into the month/year grid.
      setPickerView('day');
    },
    [pickerView]
  );

  const [sy, sm, sd] = selectedDate.split('-').map(Number);
  const selectedDateValue = new Date(sy, sm - 1, sd);
  const handleChange = useCallback(
    ({ date }: { date: DateType }) => {
      if (!date) return;
      onSelectDate(toLocalDateString(new Date(date as string | number | Date)));
    },
    [onSelectDate]
  );
  const handleMonthChange = useCallback((value: number) => {
    setVisible((prev) => {
      const date = new Date(prev.year, value, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
    setPickerView('day');
  }, []);
  const handleYearChange = useCallback((value: number) => {
    setVisible((prev) => {
      const date = new Date(value, prev.month, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
    setPickerView('day');
  }, []);

  const prevLabel =
    pickerView === 'month' || pickerView === 'year'
      ? t('cycleCalendar.previousYear', { defaultValue: 'Previous year' })
      : t('cycleCalendar.previousMonth', { defaultValue: 'Previous month' });
  const nextLabel =
    pickerView === 'month' || pickerView === 'year'
      ? t('cycleCalendar.nextYear', { defaultValue: 'Next year' })
      : t('cycleCalendar.nextMonth', { defaultValue: 'Next month' });

  return (
    <BottomSheetView className="pb-safe-or-5 px-2">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={() => shiftVisible(-1)}
          hitSlop={12}
          accessibilityLabel={prevLabel}
        >
          <Icon name="chevron-back" size={18} color={textPrimary} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => {
              if (pickerView === 'month') {
                // Toggling the month caption off returns to the day grid.
                // The mount token must be bumped so the picker remounts with
                // initialView='day' — react-native-ui-datepicker 3.1.2 treats
                // initialView as mount-only, so without a remount the picker
                // would stay stuck in the month grid.
                setPickerView('day');
                setPickerMountVersion((v) => v + 1);
              } else {
                openQuickJump('month');
              }
            }}
            hitSlop={6}
            accessibilityLabel={t('cycleCalendar.selectMonth', {
              defaultValue: 'Select month',
            })}
          >
            <Text
              style={{
                color: textPrimary,
                fontSize: 16,
                fontWeight: '600',
                textTransform: 'capitalize',
              }}
            >
              {monthLabels[visible.month] ?? ''}
            </Text>
          </Pressable>
          <Text style={{ color: textPrimary, fontSize: 16, fontWeight: '600' }}>
            {' '}
          </Text>
          <Pressable
            onPress={() => {
              if (pickerView === 'year') {
                // Toggling the year caption off returns to the day grid.
                // The mount token must be bumped so the picker remounts with
                // initialView='day' — see the month toggle above for rationale.
                setPickerView('day');
                setPickerMountVersion((v) => v + 1);
              } else {
                openQuickJump('year');
              }
            }}
            hitSlop={6}
            accessibilityLabel={t('cycleCalendar.selectYear', {
              defaultValue: 'Select year',
            })}
          >
            <Text
              style={{ color: textPrimary, fontSize: 16, fontWeight: '600' }}
            >
              {visible.year}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => shiftVisible(1)}
          hitSlop={12}
          accessibilityLabel={nextLabel}
        >
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
        onYearChange={handleYearChange}
        initialView={pickerView}
        hideHeader
        locale={presentation.locale}
        firstDayOfWeek={presentation.firstDayOfWeek}
        // `pickerMountVersion` drives the remount: it only changes when the user
        // explicitly opens the quick-jump grid via openQuickJump(). When the
        // library internally returns to day view after a same-month/year tap
        // (no callback fired), parent pickerView resets to 'day' but the token
        // stays the same, preventing a stale 'month'/'year' remount.
        key={`calendar-${presentation.locale}-${presentation.firstDayOfWeek}-${visible.month}-${visible.year}-${pickerMountVersion}`}
        components={{
          ...markedDayComponent,
          Weekday: (weekday) => (
            <View style={{ minWidth: 30 }}>
              <Text
                style={{
                  color: textSecondary,
                  fontSize: 12,
                  textAlign: 'center',
                }}
              >
                {weekdayLabels[weekday.index] ?? weekday.name.short}
              </Text>
            </View>
          ),
          Month: (month) => (
            <View style={{ paddingVertical: 4, alignItems: 'center' }}>
              <Text style={{ color: textPrimary, fontSize: 14 }}>
                {monthLabels[month.index] ?? month.name.full}
              </Text>
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
  ({ selectedDate, onSelectDate, markedDates }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-text-primary',
        '--color-text-secondary',
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
          markedDates={markedDates}
        />
      </BottomSheetModal>
    );
  }
);

CalendarSheet.displayName = 'CalendarSheet';
export default CalendarSheet;
