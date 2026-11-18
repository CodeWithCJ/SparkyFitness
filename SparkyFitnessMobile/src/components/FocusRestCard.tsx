import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import FocusTimerRing from './FocusTimerRing';
import Icon from './Icon';
import { useCountdownSeconds } from '../hooks/useCountdownCue';
import { useClockTick } from '../hooks/useClockTick';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { withAlpha } from '../utils/colors';
import { formatRestCountdown } from '../utils/workoutSession';

const RING_SIZE = 108;

interface FocusRestCardProps {
  /** The set the rest leads into, e.g. "Set 3 · 82.5 kg × 8". Null hides the line. */
  nextText: string | null;
}

/**
 * The focus view's rest timer: an orange card among the sets (where the
 * active-set card sits) with the ring and countdown, −15 s / +15 s, the
 * lead-in beep setting and what comes next. Tapping the ring pauses or
 * resumes. The sets table stays visible below it, and the footer carries Skip
 * rest. The beeps themselves live in the rest bar, which stays mounted.
 */
function FocusRestCard({ nextText }: FocusRestCardProps) {
  const { t } = useTranslation();
  const { state, remainingMs, progress } = useRestCountdown({
    selfTick: false,
  });
  useClockTick(state === 'resting');
  const beepSeconds = useCountdownSeconds();
  const soundOn = useAppPreferencesStore((s) => s.restTimerSoundEnabled);
  const [restColor, textMuted, textPrimary] = useCSSVariable([
    '--color-rest',
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string, string];

  if (state === 'ready') return null;
  const paused = state === 'paused';
  const timerColor = paused ? textMuted : restColor;
  const beeps = soundOn && beepSeconds > 0;

  const adjust = (deltaSec: number) =>
    useActiveWorkoutStore.getState().adjustRest(deltaSec);
  const togglePause = () => {
    const store = useActiveWorkoutStore.getState();
    if (paused) store.resumeRest();
    else store.pauseRest();
  };

  return (
    <View
      testID="focus-rest-card"
      className="my-1 gap-3 rounded-[20px] bg-raised p-4"
      style={{ borderWidth: 2, borderColor: restColor }}
    >
      <View className="flex-row items-center justify-between">
        <Text
          className="text-xs font-bold uppercase"
          style={{ color: restColor, letterSpacing: 1 }}
        >
          {paused
            ? t('activeWorkout.focus.rest.paused', {
                defaultValue: 'Rest paused',
              })
            : t('activeWorkout.focus.rest.label', { defaultValue: 'Rest' })}
        </Text>
        <View
          testID="focus-rest-beeps"
          className="flex-row items-center gap-1.5"
        >
          <Icon
            name={beeps ? 'volume-on' : 'volume-off'}
            size={14}
            color={textMuted}
          />
          <Text className="text-[13px] font-semibold text-text-secondary">
            {beeps
              ? t('activeWorkout.focus.rest.beepsAt', {
                  defaultValue: 'Beeps at {{seconds}} s',
                  seconds: beepSeconds,
                })
              : t('activeWorkout.focus.rest.beepsOff', {
                  defaultValue: 'Beeps off',
                })}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={togglePause}
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t('activeWorkout.rest.resume', { defaultValue: 'Resume rest' })
              : t('activeWorkout.rest.pause', { defaultValue: 'Pause rest' })
          }
        >
          <FocusTimerRing
            size={RING_SIZE}
            strokeWidth={10}
            progress={progress}
            color={timerColor}
            trackColor={withAlpha(timerColor, 0.22)}
          >
            <Text
              className="text-[30px] font-bold"
              style={{ color: timerColor, fontVariant: ['tabular-nums'] }}
            >
              {formatRestCountdown(remainingMs)}
            </Text>
          </FocusTimerRing>
        </Pressable>
        <View className="flex-1 items-center gap-3">
          {([-15, 15] as const).map((delta) => (
            <Pressable
              key={delta}
              onPress={() => adjust(delta)}
              accessibilityRole="button"
              accessibilityLabel={
                delta < 0
                  ? t('activeWorkout.rest.shorten', {
                      defaultValue: 'Shorten rest by 15 seconds',
                    })
                  : t('activeWorkout.rest.extend', {
                      defaultValue: 'Extend rest by 15 seconds',
                    })
              }
              hitSlop={6}
              className="h-11 flex-row items-center gap-2 px-3 active:opacity-70"
            >
              <Icon
                name={delta < 0 ? 'remove' : 'add'}
                size={18}
                color={textPrimary}
                weight="bold"
              />
              <Text
                className="text-[22px] font-bold text-text-primary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {t('activeWorkout.focus.rest.seconds', {
                  defaultValue: '{{seconds}} s',
                  seconds: 15,
                })}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {nextText != null && (
        <Text
          className="text-[14px] text-text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {t('activeWorkout.focus.rest.next', {
            defaultValue: 'Next: {{value}}',
            value: nextText,
          })}
        </Text>
      )}
    </View>
  );
}

export default React.memo(FocusRestCard);
