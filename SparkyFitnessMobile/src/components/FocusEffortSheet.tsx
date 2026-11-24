import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import EffortFace from './EffortFace';
import { FocusPageButton } from './FocusPage';
import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';
import { effortBand, type EffortBand } from './FocusWorkoutSummary';

export type EffortMetric = 'rpe' | 'rir';

const SCALE: Record<EffortMetric, { min: number; max: number; start: number }> =
  {
    rpe: { min: 1, max: 10, start: 8 },
    rir: { min: 0, max: 5, start: 2 },
  };

/** The value a set's effort starts from on the sheet (the board shows 8 / 2 reps left). */
export function effortStartValue(metric: EffortMetric): number {
  return SCALE[metric].start;
}

interface Props {
  visible: boolean;
  /** "Bench Press · Set 2". */
  title: string;
  metric: EffortMetric;
  initialValue: number;
  onSave: (value: number) => void;
  onSkip: () => void;
}

/**
 * The post-set "How hard was that set?" sheet (Phone-Rpe board). Shown by the
 * workout screen only when the effort column is on and the logged set has no
 * effort yet; Save writes RPE (1-10) or RIR (0-5) to the set, Skip leaves it
 * blank. Remount it (a new `key`) per set so it starts from `initialValue`.
 */
function FocusEffortSheet({
  visible,
  title,
  metric,
  initialValue,
  onSave,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [effort, track, easyTone, moderateTone, hardTone, maxTone] =
    useCSSVariable([
      '--color-effort',
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
  const { min, max } = SCALE[metric];
  const [value, setValue] = useState(initialValue);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const segments = max - min + 1;
  // RPE fills from the left as it rises; RIR as it falls (0 is all-out).
  const indexOf = (v: number) => (metric === 'rpe' ? v - min : max - v);
  const valueAt = (i: number) => (metric === 'rpe' ? min + i : max - i);
  // The 1 to 10 effort a value stands for, so both scales share bands and tones.
  const rpeEquivalent = (v: number) => (metric === 'rpe' ? v : 10 - v);
  const selected = indexOf(value);
  const band = effortBand(rpeEquivalent(value));
  const repsLeft = metric === 'rpe' ? 10 - value : value;
  const bandLabel: Record<EffortBand, string> = {
    easy: t('workoutComplete.effort.easy', { defaultValue: 'Easy' }),
    moderate: t('workoutComplete.effort.moderate', {
      defaultValue: 'Moderate',
    }),
    hard: t('workoutComplete.effort.hard', { defaultValue: 'Hard' }),
    max: t('workoutComplete.effort.allOut', { defaultValue: 'All Out' }),
  };
  const caption =
    metric === 'rpe' && value >= 10
      ? t('activeWorkout.focus.effort.maxEffort', {
          defaultValue: 'Max effort',
        })
      : metric === 'rir' && value === 0
        ? t('activeWorkout.focus.effort.noneLeft', {
            defaultValue: 'Nothing left',
          })
        : t('activeWorkout.focus.effort.repsLeft', {
            count: repsLeft,
            defaultValue: '{{count}} reps left',
            defaultValue_one: '{{count}} rep left',
            defaultValue_other: '{{count}} reps left',
          });
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
  const setFromX = (x: number) => {
    if (trackWidthRef.current <= 0) return;
    const index = Math.floor((x / trackWidthRef.current) * segments);
    setValue(clamp(valueAt(Math.max(0, Math.min(segments - 1, index)))));
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="gap-3 rounded-t-[28px] bg-surface px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="h-1.5 w-10 self-center rounded-full bg-border-strong" />
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            className="text-center text-[13px] font-bold uppercase tracking-wider text-text-secondary"
          >
            {title}
          </Text>
          <Text className="text-center text-[20px] font-bold text-text-primary">
            {t('activeWorkout.focus.effort.question', {
              defaultValue: 'How hard was that set?',
            })}
          </Text>
          <View className="flex-row items-center justify-center gap-4">
            <EffortFace band={band} size={84} color={tones[band]} />
            <View>
              <View className="flex-row items-baseline gap-2">
                <Text
                  testID="focus-effort-value"
                  accessibilityLabel={`${value}. ${caption}`}
                  className="text-[64px] font-extrabold leading-[70px]"
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
              <Text className="text-[17px] text-text-secondary">{caption}</Text>
            </View>
          </View>
          <View
            testID="focus-effort-slider"
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={scaleNote}
            accessibilityValue={{ min, max, now: value, text: caption }}
            accessibilityActions={[
              { name: 'increment' },
              { name: 'decrement' },
            ]}
            onAccessibilityAction={(e) => {
              const up = e.nativeEvent.actionName === 'increment';
              // Higher effort is more reps left for RIR only when it falls.
              const delta = (up ? 1 : -1) * (metric === 'rpe' ? 1 : -1);
              setValue((v) => clamp(v + delta));
            }}
            onLayout={(e) => {
              trackWidthRef.current = e.nativeEvent.layout.width;
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
            onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
            className="h-11 justify-center"
          >
            <View
              pointerEvents="none"
              className="flex-row items-center gap-1.5"
            >
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
            <View
              pointerEvents="none"
              className="absolute h-9 w-9 rounded-full border-[3px] bg-white"
              style={{
                left: `${((selected + 0.5) / segments) * 100}%`,
                marginLeft: -18,
                borderColor: tones[band],
              }}
            />
          </View>
          <View className="flex-row justify-between">
            {(['easy', 'moderate', 'hard', 'max'] as const).map((b) => (
              <Text key={b} className="text-[13px] text-text-secondary">
                {bandLabel[b]}
              </Text>
            ))}
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FocusPageButton
                testID="focus-effort-skip"
                variant="neutral"
                label={t('activeWorkout.focus.effort.skip', {
                  defaultValue: 'Skip',
                })}
                onPress={onSkip}
              />
            </View>
            <View className="flex-[1.6]">
              <Pressable
                testID="focus-effort-save"
                onPress={() => onSave(value)}
                accessibilityRole="button"
                className="h-14 items-center justify-center rounded-full active:opacity-80"
                style={{ backgroundColor: effort }}
              >
                <Text className="text-[18px] font-bold text-black">
                  {t('activeWorkout.focus.effort.save', {
                    defaultValue: 'Save',
                  })}
                </Text>
              </Pressable>
            </View>
          </View>
          <Text className="text-center text-[13px] text-text-secondary">
            {scaleNote}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(FocusEffortSheet);
