import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatClock } from '../../utils/gpsRecording';
import {
  intervalStepName,
  stepDistanceText,
  stepLengthText,
} from '../../utils/recordingCues';
import type { IntervalPlan, IntervalPosition } from '@workspace/shared';
import { stepHeartRateGuidance } from '../../utils/stepHeartRateGuidance';

interface Props {
  plan: IntervalPlan;
  position: IntervalPosition;
  /** The live heart rate from the watch, or null when there is none. */
  heartRate?: number | null;
  /** Whether a watch is paired to supply readings; without one a Zone 2 step is run by the talk test. */
  heartRateSource?: boolean;
}

/** The step in progress: what to do, time or distance left, and what comes next. */
const IntervalCard: React.FC<Props> = ({
  plan,
  position,
  heartRate = null,
  heartRateSource = false,
}) => {
  const { t } = useTranslation();
  const { step, next } = position;
  const fraction = position.done ? 1 : position.fraction;
  const left =
    position.remainingMeters !== null
      ? stepDistanceText(t, position.remainingMeters, step.unit)
      : formatClock(Math.ceil(position.remaining));
  const name = position.done
    ? t('recordActivity.intervals.complete', {
        defaultValue: 'Intervals complete',
      })
    : intervalStepName(t, step.kind, plan.style, step.effort);
  const guidance = position.done
    ? null
    : stepHeartRateGuidance(
        step,
        heartRate,
        Math.max(0, step.seconds - position.remaining),
        heartRateSource
      );
  const targetText = guidance?.band
    ? step.effort === 'zone2'
      ? t('recordActivity.zone2.target', {
          min: guidance.band.minBpm,
          max: guidance.band.maxBpm,
          defaultValue: 'Zone 2: {{min}}–{{max}} bpm',
        })
      : `${guidance.band.minBpm}–${guidance.band.maxBpm} ${t(
          'recordActivity.unitBpm',
          { defaultValue: 'bpm' }
        )}`
    : null;
  // Only a Zone 2 step speaks of Zone 2; other stretches show their range and
  // leave the alerts to the buzz and voice cue.
  const cueText =
    !guidance || step.effort !== 'zone2'
      ? null
      : guidance.kind === 'talkTest'
        ? t('recordActivity.zone2.talkTest', {
            defaultValue:
              'Zone 2: keep it easy enough to talk in full sentences. If you can only say a few words, slow down.',
          })
        : guidance.kind === 'waiting'
          ? t('recordActivity.zone2.waiting', {
              defaultValue: 'Waiting for a heart rate reading…',
            })
          : guidance.kind === 'above'
            ? t('recordActivity.zone2.above', {
                defaultValue:
                  'Above Zone 2. Ease off, or walk until your heart rate settles.',
              })
            : guidance.kind === 'below'
              ? t('recordActivity.zone2.below', {
                  defaultValue: 'Below Zone 2. You can pick it up a little.',
                })
              : t('recordActivity.zone2.inside', {
                  defaultValue: 'In Zone 2. Keep this effort.',
                });
  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4"
      accessibilityRole="timer"
      accessibilityLabel={position.done ? name : `${name} ${left}`}
    >
      <View className="flex-row items-baseline justify-between">
        <Text className="text-text-primary text-2xl font-bold">{name}</Text>
        {position.done ? null : (
          <Text className="text-text-primary text-2xl font-bold">{left}</Text>
        )}
      </View>
      {targetText ? (
        <Text className="text-text-secondary text-sm mt-1">{targetText}</Text>
      ) : null}
      {cueText ? (
        <Text
          className={`text-sm mt-1 ${
            guidance?.kind === 'above' || guidance?.kind === 'below'
              ? 'text-text-warning font-semibold'
              : 'text-text-muted'
          }`}
          accessibilityLiveRegion="polite"
        >
          {cueText}
        </Text>
      ) : null}
      <View className="h-2 rounded-full bg-raised mt-3 overflow-hidden">
        <View
          className="h-2 rounded-full bg-accent-primary"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </View>
      <View className="flex-row justify-between mt-2">
        <Text className="text-text-muted text-xs">
          {step.kind === 'work' || step.kind === 'recovery'
            ? t('recordActivity.intervals.round', {
                round: position.round,
                rounds: position.rounds,
                defaultValue: 'Round {{round}} of {{rounds}}',
              })
            : ''}
        </Text>
        {next && !position.done ? (
          <Text className="text-text-muted text-xs">
            {t('recordActivity.intervals.next', {
              name: intervalStepName(t, next.kind, plan.style, next.effort),
              time: stepLengthText(t, next),
              defaultValue: 'Next: {{name}} {{time}}',
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default IntervalCard;
