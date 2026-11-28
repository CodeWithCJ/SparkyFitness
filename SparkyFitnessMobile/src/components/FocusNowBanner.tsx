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
}

/**
 * "NOW · Bench Press · Set 2/4, 82.5 kg x 8, Tap: back": shown while another
 * exercise than the one holding the current set is on show; it names the
 * current set and, on tap, goes back to that exercise's page.
 */
function FocusNowBanner({
  exerciseName,
  setNumber,
  setCount,
  load,
  onBack,
}: FocusNowBannerInfo & { onBack: () => void }) {
  const { t } = useTranslation();
  const accent = String(useCSSVariable('--color-accent-primary'));
  const setLabel = t('activeWorkout.focus.now.set', {
    defaultValue: 'Set {{number}}/{{total}}',
    number: setNumber,
    total: setCount,
  });
  return (
    <Pressable
      testID="focus-now-banner"
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={t('activeWorkout.focus.now.a11y', {
        defaultValue: 'Back to the current exercise',
      })}
      className="mx-3 mb-3 mt-2 flex-row items-center rounded-[20px] px-3.5 py-2 active:opacity-80"
      style={{ backgroundColor: withAlpha(accent, 0.12) }}
    >
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          className="text-[13px] font-bold uppercase"
          style={{ color: accent, letterSpacing: 0.8 }}
        >
          {t('activeWorkout.focus.now.label', {
            defaultValue: 'Now · {{name}}',
            name:
              exerciseName ??
              t('workout.exercise', { defaultValue: 'Exercise' }),
          })}
        </Text>
        <Text
          numberOfLines={1}
          className="text-[17px] font-bold text-text-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {load != null ? `${setLabel} · ${load}` : setLabel}
        </Text>
      </View>
      <Text className="ml-3 text-[14px] font-bold" style={{ color: accent }}>
        {t('activeWorkout.focus.now.tapBack', { defaultValue: 'Tap: back' })}
      </Text>
    </Pressable>
  );
}

export default React.memo(FocusNowBanner);
