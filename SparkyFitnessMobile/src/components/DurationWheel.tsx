import { useMemo } from 'react';
import { Text, View } from 'react-native';
// Deep import: Metro resolves react-native-ui-datepicker via its "react-native"
// field → src/index, so sub-path imports from src/ work at runtime and give us
// the exact wheel component the library uses for its own time picker columns.
// eslint-disable-next-line import/no-internal-modules
import WheelPicker, {
  type WheelPickerOption,
} from 'react-native-ui-datepicker/src/components/time-picker/wheel-picker';
import { useCSSVariable } from 'uniwind';

interface DurationWheelProps {
  valueSec: number;
  onChangeSec: (seconds: number) => void;
  maxSec?: number;
}

const ITEM_HEIGHT = 44;

// Seconds rollover: give the wheel 10× the real range (600 items) so the user
// can scroll up or down through many full rotations without hitting an edge.
// The displayed text is `index % 60`; onChange strips the loop offset back to
// the canonical 0–59 value. Start position is always the center repetition so
// equal runway exists in both directions.
const SEC_LOOP = 10;
const SEC_TOTAL = 60 * SEC_LOOP; // 600
const SEC_MID_OFFSET = Math.floor(SEC_LOOP / 2) * 60; // 300

function DurationWheel({ valueSec, onChangeSec, maxSec = 900 }: DurationWheelProps) {
  const [textPrimary, borderSubtle] = useCSSVariable([
    '--color-text-primary',
    '--color-border-subtle',
  ]) as [string, string];

  const clamped = Math.max(0, Math.min(maxSec, valueSec));
  const currentMin = Math.floor(clamped / 60);
  const currentSec = clamped % 60;
  const maxMinutes = Math.floor(maxSec / 60);

  const minuteOptions = useMemo<WheelPickerOption[]>(
    () =>
      Array.from({ length: maxMinutes + 1 }, (_, i) => ({
        value: i,
        text: String(i).padStart(2, '0'),
      })),
    [maxMinutes],
  );

  // Each item has a unique numeric `value` (its index) so WheelPicker's
  // findIndex lookup always lands on the correct row. Text wraps mod 60.
  const secondOptions = useMemo<WheelPickerOption[]>(
    () =>
      Array.from({ length: SEC_TOTAL }, (_, i) => ({
        value: i,
        text: String(i % 60).padStart(2, '0'),
      })),
    [],
  );

  // Map the logical seconds value to the middle repetition so the wheel has
  // equal room to scroll in both directions before hitting an edge.
  const secondsWheelValue = SEC_MID_OFFSET + currentSec;

  const indicatorStyle = useMemo(
    () => ({ backgroundColor: borderSubtle, borderRadius: 8 }),
    [borderSubtle],
  );

  const textStyle = useMemo(
    () => ({ color: textPrimary, fontSize: 22, fontWeight: '500' as const }),
    [textPrimary],
  );

  const handleMinuteChange = (v: number | string) => {
    const m = Number(v);
    const total = Math.max(0, Math.min(maxSec, m * 60 + currentSec));
    onChangeSec(total);
  };

  const handleSecondChange = (v: number | string) => {
    // Strip the loop offset; the canonical value is always 0–59.
    const s = Number(v) % 60;
    const total = Math.max(0, Math.min(maxSec, currentMin * 60 + s));
    onChangeSec(total);
  };

  return (
    <View
      className="flex-row items-center justify-center"
      style={{ height: ITEM_HEIGHT * 5 }}
    >
      <View className="flex-1">
        <WheelPicker
          value={currentMin}
          options={minuteOptions}
          onChange={handleMinuteChange}
          selectedIndicatorStyle={indicatorStyle}
          itemTextStyle={textStyle}
          itemHeight={ITEM_HEIGHT}
          decelerationRate="fast"
        />
      </View>

      <Text
        className="text-text-primary"
        style={{ fontSize: 26, fontWeight: '300', marginHorizontal: 4, marginBottom: 2 }}
      >
        :
      </Text>

      <View className="flex-1">
        <WheelPicker
          value={secondsWheelValue}
          options={secondOptions}
          onChange={handleSecondChange}
          selectedIndicatorStyle={indicatorStyle}
          itemTextStyle={textStyle}
          itemHeight={ITEM_HEIGHT}
          decelerationRate="fast"
        />
      </View>
    </View>
  );
}

export default DurationWheel;