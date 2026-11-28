import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { useClockTick } from '../hooks/useClockTick';
import { useCountdownCue, useCountdownSeconds } from '../hooks/useCountdownCue';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { fireSelectionHaptic } from '../services/haptics';
import { playIntervalCue } from '../services/sounds';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { formatRestCountdown } from '../utils/workoutSession';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

interface ActiveWorkoutRestBarProps {
  remainingMs: number;
  state: 'ready' | 'resting' | 'paused';
}

/**
 * Draws nothing: the focus view's rest card among the sets carries the timer
 * and Skip rest. It stays mounted only for the lead-in beeps (the watch's
 * Countdown setting: Off, 3 or 5) in the last seconds of a rest. The beep at
 * zero is the rest-complete chime, which the store owns, so it is never
 * doubled here.
 */
function ActiveWorkoutRestBar({
  remainingMs,
  state,
}: ActiveWorkoutRestBarProps) {
  useCountdownCue({
    active: state === 'resting',
    remainingMs,
    seconds: useCountdownSeconds(),
    onTick: () => {
      playIntervalCue('countdown');
      fireSelectionHaptic();
    },
  });
  return null;
}

/**
 * The beep-only rest bar fed straight from the store's countdown. While a rest runs it
 * re-renders on the shared 1s clock (`useClockTick`), in step with the
 * header's elapsed time; that tick also drives the 3-2-1 lead-in above, so
 * the screen hosting the bar needs no clock of its own.
 */
export const LiveActiveWorkoutRestBar = React.memo(
  function LiveActiveWorkoutRestBar() {
    const { state, remainingMs } = useRestCountdown({
      selfTick: false,
    });
    useClockTick(state === 'resting');
    return <ActiveWorkoutRestBar state={state} remainingMs={remainingMs} />;
  }
);

/**
 * Height of {@link ActiveWorkoutCompactRestRow}, for the scroll clearance the
 * screen keeps above the keyboard bar while a rest is running.
 */
export const COMPACT_REST_ROW_HEIGHT = 46;

/**
 * Window height (dp) below which the keyboard bar leaves the compact rest row
 * out. On a 640 dp phone the header, the rail, the keyboard and both rows of
 * the bar leave no room for the set being edited; the docked bar still has
 * the rest controls once the keyboard closes.
 */
export const MIN_WINDOW_HEIGHT_FOR_COMPACT_REST_ROW = 740;

/**
 * One-row rest controls for the set-entry keyboard bar (its `restSlot`): the
 * docked bar sits behind the keyboard while a set cell is being edited, so
 * the keyboard bar carries pause/resume, −15s, the countdown, +15s and skip
 * over a thin progress line. Like {@link LiveActiveWorkoutRestBar} it
 * re-renders on the shared 1s clock (`useClockTick`), so its countdown, the
 * docked bar's and the header's elapsed time change on the same tick, and it
 * calls the store directly, so the keyboard bar around it never re-renders
 * for the countdown. It plays no countdown beep or haptic: the docked bar
 * stays mounted behind the keyboard and remains the only source of that cue.
 */
function CompactRestRow() {
  const { t } = useTranslation();
  const { state, remainingMs, progress } = useRestCountdown({
    selfTick: false,
  });
  useClockTick(state === 'resting');
  const [accentPrimary, textMuted, trackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-progress-track',
  ]) as [string, string, string];

  // The screen passes this only while a rest exists; a held keyboard bar can
  // outlive the rest by a moment.
  if (state === 'ready') return null;

  const paused = state === 'paused';
  const timerColor = paused ? textMuted : accentPrimary;

  return (
    <View
      testID="compact-rest-row"
      className="px-3 justify-center"
      style={{ height: COMPACT_REST_ROW_HEIGHT }}
    >
      <View
        className="h-0.5 rounded-full overflow-hidden mb-1.5"
        style={{ backgroundColor: trackColor }}
      >
        <View
          testID="compact-rest-progress-fill"
          className="h-full rounded-full"
          style={{ width: `${progress * 100}%`, backgroundColor: timerColor }}
        />
      </View>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Pressable
          onPress={() => {
            const store = useActiveWorkoutStore.getState();
            if (paused) store.resumeRest();
            else store.pauseRest();
          }}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t('activeWorkout.rest.resume', { defaultValue: 'Resume rest' })
              : t('activeWorkout.rest.pause', { defaultValue: 'Pause rest' })
          }
          className="h-8 w-8 rounded-full bg-raised items-center justify-center"
        >
          <Icon
            name={paused ? 'play' : 'pause'}
            size={16}
            color={accentPrimary}
            weight="bold"
          />
        </Pressable>
        <Pressable
          onPress={() => useActiveWorkoutStore.getState().adjustRest(-15)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.rest.shorten', {
            defaultValue: 'Shorten rest by 15 seconds',
          })}
          className="h-8 rounded-full bg-raised px-3 justify-center"
        >
          <Text
            className="text-sm font-semibold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {t('activeWorkout.rest.subtractSecondsShort', {
              defaultValue: '−{{seconds}}s',
              seconds: 15,
            })}
          </Text>
        </Pressable>

        {/* Not a live region: it changes every second. */}
        <Text
          className="flex-1 text-center text-lg font-bold"
          style={{ color: timerColor, fontVariant: ['tabular-nums'] }}
        >
          {formatRestCountdown(remainingMs)}
        </Text>

        <Pressable
          onPress={() => useActiveWorkoutStore.getState().adjustRest(15)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.rest.extend', {
            defaultValue: 'Extend rest by 15 seconds',
          })}
          className="h-8 rounded-full bg-raised px-3 justify-center"
        >
          <Text
            className="text-sm font-semibold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {t('activeWorkout.rest.addSecondsShort', {
              defaultValue: '+{{seconds}}s',
              seconds: 15,
            })}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => useActiveWorkoutStore.getState().dismissRest()}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.rest.skip', {
            defaultValue: 'Skip rest',
          })}
          className="h-8 w-8 rounded-full items-center justify-center"
          style={{ backgroundColor: accentPrimary }}
        >
          <Icon name="skip-forward" size={14} color="#ffffff" weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

export const ActiveWorkoutCompactRestRow = React.memo(CompactRestRow);
