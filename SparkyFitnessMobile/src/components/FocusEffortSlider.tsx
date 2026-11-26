import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import EffortFace from './EffortFace';
import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';

export type EffortBand = 'easy' | 'moderate' | 'hard' | 'max';

/** Apple Health's workout effort bands, as the watch shows them: 1-3, 4-6, 7-8, 9-10. */
export function effortBand(rating: number): EffortBand {
  if (rating <= 3) return 'easy';
  if (rating <= 6) return 'moderate';
  if (rating <= 8) return 'hard';
  return 'max';
}

export type EffortMetric = 'rpe' | 'rir';

export const EFFORT_SCALE: Record<
  EffortMetric,
  { min: number; max: number; start: number }
> = {
  rpe: { min: 1, max: 10, start: 8 },
  rir: { min: 0, max: 5, start: 2 },
};

interface Props {
  metric: EffortMetric;
  /** The current value, or null when nothing is rated yet (no face, empty track). */
  value: number | null;
  /** Every change while the person taps or drags. */
  onChange: (value: number) => void;
  /** The value when the finger lifts, or after a screen reader step. */
  onCommit?: (value: number) => void;
  /** Shown under the value, e.g. "2 reps left". */
  caption?: string | null;
  /** Shown instead of the value while it is null. */
  emptyHint?: string;
  valueTestID?: string;
  sliderTestID?: string;
}

/**
 * The effort face, big value with its band, and the draggable segmented
 * slider with band labels, shared by the post-set sheet and the workout
 * summary. RPE fills from the left as it rises; RIR as it falls.
 */
function FocusEffortSlider({
  metric,
  value,
  onChange,
  onCommit,
  caption = null,
  emptyHint,
  valueTestID = 'focus-effort-value',
  sliderTestID = 'focus-effort-slider',
}: Props) {
  const { t } = useTranslation();
  const [track, easyTone, moderateTone, hardTone, maxTone] = useCSSVariable([
    '--color-border-strong',
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as string[];
  const tones: Record<EffortBand, string> = {
    easy: easyTone,
    moderate: moderateTone,
    hard: hardTone,
    max: maxTone,
  };
  const { min, max } = EFFORT_SCALE[metric];
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const segments = max - min + 1;
  const indexOf = (v: number) => (metric === 'rpe' ? v - min : max - v);
  const valueAt = (i: number) => (metric === 'rpe' ? min + i : max - i);
  // The 1 to 10 effort a value stands for, so both scales share bands and tones.
  const rpeEquivalent = (v: number) => (metric === 'rpe' ? v : 10 - v);
  const selected = value == null ? -1 : indexOf(value);
  const band = value == null ? null : effortBand(rpeEquivalent(value));
  const bandLabel: Record<EffortBand, string> = {
    easy: t('workoutComplete.effort.easy', { defaultValue: 'Easy' }),
    moderate: t('workoutComplete.effort.moderate', {
      defaultValue: 'Moderate',
    }),
    hard: t('workoutComplete.effort.hard', { defaultValue: 'Hard' }),
    max: t('workoutComplete.effort.allOut', { defaultValue: 'All Out' }),
  };
  const scaleNote =
    metric === 'rpe'
      ? t('activeWorkout.focus.effort.scaleRpe', {
          defaultValue: 'Same scale as RPE, 1 to 10',
        })
      : t('activeWorkout.focus.effort.scaleRir', {
          defaultValue: 'Reps in reserve, 0 to 5',
        });

  // Tap or drag along the bar: the segment under the finger is the value.
  const trackWidthRef = useRef(0);
  const lastRef = useRef<number | null>(null);
  const setFromX = (x: number) => {
    if (trackWidthRef.current <= 0) return;
    const index = Math.floor((x / trackWidthRef.current) * segments);
    const next = clamp(valueAt(Math.max(0, Math.min(segments - 1, index))));
    lastRef.current = next;
    onChange(next);
  };
  const commitLast = () => {
    if (lastRef.current != null) onCommit?.(lastRef.current);
  };
  const stepBy = (up: boolean) => {
    // Higher effort is more reps left for RIR only when it falls.
    const delta = (up ? 1 : -1) * (metric === 'rpe' ? 1 : -1);
    const next = clamp((value ?? EFFORT_SCALE[metric].start) + delta);
    onChange(next);
    onCommit?.(next);
  };

  return (
    <>
      <View className="flex-row items-center justify-center gap-4">
        {value != null && band != null ? (
          <>
            <EffortFace band={band} size={64} color={tones[band]} />
            <View>
              <View className="flex-row items-baseline gap-2">
                <Text
                  testID={valueTestID}
                  accessibilityLabel={
                    caption != null ? `${value}. ${caption}` : String(value)
                  }
                  className="text-[52px] font-extrabold leading-[58px]"
                  style={{ color: tones[band], fontVariant: ['tabular-nums'] }}
                >
                  {value}
                </Text>
                <Text
                  className="text-[22px] font-bold"
                  style={{ color: tones[band] }}
                >
                  {`· ${bandLabel[band]}`}
                </Text>
              </View>
              {caption != null && (
                <Text className="text-[17px] text-text-secondary">
                  {caption}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text className="text-[17px] text-text-secondary">{emptyHint}</Text>
        )}
      </View>
      <View
        testID={sliderTestID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={scaleNote}
        accessibilityValue={{
          min,
          max,
          now: value ?? undefined,
          text: caption ?? undefined,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          stepBy(e.nativeEvent.actionName === 'increment')
        }
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
        // Keep the drag: the swipe-back gesture or a parent scroll must not steal it.
        onResponderTerminationRequest={() => false}
        onResponderRelease={commitLast}
        onResponderTerminate={commitLast}
        className="h-11 justify-center"
      >
        <View pointerEvents="none" className="flex-row items-center gap-1.5">
          {Array.from({ length: segments }, (_, i) => (
            <View
              key={i}
              className="h-4 flex-1 rounded-full"
              style={{
                backgroundColor:
                  i <= selected
                    ? tones[effortBand(rpeEquivalent(valueAt(i)))]
                    : track,
              }}
            />
          ))}
        </View>
        {band != null && (
          <View
            pointerEvents="none"
            className="absolute h-9 w-9 rounded-full border-[3px] bg-white"
            style={{
              left: `${((selected + 0.5) / segments) * 100}%`,
              marginLeft: -18,
              borderColor: tones[band],
            }}
          />
        )}
      </View>
      <View className="flex-row justify-between">
        {(['easy', 'moderate', 'hard', 'max'] as const).map((b) => (
          <Text key={b} className="text-[13px] text-text-secondary">
            {bandLabel[b]}
          </Text>
        ))}
      </View>
    </>
  );
}

export default React.memo(FocusEffortSlider);
