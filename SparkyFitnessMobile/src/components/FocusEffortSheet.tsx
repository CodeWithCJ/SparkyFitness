import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import FullScreenModalBody from './FullScreenModalBody';
import { FocusPageButton } from './FocusPage';
import Icon from './Icon';

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
  const [effort, textPrimary, track] = useCSSVariable([
    '--color-effort',
    '--color-text-primary',
    '--color-border-strong',
  ]) as [string, string, string];
  const { min, max } = SCALE[metric];
  const [value, setValue] = useState(initialValue);
  const step = (delta: number) =>
    setValue((v) => Math.max(min, Math.min(max, v + delta)));
  const segments = max - min + 1;
  // RPE fills from the left as it rises; RIR as it falls (0 is all-out).
  const filled = metric === 'rpe' ? value - min + 1 : max - value + 1;
  const repsLeft = metric === 'rpe' ? 10 - value : value;
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <FullScreenModalBody className="px-4">
        {/* Scrolls when enlarged text outgrows the screen; Skip and Save stay below. */}
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center">
            <View className="max-w-full rounded-full bg-raised px-5 py-2.5">
              <Text
                numberOfLines={1}
                accessibilityRole="header"
                className="text-[17px] font-bold text-text-primary"
              >
                {title}
              </Text>
            </View>
          </View>
          <View className="mt-8 items-center">
            <Text className="text-[14px] font-extrabold uppercase tracking-widest text-text-secondary">
              {t('activeWorkout.focus.effort.question', {
                defaultValue: 'How hard was that set?',
              })}
            </Text>
            <Text
              testID="focus-effort-value"
              accessibilityLabel={`${value}. ${caption}`}
              className="text-[120px] font-extrabold leading-[132px]"
              style={{ color: effort, fontVariant: ['tabular-nums'] }}
            >
              {value}
            </Text>
            <Text className="text-[24px] font-extrabold text-text-primary">
              {caption}
            </Text>
            <Text className="mt-1 text-[15px] text-text-secondary">
              {scaleNote}
            </Text>
          </View>
          <View className="mt-8">
            <View className="flex-row gap-1.5" accessible={false}>
              {Array.from({ length: segments }, (_, i) => (
                <View
                  key={i}
                  className="h-4 flex-1 rounded-full"
                  style={{ backgroundColor: i < filled ? effort : track }}
                />
              ))}
            </View>
            <View className="mt-1.5 flex-row justify-between">
              <Text className="text-[14px] text-text-secondary">
                {t('activeWorkout.focus.effort.easy', { defaultValue: 'Easy' })}
              </Text>
              <Text className="text-[14px] text-text-secondary">
                {t('activeWorkout.focus.effort.max', { defaultValue: 'Max' })}
              </Text>
            </View>
          </View>
          <View className="mt-6 flex-row justify-center gap-4">
            <Pressable
              testID="focus-effort-minus"
              onPress={() => step(-1)}
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.focus.effort.lower', {
                defaultValue: 'Lower',
              })}
              className="h-14 w-14 items-center justify-center rounded-full bg-raised active:opacity-70"
            >
              <Text className="text-[28px] font-bold text-text-primary">−</Text>
            </Pressable>
            <Pressable
              testID="focus-effort-plus"
              onPress={() => step(1)}
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.focus.effort.higher', {
                defaultValue: 'Higher',
              })}
              className="h-14 w-14 items-center justify-center rounded-full bg-raised active:opacity-70"
            >
              <Icon name="add" size={26} color={textPrimary} />
            </Pressable>
          </View>
        </ScrollView>
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
                {t('activeWorkout.focus.effort.save', { defaultValue: 'Save' })}
              </Text>
            </Pressable>
          </View>
        </View>
      </FullScreenModalBody>
    </Modal>
  );
}

export default React.memo(FocusEffortSheet);
