import { useMemo, type FC } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { dateTypeToDate, timeStringToDate, dateToTimeString } from './TimeSheet';

/**
 * Shared large time wheel used by BOTH the dedicated time sheet and the
 * inline Create flow (apedley: "stack the two components").
 *
 * LAYOUT (based on react-native-ui-datepicker 3.1.2 source):
 * - The time view is built from a horizontal `ScrollView (scrollEnabled:false)`
 *   → a `timePickerContainer` that is HARDCODED to width/height 150
 *   (`CONTAINER_HEIGHT / 2`), holding two `flex:1` wheel columns (hours /
 *   minutes). The selected indicator is `width:'100%'` of each column, and the
 *   vertical wheel is an `Animated.FlatList` whose width is inherited from the
 *   parent. In other words EVERY horizontal pixel of the time wheel comes from
 *   the parent width — if the parent doesn't stretch the picker, the columns
 *   collapse and the wheel is invisible.
 * - `containerHeight` is applied only as `height` on the outer Calendar
 *   wrapper around the active view; it does NOT size the time box (which is
 *   the fixed 150 from the CONTAINER_HEIGHT enum). We therefore do not lean on
 *   it to make the wheel visible — the full-width stretch below is what does.
 *
 * WHY the wheel was blank on physical Android (device re-test after removing
 * the old transform-scale *also* stayed blank): the previous wrapper used
 * `alignItems:'center'`, so the picker root was NOT stretched across the
 * available width; it shrank to content width and, because the inner wheels
 * are `flex:1` children inheriting that collapsed width, their columns (and
 * rows) got ~0 width → an empty region. The fix owns an explicit FULL-WIDTH
 * contract on the shared wheel root (same effective layout as the app's
 * existing `TimeSheet`, which renders the picker directly under a
 * full-width `BottomSheetView`).
 */
export const TIME_WHEEL_CONTAINER_HEIGHT = 220;
/** Fixed vertical space the wheel region occupies in the sheets. */
export const TIME_WHEEL_WRAPPER_HEIGHT = 220;

export interface MealTypeTimeWheelProps {
  /** Current HH:MM value; null/'' seeds the wheel with the current time. */
  value: string | null | undefined;
  onChange: (hhmm: string) => void;
  testID?: string;
}

/**
 * The ONE large time wheel shared by the dedicated time sheet and the inline
 * Create flow.
 *
 * Presentation is 24-hour (hours 00–23, minutes 00–59) — no AM/PM third
 * column — matching the maintainer mockup; the persisted value is always
 * canonical "HH:MM". Date handling is centralised here using the SAME
 * conversion helpers as the app's `TimeSheet` (single implementation).
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
        // Full width + stretch: the library's wheel columns are `flex:1`
        // children that inherit their width from the parent, so a collapsed /
        // center-shrank parent is exactly what blanks them on device. Do NOT
        // reintroduce alignItems:'center' / justifyContent:'center' here.
        width: '100%',
        alignSelf: 'stretch',
        height: TIME_WHEEL_WRAPPER_HEIGHT,
      }}
      testID={testID}
    >
      <DateTimePicker
        mode="single"
        date={pickerDate}
        timePicker
        initialView="time"
        hideHeader
        // 24-hour presentation (no AM/PM), per the maintainer mockup.
        style={{ width: '100%', alignSelf: 'stretch' }}
        containerHeight={TIME_WHEEL_CONTAINER_HEIGHT}
        onChange={handleChange}
        styles={pickerStyles}
      />
    </View>
  );
};

export default MealTypeTimeWheel;
