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

interface Props {
  plan: IntervalPlan;
  position: IntervalPosition;
}

/** The step in progress: what to do, time or distance left, and what comes next. */
const IntervalCard: React.FC<Props> = ({ plan, position }) => {
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
    : intervalStepName(t, step.kind, plan.style);
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
              name: intervalStepName(t, next.kind, plan.style),
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
