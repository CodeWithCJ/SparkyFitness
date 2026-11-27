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
import { formatRestCountdown } from '../utils/workoutSession';

const RING_SIZE = 208;
/** Inside a superset's round card the timer is smaller. */
const COMPACT_RING_SIZE = 120;

interface FocusHoldPanelProps {
  hold: Pick<
    FocusHold,
    'phase' | 'targetSec' | 'startedAt' | 'getReadyEndsAt' | 'tap' | 'cancel'
  >;
  /** "Set 2", shown with the phase above the ring. */
  setLabel: string;
  /** The live heart-rate readout, when the watch sends one. */
  heartRate?: React.ReactNode;
  /** A smaller timer without its own frame, for a superset's round card. */
  compact?: boolean;
}

/**
 * The focus view's timed hold, a card in the set table where the held set
 * sits (the exercise header and the other sets stay around it): a big ring counting the planned length down (or
 * a stopwatch with no plan), a 3-2-1 Get ready first when the watch's
 * "Countdown before holds" is on, and the live heart rate under the time. Tap
 * the ring to start now or to end. At zero the hold cues and keeps counting up
 * ("+0:07") until the tap, which logs the time actually held.
 */
function FocusHoldPanel({
  hold,
  setLabel,
  heartRate,
  compact = false,
}: FocusHoldPanelProps) {
  const { t } = useTranslation();
  const now = useClockTick(true);
  const beepSeconds = useCountdownSeconds();
  const [holdColor, onHold, holdText] = useCSSVariable([
    '--color-hold',
    '--color-on-hold',
    '--color-hold-text',
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
  const heldSec = Math.floor(elapsedMs / 1000);
  const bigText = gettingReady
    ? String(readyNumber)
    : overtime
      ? `+${formatRestCountdown(Math.floor(overtimeMs / 1000) * 1000)}`
      : targetSec != null
        ? formatRestCountdown(runningLeftMs)
        : formatRestCountdown(heldSec * 1000);
  const progress = gettingReady
    ? getReadyLeftMs / (GET_READY_SECONDS * 1000)
    : overtime
      ? 1
      : targetSec != null
        ? runningLeftMs / (targetSec * 1000)
        : (elapsedMs % 60000) / 60000;

  const phaseLabel = gettingReady
    ? t('activeWorkout.focus.hold.getReady', { defaultValue: 'Get ready' })
    : overtime
      ? t('activeWorkout.focus.hold.pastPlan', {
          defaultValue: 'Past the plan',
        })
      : t('activeWorkout.focus.hold.holding', { defaultValue: 'Holding' });

  return (
    <View
      testID="focus-hold-panel"
      className={
        compact
          ? 'items-center gap-2'
          : 'mb-0.5 items-center gap-2.5 rounded-[20px] p-2'
      }
      style={
        compact
          ? undefined
          : {
              backgroundColor: withAlpha(holdColor, 0.1),
              borderWidth: 2,
              borderColor: holdColor,
            }
      }
    >
      <View className="w-full flex-row items-center justify-between">
        <Text
          className="text-[17px] font-bold"
          style={{ color: holdText }}
          accessibilityRole="header"
        >
          {`${setLabel} · ${phaseLabel}`}
        </Text>
        {targetSec != null && (
          <Text
            className="text-[14px] text-text-secondary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {overtime
              ? t('activeWorkout.focus.hold.cap', {
                  defaultValue: 'Cap {{time}}',
                  time: formatRestCountdown(targetSec * 2000),
                })
              : t('activeWorkout.focus.hold.plan', {
                  defaultValue: 'Plan {{time}}',
                  time: formatRestCountdown(targetSec * 1000),
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
          size={compact ? COMPACT_RING_SIZE : RING_SIZE}
          strokeWidth={compact ? 10 : 14}
          progress={progress}
          color={holdColor}
          trackColor={withAlpha(holdColor, 0.22)}
        >
          <Text
            testID="focus-hold-time"
            className={
              compact
                ? bigText.length >= 5
                  ? 'text-[30px] font-bold'
                  : 'text-[38px] font-bold'
                : bigText.length >= 5
                  ? 'text-[54px] font-bold'
                  : 'text-[64px] font-bold'
            }
            style={{
              color: holdText,
              fontVariant: ['tabular-nums'],
              lineHeight: compact ? 44 : 72,
            }}
          >
            {bigText}
          </Text>
          <Text
            className={
              compact
                ? 'text-[13px] text-text-secondary'
                : 'text-[16px] text-text-secondary'
            }
          >
            {gettingReady
              ? t('activeWorkout.focus.hold.startsInShort', {
                  defaultValue: 'starts in',
                })
              : overtime
                ? t('activeWorkout.focus.hold.overPlan', {
                    defaultValue: 'over plan',
                  })
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
        <View className="flex-row items-baseline gap-3">
          <Text className="text-[20px] font-bold" style={{ color: onHold }}>
            {gettingReady
              ? t('activeWorkout.focus.hold.startNowButton', {
                  defaultValue: 'Start now',
                })
              : t('activeWorkout.focus.hold.endButton', {
                  defaultValue: 'End hold',
                })}
          </Text>
          {overtime && (
            <Text
              testID="focus-hold-logs"
              className="text-[15px] font-semibold"
              style={{ color: onHold, fontVariant: ['tabular-nums'] }}
            >
              {t('activeWorkout.focus.hold.logs', {
                defaultValue: 'logs {{time}}',
                time: formatRestCountdown(heldSec * 1000),
              })}
            </Text>
          )}
        </View>
      </Pressable>
      {gettingReady && (
        <Pressable
          testID="focus-hold-cancel"
          onPress={hold.cancel}
          accessibilityRole="button"
          className="h-12 w-full items-center justify-center rounded-full bg-control active:opacity-80"
        >
          <Text className="text-[17px] font-semibold text-text-primary">
            {t('activeWorkout.focus.hold.cancel', { defaultValue: 'Cancel' })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(FocusHoldPanel);
