import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import WheelPicker, { type PickerOption as WheelPickerOption } from './ui/wheel-picker';
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
  const { t } = useTranslation();
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

  // Raw seconds-wheel index (0..SEC_TOTAL-1), kept in local state instead of
  // recomputed from currentSec every render. Recomputing it (always mid-offset
  // + currentSec) would snap the wheel back to the middle repetition on its
  // own echoed onChangeSec, which is jarring right when a scroll crosses a
  // repetition boundary (e.g. index 359 "59" -> 360 "00"). We only reconcile
  // this index below when valueSec changes for a reason other than our own
  // handleSecondChange call.
  const [secondsIndex, setSecondsIndex] = useState(() => SEC_MID_OFFSET + currentSec);
  const [lastEmittedSec, setLastEmittedSec] = useState(currentSec);

  // valueSec changes are reflected in the same commit rather than triggering an extra render.
  // The "last known" value is plain state rather than a ref.
  if (currentSec !== lastEmittedSec) {
    setLastEmittedSec(currentSec);
    setSecondsIndex(SEC_MID_OFFSET + currentSec);
  }

  const secondsWheelValue = secondsIndex;

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
    // Preserve the wheel's actual raw index (don't rebase to the middle
    // repetition) so a scroll across a repetition boundary doesn't snap back.
    const index = Number(v);
    // Strip the loop offset; the canonical value is always 0–59.
    const s = index % 60;
    setLastEmittedSec(s);
    setSecondsIndex(index);
    const total = Math.max(0, Math.min(maxSec, currentMin * 60 + s));
    onChangeSec(total);
  };

  return (
    <View style={{ height: ITEM_HEIGHT * 5 + 22 }}>
      <View className="flex-row items-center justify-center mb-1">
        <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
          {t('duration.minutes', { defaultValue: 'Minutes' })}
        </Text>
        <View style={{ width: 18 }} />
        <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
          {t('duration.seconds', { defaultValue: 'Seconds' })}
        </Text>
      </View>

      <View className="flex-row items-center justify-center">
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
    </View>
  );
}

export default DurationWheel;