import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { toLocalDateString } from '../utils/dateUtils';
import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { useCalendarPresentation } from '../utils/calendarLocalization';

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

    // Parse YYYY-MM-DD without timezone shifting
    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateValue = new Date(year, month - 1, day);

    const handleChange = useCallback(
      ({ date }: { date: DateType }) => {
        if (!date) return;
        const dateStr = toLocalDateString(new Date(date as string | number | Date));
        onSelectDate(dateStr);
        bottomSheetRef.current?.dismiss();
      },
      [onSelectDate]
    );

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
          <DateTimePicker
            mode="single"
            date={dateValue}
            onChange={handleChange}
            locale={presentation.locale}
            firstDayOfWeek={presentation.firstDayOfWeek}
            components={{
              IconPrev: <Icon name="chevron-back" size={18} color={textPrimary} />,
              IconNext: <Icon name="chevron-forward" size={18} color={textPrimary} />,
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
