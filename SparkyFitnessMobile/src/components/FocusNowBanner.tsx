import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { withAlpha } from '../utils/colors';

export interface FocusNowBannerInfo {
  /** The current set's exercise; null when its snapshot has no name. */
  exerciseName: string | null;
  setNumber: number;
  setCount: number;
  /** Target load of the current set, e.g. "82.5 kg × 8". */
  load: string | null;
  /** Reopens the most recently logged set to edit it in place. */
  onPreviousSet: () => void;
}

/**
 * "NOW · Bench Press · Set 2/4, 82.5 kg x 8, Tap: back": names the set the
 * lifter is on and, on tap, steps back to the last logged set to edit it.
 */
function FocusNowBanner({
  exerciseName,
  setNumber,
  setCount,
  load,
  onPreviousSet,
}: FocusNowBannerInfo) {
  const { t } = useTranslation();
  const accent = String(useCSSVariable('--color-accent-primary'));
  return (
    <Pressable
      testID="focus-now-banner"
      onPress={onPreviousSet}
      accessibilityRole="button"
      accessibilityLabel={t('activeWorkout.focus.now.a11y', {
        defaultValue: 'Previous set, edit in place',
      })}
      className="mx-3 mt-2 flex-row items-center rounded-[20px] px-3.5 py-2 active:opacity-80"
      style={{ backgroundColor: withAlpha(accent, 0.12) }}
    >
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className="text-[13px] font-bold uppercase"
          style={{ color: accent, letterSpacing: 0.8 }}
        >
          {t('activeWorkout.focus.now.label', {
            defaultValue: 'Now · {{name}} · Set {{number}}/{{total}}',
            name:
              exerciseName ??
              t('workout.exercise', { defaultValue: 'Exercise' }),
            number: setNumber,
            total: setCount,
          })}
        </Text>
        {load != null && (
          <Text
            numberOfLines={1}
            className="text-[17px] font-bold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {load}
          </Text>
        )}
      </View>
      <Text className="text-[14px] font-bold" style={{ color: accent }}>
        {t('activeWorkout.focus.now.tapBack', { defaultValue: 'Tap: back' })}
      </Text>
    </Pressable>
  );
}

export default React.memo(FocusNowBanner);
