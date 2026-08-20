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
import { getAppLocale } from '../localization';

export interface CalendarSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface CalendarSheetProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
}

const CalendarSheet = React.forwardRef<CalendarSheetRef, CalendarSheetProps>(
  ({ selectedDate, onSelectDate }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { presentation } = useCalendarPresentation();
    const { t } = useTranslation();

    const [
      surfaceBg,
      textMuted,
      accentPrimary,
      textPrimary,
      textSecondary,
    ] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-text-primary',
      '--color-text-secondary',
    ]) as [string, string, string, string, string];

    // Deterministic, app-locale driven names for the weekday/month labels.
    // These are rebuilt on every render from the reactive getAppLocale() (the
    // hook above subscribes this component to app-language changes), so the
    // grid re-localizes immediately on a runtime language switch regardless of
    // react-native-ui-datepicker's internal dayjs locale handling.
    const appLocale = getAppLocale();
    const weekdayLabels = useMemo(() => getCalendarWeekdayShortNames(appLocale), [appLocale]);
    const monthLabels = useMemo(() => getCalendarMonthNames(appLocale), [appLocale]);

    // The visible month/year, kept in sync with the picker's navigation so the
    // custom month caption (localized via Intl, independent of dayjs) always
    // reflects the month the user is looking at.
    const [year, month] = selectedDate.split('-').map(Number);
    const [visible, setVisible] = React.useState({ year, month: month - 1 });
    const caption = `${monthLabels[visible.month] ?? ''} ${visible.year}`.trim();
    const shiftVisible = useCallback((delta: number) => {
      setVisible((prev) => {
        const d = new Date(prev.year, prev.month + delta, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
    }, []);

    useImperativeHandle(ref, () => ({
      present: () => bottomSheetRef.current?.present(),
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        sheetRef?.dismiss();
      };
    }, []);

    const renderBackdrop = useSheetBackdrop();

    // Real selected date (for the highlighted day); the visible month is
    // tracked separately so the custom caption can navigate months without
    // moving the selection.
    const [sy, sm, sd] = selectedDate.split('-').map(Number);
    const selectedDateValue = new Date(sy, sm - 1, sd);

    const handleChange = useCallback(
      ({ date }: { date: DateType }) => {
        if (!date) return;
        const dateStr = toLocalDateString(new Date(date as string | number | Date));
        onSelectDate(dateStr);
        bottomSheetRef.current?.dismiss();
      },
      [onSelectDate]
    );

    const handleMonthChange = useCallback((value: number) => {
      setVisible((prev) => {
        const d = new Date(prev.year, value, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      });
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
        <BottomSheetView className="pb-safe-or-5 px-2">
          {/* Custom deterministic month caption + navigation, driven by the
              reactive app locale via Intl (independent of the library's
              dayjs global locale). The datepicker header is hidden so it never
              renders a stale system-locale month title. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 8,
            }}
          >
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

          {/* The datepicker caches its locale internally (dayjs global locale +
              memoized labels). Keying by locale + firstDayOfWeek forces only this
              picker instance to remount on a runtime language / week-start change
              so weekday labels re-localize immediately. */}
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
              // Override the weekday labels with SparkyFitness-reactive app
              // locale names (CalendarWeek.index is the JS getDay() weekday).
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
              // Override the months-picker grid labels with reactive app locale.
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
      </BottomSheetModal>
    );
  }
);

CalendarSheet.displayName = 'CalendarSheet';

export default CalendarSheet;
