import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable, useUniwind } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import Button from './ui/Button';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

/** Normalizes the picker's 6-way `DateType` into a JS `Date`. */
function dateTypeToDate(date: DateType): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'object' && 'toDate' in date) return date.toDate();
  if (typeof date === 'string') return new Date(date);
  return new Date(date);
}

/** Builds a `Date` seeded with today's date and the given 'HH:MM' (or now if empty/invalid). */
function timeStringToDate(value: string): Date {
  const now = new Date();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return now;
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function dateToTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export interface TimeSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface TimeSheetProps {
  value: string; // '' or 'HH:MM'
  onSelectTime: (time: string) => void;
}

const TimeSheet = forwardRef<TimeSheetRef, TimeSheetProps>(({ value, onSelectTime }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const [surfaceBg, textMuted, accentPrimary, textPrimary, borderSubtle] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-primary',
    '--color-border-subtle',
  ]) as [string, string, string, string, string];

  // The time the wheel is showing, committed by Done even if never scrolled.
  // Seeded at present() so an open sheet doesn't re-seed to "now" on parent
  // re-renders while the value is still empty.
  const [displayed, setDisplayed] = useState('');

  useImperativeHandle(ref, () => ({
    present: () => {
      setDisplayed(dateToTimeString(timeStringToDate(value)));
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={isDarkMode ? 0.7 : 0.5}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [isDarkMode],
  );

  const handleChange = useCallback(
    ({ date }: { date: DateType }) => {
      const js = dateTypeToDate(date);
      if (js && !Number.isNaN(js.getTime())) {
        const time = dateToTimeString(js);
        setDisplayed(time);
        onSelectTime(time);
      }
    },
    [onSelectTime],
  );

  const handleDone = useCallback(() => {
    if (displayed) onSelectTime(displayed);
    bottomSheetRef.current?.dismiss();
  }, [displayed, onSelectTime]);

  const pickerStyles = useMemo(
    () => ({
      time_selector_label: { color: textPrimary, fontWeight: '600' as const },
      time_label: { color: textPrimary, fontSize: 24, fontWeight: '500' as const },
      time_selected_indicator: { backgroundColor: borderSubtle, borderRadius: 10 },
      selected_month: { backgroundColor: accentPrimary },
      selected_month_label: { color: '#FFFFFF' },
    }),
    [accentPrimary, textPrimary, borderSubtle],
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
          date={timeStringToDate(displayed || value)}
          timePicker
          initialView="time"
          hideHeader
          use12Hours
          onChange={handleChange}
          styles={pickerStyles}
          // The wheels render 5 rows of 44px; the default 300px container
          // centers them inside ~80px of dead space.
          containerHeight={220}
        />
        <View className="px-2 pt-2">
          <Button variant="primary" onPress={handleDone}>
            Done
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

TimeSheet.displayName = 'TimeSheet';

export default TimeSheet;
