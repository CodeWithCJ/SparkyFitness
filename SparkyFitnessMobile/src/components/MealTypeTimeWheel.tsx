import { useMemo, type FC } from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';

/** Shared scale + wrapper height so both surfaces render the SAME large wheel. */
export const TIME_WHEEL_SCALE = 1.8;
export const TIME_WHEEL_WRAPPER_HEIGHT = 280;

export interface MealTypeTimeWheelProps {
  /** Current HH:MM value; null/'' seeds the wheel with the current time. */
  value: string | null | undefined;
  onChange: (hhmm: string) => void;
  testID?: string;
}

/**
 * The ONE large time-wheel used by both the dedicated time sheet and the
 * inline Create flow (apedley: "stack the two components"). The library's
 * wheel is a fixed 150×150 box, so it is scaled 1.8× inside an explicit
 * 280pt wrapper — dominant content, several readable rows above/below.
 *
 * Date handling is centralised here: `value` (HH:MM) is converted to a
 * memoized Date for the picker and every change is converted back to HH:MM.
 */
const MealTypeTimeWheel: FC<MealTypeTimeWheelProps> = ({
  value,
  onChange,
  testID,
}) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const textPrimary = useCSSVariable('--color-text-primary') as string;

  const pickerDate = useMemo(() => {
    const d = new Date();
    if (value) {
      const [h, m] = value.split(':').map(Number);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        d.setHours(h, m, 0, 0);
      }
    }
    return d;
  }, [value]);

  const handleChange = ({ date }: { date: DateType }) => {
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
    onChange(`${hh}:${mm}`);
  };

  return (
    <View
      style={{
        height: TIME_WHEEL_WRAPPER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      testID={testID}
    >
      <View style={{ transform: [{ scale: TIME_WHEEL_SCALE }] }}>
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
  );
};

export default MealTypeTimeWheel;
