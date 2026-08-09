import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Icon from './Icon';
import Button from './ui/Button';

export interface MealTypeTimePickerSheetRef {
  present: (initialTime: string | null, onSelect: (time: string | null) => void) => void;
  dismiss: () => void;
}

/**
 * Dedicated LARGE wheel time picker (maintainer: "the current wheel is wayyy
 * too small"). The wheel is the dominant element of the sheet — wide, with a
 * generous vertical area and readable rows. Reuses the existing
 * `react-native-ui-datepicker` time-wheel mechanism (same library as
 * FastingEditSheet — no new dependency).
 *
 * Behavior:
 * - opening with "08:30" selects 08:30;
 * - Save commits the canonical "HH:MM";
 * - Clear commits null;
 * - swiping/backdrop dismiss WITHOUT Save/Clear makes NO change (pending state
 *   is cleared on dismiss and the callback is never invoked);
 * - scrolling the wheel alone never mutates anything.
 *
 * The wheel is enlarged via a transform scale on the picker (the library's
 * internal wheel container is a fixed 150x150 box) inside an explicit-height
 * wrapper, so it occupies most of the sheet width with readable rows.
 */
const WHEEL_SCALE = 1.8;
const WHEEL_WRAPPER_HEIGHT = 280;

const MealTypeTimePickerSheet = forwardRef<MealTypeTimePickerSheetRef>((_props, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [surfaceBg, textMuted, accentPrimary, textPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string, string, string];

  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const onSelectRef = useRef<((time: string | null) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    present: (initialTime, onSelect) => {
      setPendingValue(initialTime);
      onSelectRef.current = onSelect;
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  // Stable Date for the wheel: memoized so unrelated renders never reseed it.
  const pickerDate = useMemo(() => {
    if (!pendingValue) return new Date();
    const d = new Date();
    const [h, m] = pendingValue.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }, [pendingValue]);

  const handleChange = useCallback(({ date }: { date: DateType }) => {
    if (!date) return;
    let jsDate: Date;
    if (date instanceof Date) jsDate = date;
    else if (typeof date === 'object' && 'toDate' in date) jsDate = date.toDate();
    else if (typeof date === 'string') jsDate = new Date(date);
    else jsDate = new Date(date);
    const hh = String(jsDate.getHours()).padStart(2, '0');
    const mm = String(jsDate.getMinutes()).padStart(2, '0');
    setPendingValue(`${hh}:${mm}`);
  }, []);

  const commit = useCallback((time: string | null) => {
    const cb = onSelectRef.current;
    onSelectRef.current = null;
    bottomSheetRef.current?.dismiss();
    cb?.(time);
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
      onDismiss={() => {
        // Dismiss without Save/Clear: never invoke the callback, never keep
        // stale pending state for the next open.
        onSelectRef.current = null;
        setPendingValue(null);
      }}
    >
      <BottomSheetView className="px-5 pb-safe-or-8">
        <Text className="text-text-primary text-lg font-semibold text-center mb-3">
          Default Time
        </Text>

        {/* Dominant wheel area: explicit generous height, wheel scaled up so
            it fills most of the sheet width with several readable rows above
            and below the selection. No nested card, no summary box. */}
        <View
          style={{
            height: WHEEL_WRAPPER_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          testID="large-time-wheel"
        >
          <View style={{ transform: [{ scale: WHEEL_SCALE }] }}>
            <DateTimePicker
              mode="single"
              date={pickerDate}
              timePicker
              initialView="time"
              hideHeader
              onChange={handleChange}
              styles={{
                selected: { backgroundColor: accentPrimary },
                selected_label: { color: '#FFFFFF' },
                time_label: { fontSize: 28, color: textPrimary },
              }}
            />
          </View>
        </View>

        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={() => commit(null)}
            className="flex-1 items-center justify-center py-3 rounded-lg border border-border-subtle"
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
            onPress={() => commit(pendingValue)}
            accessibilityLabel="Save default time"
          >
            Save
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

MealTypeTimePickerSheet.displayName = 'MealTypeTimePickerSheet';

export default MealTypeTimePickerSheet;
