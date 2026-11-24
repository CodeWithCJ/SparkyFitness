import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import FocusTimerRing from './FocusTimerRing';
import { useClockTick } from '../hooks/useClockTick';
import { useCountdownCue, useCountdownSeconds } from '../hooks/useCountdownCue';
import { GET_READY_SECONDS, type FocusHold } from '../hooks/useFocusHold';
import { fireSelectionHaptic } from '../services/haptics';
import { playIntervalCue } from '../services/sounds';
import { withAlpha } from '../utils/colors';
import {
  formatDurationSeconds,
  formatRestCountdown,
} from '../utils/workoutSession';

const RING_SIZE = 208;

interface FocusHoldPanelProps {
  hold: Pick<
    FocusHold,
    'phase' | 'targetSec' | 'startedAt' | 'getReadyEndsAt' | 'tap'
  >;
  /** "Set 2", shown with the phase above the ring. */
  setLabel: string;
  /** The live heart-rate readout, when the watch sends one. */
  heartRate?: React.ReactNode;
}

/**
 * The focus view's timed hold, a card in the set table where the held set
 * sits (the exercise header and the other sets stay around it): a big ring counting the planned length down (or
 * a stopwatch with no plan), a 3-2-1 Get ready first when the watch's
 * "Countdown before holds" is on, and the live heart rate under the time. Tap
 * the ring to start now or to end. At zero the hold cues and keeps counting up
 * ("+0:07") until the tap, which logs the time actually held.
 */
