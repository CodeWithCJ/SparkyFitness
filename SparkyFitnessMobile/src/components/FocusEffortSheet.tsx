import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { FocusPageButton } from './FocusPage';
import FocusEffortSlider, {
  EFFORT_SCALE,
  type EffortMetric,
} from './FocusEffortSlider';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { formatRestCountdown } from '../utils/workoutSession';
import { withAlpha } from '../utils/colors';

/** The value a set's effort starts from on the sheet (the board shows 8 / 2 reps left). */
export function effortStartValue(metric: EffortMetric): number {
  return EFFORT_SCALE[metric].start;
}

interface Props {
  visible: boolean;
  /** The exercise name, the header's first line. */
  title: string;
  /** "Set 2"; leads the header's second line. */
  setLabel: string;
  /** The logged set's load, e.g. "82.5 kg × 8"; follows the set label. */
  summary?: string | null;
  /** A timed hold: there are no reps to leave in reserve, so no "reps left". */
  timed?: boolean;
  /** A cardio set (duration and distance): timed, but not a hold, so the neutral question. */
  cardio?: boolean;
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
  setLabel,
  summary = null,
  timed = false,
  cardio = false,
  metric,
  initialValue,
  onSave,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rest = useRestCountdown();
  const [effort, restColor] = useCSSVariable([
    '--color-effort',
    '--color-rest',
  ]) as string[];
  const [value, setValue] = useState(initialValue);
  const repsLeft = metric === 'rpe' ? 10 - value : value;
  const caption = timed
    ? null
    : metric === 'rpe' && value >= 10
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
          className="gap-2 rounded-t-[28px] bg-surface px-4 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="h-1.5 w-10 self-center rounded-full bg-border-strong" />
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1" accessibilityRole="header">
              <Text
                numberOfLines={1}
                className="text-[16px] font-bold text-text-primary"
              >
                {title}
              </Text>
              <Text
                testID="focus-effort-summary"
                numberOfLines={1}
                className="text-[14px] text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {summary != null && summary.length > 0
                  ? `${setLabel} · ${summary}`
                  : setLabel}
              </Text>
            </View>
            {rest.state !== 'ready' && (
              <View
                testID="focus-effort-rest"
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: withAlpha(restColor, 0.16) }}
              >
                <Text
                  className="text-[14px] font-bold"
                  style={{ color: restColor, fontVariant: ['tabular-nums'] }}
                >
                  {t('activeWorkout.focus.effort.rest', {
                    defaultValue: 'Rest {{time}}',
                    time: formatRestCountdown(rest.remainingMs),
                  })}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-center text-[20px] font-bold text-text-primary">
            {cardio
              ? t('activeWorkout.focus.effort.questionCardio', {
                  defaultValue: 'How hard was that?',
                })
              : timed
                ? t('activeWorkout.focus.effort.questionHold', {
                    defaultValue: 'How hard was that hold?',
                  })
                : t('activeWorkout.focus.effort.question', {
                    defaultValue: 'How hard was that set?',
                  })}
          </Text>
          <FocusEffortSlider
            metric={metric}
            value={value}
            onChange={setValue}
            caption={caption}
          />
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
            {t('activeWorkout.focus.effort.footer', {
              defaultValue:
                'Only when Ask for effort is on. Rest already started at Log set.',
            })}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(FocusEffortSheet);
