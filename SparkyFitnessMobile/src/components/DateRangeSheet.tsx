import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View, Text } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { toLocalDateString } from '../utils/dateUtils';
import Icon from './Icon';
import Button from './ui/Button';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { useCalendarPresentation } from '../utils/calendarLocalization';

export interface DateRangeSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface DateRangeSheetProps {
  /** Called with inclusive YYYY-MM-DD bounds when the user confirms a range. */
  onConfirm: (from: string, to: string) => void;
  /** Heading above the calendar. Defaults to the writeback removal wording. */
  title?: string;
  /** Confirm button label. Defaults to the writeback removal wording. */
  confirmLabel?: string;
}

/**
 * Bottom-sheet calendar in range mode (start + end). Mirrors CalendarSheet's theming;
 * adds a confirm button since a range needs two taps and the user may adjust before
 * committing. The wording is caller-supplied because the two consumers ask for
 * opposite things - one removes the range, the other plays it back.
 */
const DateRangeSheet = React.forwardRef<DateRangeSheetRef, DateRangeSheetProps>(
  ({ onConfirm, title, confirmLabel }, ref) => {
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { presentation } = useCalendarPresentation();
    const [start, setStart] = useState<DateType>(undefined);
    const [end, setEnd] = useState<DateType>(undefined);

    const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-text-primary',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    useImperativeHandle(ref, () => ({
      present: () => {
        setStart(undefined);
        setEnd(undefined);
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        sheetRef?.dismiss();
      };
    }, []);

    const renderBackdrop = useSheetBackdrop();

    const handleChange = useCallback(
      ({ startDate, endDate }: { startDate: DateType; endDate: DateType }) => {
        setStart(startDate);
        setEnd(endDate);
      },
      []
    );

    const confirm = useCallback(() => {
      if (!start || !end) return;
      onConfirm(
        toLocalDateString(new Date(start as string | number | Date)),
        toLocalDateString(new Date(end as string | number | Date))
      );
      bottomSheetRef.current?.dismiss();
    }, [start, end, onConfirm]);

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
          <Text className="text-base font-semibold text-text-primary text-center mt-2 mb-1">
            {title ??
              t('dateRange.removeTitle', {
                defaultValue: 'Select a date range to remove',
              })}
          </Text>
          <DateTimePicker
            mode="range"
            startDate={start}
            endDate={end}
            maxDate={new Date()}
            onChange={handleChange}
            locale={presentation.locale}
            firstDayOfWeek={presentation.firstDayOfWeek}
            components={{
              IconPrev: (
                <Icon name="chevron-back" size={18} color={textPrimary} />
              ),
              IconNext: (
                <Icon name="chevron-forward" size={18} color={textPrimary} />
              ),
            }}
            styles={{
              selected: { backgroundColor: accentPrimary },
              selected_label: { color: '#FFFFFF' },
              range_fill: { backgroundColor: accentPrimary, opacity: 0.25 },
              range_start: { backgroundColor: accentPrimary },
              range_start_label: { color: '#FFFFFF' },
              range_end: { backgroundColor: accentPrimary },
              range_end_label: { color: '#FFFFFF' },
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
          <View className="px-2 mt-1">
            <Button
              variant="primary"
              onPress={confirm}
              disabled={!start || !end}
            >
              <Text className="text-base font-semibold text-white">
                {confirmLabel ??
                  t('dateRange.removeAction', {
                    defaultValue: 'Remove selected range',
                  })}
              </Text>
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

DateRangeSheet.displayName = 'DateRangeSheet';

export default DateRangeSheet;
