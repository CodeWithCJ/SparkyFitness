import { useMemo, type FC } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { dateTypeToDate, timeStringToDate, dateToTimeString } from './TimeSheet';

/**
 * Shared large time wheel used by BOTH the dedicated time sheet and the
 * inline Create flow (apedley: "stack the two components").
 *
 * Sizing: the library renders its native time wheels at itemHeight 44 with
 * visibleRest 2 — exactly five 44pt rows (5 × 44 = 220). `containerHeight` is
 * the library's SUPPORTED sizing API: 220 removes the default 300pt
 * container's dead space and shows the full five-row wheel, the same
 * device-proven sizing the app's existing `TimeSheet` uses.
 *
 * Why NOT the previous transform-scale hack: the old implementation wrapped
 * the picker in `<View style={{ transform: [{ scale: 1.8 }] }}>`. On a
 * physical Android device the wheel rendered completely blank inside that
 * scaled wrapper (the wheel is an `Animated.FlatList` driven by the native
 * driver; a scaled ancestor breaks its rendering). The fix renders the picker
 * directly with its own sizing prop — no transform, no manual wrapper math —
 * so the wheel is visible, themeable and works inside the bottom sheet.
 */
export const TIME_WHEEL_CONTAINER_HEIGHT = 220;
/** Height of the region the wheel occupies in the sheets (== container). */
export const TIME_WHEEL_WRAPPER_HEIGHT = TIME_WHEEL_CONTAINER_HEIGHT;

export interface MealTypeTimeWheelProps {
  /** Current HH:MM value; null/'' seeds the wheel with the current time. */
  value: string | null | undefined;
  onChange: (hhmm: string) => void;
  testID?: string;
}

/**
 * The ONE large time-wheel shared by the dedicated time sheet and the inline
 * Create flow. Date handling is centralised here using the SAME conversion
 * helpers as the app's device-proven `TimeSheet` (single implementation of
 * DateType → Date → HH:MM; no second drifting copy).
 */
const MealTypeTimeWheel: FC<MealTypeTimeWheelProps> = ({
  value,
  onChange,
  testID,
}) => {
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const borderSubtle = useCSSVariable('--color-border-subtle') as string;

  // Memoized so typing in the Create Name field never re-seeds the wheel:
  // `value` (HH:MM) → a Date for the picker, ''/null → current time.
  const pickerDate = useMemo(() => timeStringToDate(value ?? ''), [value]);

  const handleChange = ({ date }: { date: DateType }) => {
    const js = dateTypeToDate(date);
    if (js && !Number.isNaN(js.getTime())) {
      onChange(dateToTimeString(js));
    }
  };

  // The picker-specific style keys (same contract as TimeSheet): time_label is
  // 28pt so the wheel reads clearly larger than the rejected tiny original.
  const pickerStyles = useMemo(
    () => ({
      time_selector_label: { color: textPrimary, fontWeight: '600' as const },
      time_label: { color: textPrimary, fontSize: 28, fontWeight: '500' as const },
      time_selected_indicator: { backgroundColor: borderSubtle, borderRadius: 10 },
    }),
    [textPrimary, borderSubtle],
  );

  return (
    <View
      style={{
        height: TIME_WHEEL_WRAPPER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      testID={testID}
    >
      <DateTimePicker
        mode="single"
        date={pickerDate}
        timePicker
        initialView="time"
        hideHeader
        use12Hours
        containerHeight={TIME_WHEEL_CONTAINER_HEIGHT}
        onChange={handleChange}
        styles={pickerStyles}
      />
    </View>
  );
};

export default MealTypeTimeWheel;