function FocusHoldPanel({ hold, setLabel, heartRate }: FocusHoldPanelProps) {
  const { t } = useTranslation();
  const now = useClockTick(true);
  const beepSeconds = useCountdownSeconds();
  const [holdColor, onHold, textMuted] = useCSSVariable([
    '--color-hold',
    '--color-on-hold',
    '--color-text-muted',
  ]) as [string, string, string];
  const { phase, targetSec, startedAt, getReadyEndsAt } = hold;
  const gettingReady = phase === 'getReady';
  const getReadyLeftMs =
    gettingReady && getReadyEndsAt != null ? getReadyEndsAt - now : 0;
  const elapsedMs = startedAt != null ? Math.max(0, now - startedAt) : 0;
  const runningLeftMs =
    targetSec != null ? Math.max(0, targetSec * 1000 - elapsedMs) : 0;
  // Past the planned length: counting up from the target.
  const overtime =
    phase === 'running' && targetSec != null && elapsedMs >= targetSec * 1000;
  const overtimeMs = overtime ? elapsedMs - (targetSec ?? 0) * 1000 : 0;

  // The tick of each lead-in number (Get ready, or the hold's last seconds).
  const tick = () => {
    playIntervalCue('countdown');
    fireSelectionHaptic();
  };
  useCountdownCue({
    active: gettingReady,
    remainingMs: getReadyLeftMs,
    seconds: beepSeconds > 0 ? GET_READY_SECONDS : 0,
    onTick: tick,
  });
  useCountdownCue({
    active: phase === 'running' && targetSec != null && !overtime,
    remainingMs: runningLeftMs,
    seconds: beepSeconds,
    onTick: tick,
  });

  const readyNumber = Math.max(1, Math.ceil(getReadyLeftMs / 1000));
  const bigText = gettingReady
    ? formatDurationSeconds(targetSec ?? 0)
    : overtime
      ? `+${formatRestCountdown(Math.floor(overtimeMs / 1000) * 1000)}`
      : targetSec != null
        ? formatDurationSeconds(Math.ceil(runningLeftMs / 1000))
        : formatRestCountdown(Math.floor(elapsedMs / 1000) * 1000);
  const progress = gettingReady
    ? 1
    : overtime
      ? 1
      : targetSec != null
        ? runningLeftMs / (targetSec * 1000)
        : (elapsedMs % 60000) / 60000;

  const phaseLabel = gettingReady
    ? t('activeWorkout.focus.hold.getReady', { defaultValue: 'Get ready' })
    : t('activeWorkout.focus.hold.holding', { defaultValue: 'Holding' });

  return (
    <View
      testID="focus-hold-panel"
      className="my-1 items-center gap-3 rounded-[20px] p-2.5"
      style={{
        backgroundColor: withAlpha(holdColor, 0.1),
        borderWidth: 2,
        borderColor: holdColor,
      }}
    >
      <View className="w-full flex-row items-center justify-between">
        <Text
          className="text-[17px] font-bold"
          style={{ color: holdColor }}
          accessibilityRole="header"
        >
          {`${setLabel} · ${phaseLabel}`}
        </Text>
        {targetSec != null && (
          <Text
            className="text-[14px] text-text-secondary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {t('activeWorkout.focus.hold.plan', {
              defaultValue: 'Plan {{time}}',
              time: formatDurationSeconds(targetSec),
            })}
          </Text>
        )}
      </View>
      <Pressable
        onPress={hold.tap}
        accessibilityRole="button"
        accessibilityLabel={
          gettingReady
            ? t('activeWorkout.focus.hold.startNow', {
                defaultValue: 'Start the hold now',
              })
            : t('activeWorkout.focus.hold.end', {
                defaultValue: 'End the hold and log the set',
              })
        }
      >
        <FocusTimerRing
          size={RING_SIZE}
          strokeWidth={22}
          progress={progress}
          color={holdColor}
          trackColor={withAlpha(holdColor, 0.22)}
        >
          <Text
            testID="focus-hold-time"
            className={
              bigText.length >= 5
                ? 'text-[54px] font-bold'
                : 'text-[64px] font-bold'
            }
            style={{
              color: holdColor,
              fontVariant: ['tabular-nums'],
              lineHeight: 72,
            }}
          >
            {bigText}
          </Text>
          <Text className="text-[16px] text-text-secondary">
            {gettingReady
              ? t('activeWorkout.focus.hold.startsIn', {
                  defaultValue: 'starts in {{number}}',
                  number: readyNumber,
                })
              : overtime
                ? t('activeWorkout.focus.hold.over', { defaultValue: 'over' })
                : targetSec != null
                  ? t('activeWorkout.focus.hold.left', {
                      defaultValue: 'left',
                    })
                  : t('activeWorkout.focus.hold.held', {
                      defaultValue: 'held',
                    })}
          </Text>
          {heartRate != null && !gettingReady && heartRate}
        </FocusTimerRing>
      </Pressable>
      <Pressable
        testID="focus-hold-end"
        onPress={hold.tap}
        accessibilityRole="button"
        className="h-14 w-full items-center justify-center rounded-full active:opacity-80"
        style={{ backgroundColor: holdColor }}
      >
        <Text className="text-[20px] font-bold" style={{ color: onHold }}>
          {gettingReady
            ? t('activeWorkout.focus.hold.startNowButton', {
                defaultValue: 'Start now',
              })
            : t('activeWorkout.focus.hold.endButton', {
                defaultValue: 'End hold',
              })}
        </Text>
      </Pressable>
      {gettingReady ? (
        <View
          testID="focus-hold-get-ready"
          className="w-full flex-row items-center gap-3 rounded-[20px] bg-raised p-3"
        >
          <Text
            className="text-xs font-bold uppercase text-text-secondary"
            style={{ letterSpacing: 1 }}
          >
            {t('activeWorkout.focus.hold.getReady', {
              defaultValue: 'Get ready',
            })}
          </Text>
          <View className="flex-1 flex-row items-center justify-center gap-5">
            {Array.from({ length: GET_READY_SECONDS }, (_, i) => {
              const n = GET_READY_SECONDS - i;
              const current = n === readyNumber;
              return (
                <View
                  key={n}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: current ? holdColor : 'transparent',
                  }}
                >
                  <Text
                    className="text-xl font-bold"
                    style={{ color: current ? onHold : textMuted }}
                  >
                    {n}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      <Text className="px-2 text-center text-[14px] text-text-secondary">
        {gettingReady
          ? t('activeWorkout.focus.hold.tapToStart', {
              defaultValue: 'Tap the ring to start now.',
            })
          : overtime
            ? t('activeWorkout.focus.hold.tapToEndOver', {
                defaultValue:
                  'Past the plan. Tap the ring when you are done to log the set.',
              })
            : targetSec != null
              ? t('activeWorkout.focus.hold.tapToEnd', {
                  defaultValue:
                    'Tap the ring to end. At 0 it keeps going until you tap.',
                })
              : t('activeWorkout.focus.hold.tapToStop', {
                  defaultValue: 'Tap the ring to stop and log the set.',
                })}
      </Text>
    </View>
  );
}

export default React.memo(FocusHoldPanel);
