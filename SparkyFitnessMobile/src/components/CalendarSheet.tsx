import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { toLocalDateString } from '../utils/dateUtils';

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
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [
      sectionBg,
      textMuted,
      accentPrimary,
      textPrimary,
      textSecondary,
    ] = useCSSVariable([
      '--color-section',
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

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode]
    );

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
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: sectionBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetView className="pb-5 px-2">
          <DateTimePicker
            mode="single"
            date={dateValue}
            maxDate={new Date()}
            onChange={handleChange}
            styles={{
              selected: { backgroundColor: accentPrimary },
              selected_label: { color: '#FFFFFF' },
              today: { borderColor: accentPrimary, borderWidth: 1 },
              day_label: { color: textPrimary },
              weekday_label: { color: textSecondary },
              month_selector_label: { color: textPrimary, fontWeight: '600' },
              year_selector_label: { color: textPrimary, fontWeight: '600' },
              disabled_label: { color: textMuted },
              button_prev_image: { tintColor: textSecondary },
              button_next_image: { tintColor: textSecondary },
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
