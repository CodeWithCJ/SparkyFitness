import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { toHourMinute } from '@workspace/shared';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Icon from './Icon';
import Button from './ui/Button';

export interface MealTypeTimePickerSheetRef {
  present: (initialTime: string | null, onSelect: (time: string | null) => void) => void;
  dismiss: () => void;
}

/**
 * Wheel time picker for a meal type's default_time, reusing the same
 * `react-native-ui-datepicker` time-wheel pattern already used by
 * FastingEditSheet (existing app pattern — no new picker dependency).
 * Selecting a time returns `HH:MM`; "Clear" returns `null`. Dismissing
 * (backdrop/swipe) without Save/Clear never invokes the callback.
 */
const MealTypeTimePickerSheet = forwardRef<MealTypeTimePickerSheetRef>(
  (_props, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-text-primary',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    const [pendingValue, setPendingValue] = useState<string | null>(null);
    const onSelectRef = useRef<((time: string | null) => void) | null>(null);

    useImperativeHandle(ref, () => ({
      present: (initialTime, onSelect) => {
        onSelectRef.current = onSelect;
        setPendingValue(initialTime);
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();

    const handleChange = useCallback(({ date }: { date: DateType }) => {
      if (!date) return;
      let jsDate: Date;
      if (date instanceof Date) {
        jsDate = date;
      } else if (typeof date === 'object' && 'toDate' in date) {
        jsDate = date.toDate();
      } else if (typeof date === 'string') {
        jsDate = new Date(date);
      } else {
        jsDate = new Date(date);
      }
      const hh = String(jsDate.getHours()).padStart(2, '0');
      const mm = String(jsDate.getMinutes()).padStart(2, '0');
      setPendingValue(`${hh}:${mm}`);
    }, []);

    // Stable Date instance so unrelated renders do not reseed the wheel.
    const initialDate = useMemo(() => {
      if (!pendingValue) return new Date();
      const d = new Date();
      const [h, m] = pendingValue.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      return d;
    }, [pendingValue]);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enableContentPanningGesture={Platform.OS !== 'android'}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onDismiss={() => {
          setPendingValue(null);
          onSelectRef.current = null;
        }}
      >
        <BottomSheetView className="px-5 pb-safe-or-8">
          <Text className="text-text-primary text-lg font-semibold text-center mb-3">
            Default time
          </Text>
          <Text className="text-xs font-semibold uppercase text-text-muted tracking-wide mb-1 px-1">
            Time
          </Text>
          <DateTimePicker
            mode="single"
            date={initialDate}
            timePicker
            initialView="time"
            hideHeader
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
              month_label: { color: textPrimary },
              year_label: { color: textPrimary },
              selected_month: { backgroundColor: accentPrimary },
              selected_month_label: { color: '#FFFFFF' },
              selected_year: { backgroundColor: accentPrimary },
              selected_year_label: { color: '#FFFFFF' },
              time_label: { color: textPrimary },
            }}
          />

          <View className="mt-2 mb-2 rounded-lg border border-border-subtle px-3 py-2 flex-row items-center justify-between">
            <Text className="text-sm text-text-primary">Selected</Text>
            <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>
              {toHourMinute(pendingValue ?? null) || '—'}
            </Text>
          </View>

          <View className="flex-row gap-3 mb-4">
            <TouchableOpacity
              onPress={() => {
                const cb = onSelectRef.current;
                bottomSheetRef.current?.dismiss();
                cb?.(null);
              }}
              className="flex-1 items-center justify-center py-2.5 rounded-lg border border-border-subtle"
              accessibilityRole="button"
              accessibilityLabel="Clear default time"
            >
              <View className="flex-row items-center gap-1.5">
                <Icon name="close" size={16} color={textPrimary} />
                <Text className="text-sm font-medium text-text-primary">Clear</Text>
              </View>
            </TouchableOpacity>
            <Button
              variant="primary"
              className="flex-1"
              onPress={() => {
                const cb = onSelectRef.current;
                const value = pendingValue ?? null;
                bottomSheetRef.current?.dismiss();
                cb?.(value);
              }}
              accessibilityLabel="Save default time"
            >
              Save
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

MealTypeTimePickerSheet.displayName = 'MealTypeTimePickerSheet';

export default MealTypeTimePickerSheet;
