import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FitnessTestOutcome, FitnessTestType } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { formatClock, METERS_PER_MILE } from '../../utils/gpsRecording';
import {
  fitnessTestName,
  fitnessTestProgress,
  paceText,
} from '../../utils/fitnessTest';

/** The line under the title: what to do right now. */
function guidance(
  t: ReturnType<typeof useTranslation>['t'],
  type: FitnessTestType,
  progress: ReturnType<typeof fitnessTestProgress>,
  unit: 'km' | 'miles',
  indoor: boolean,
  activeSeconds: number
): string {
  if (progress.complete) {
    return t('fitnessTest.live.complete', {
      defaultValue: 'Test complete. Slow down and tap Finish.',
    });
  }
  if (type === '5k' && indoor) {
    return t('fitnessTest.live.5kIndoor', {
      time: formatClock(activeSeconds),
      defaultValue:
        'Run evenly and hard. Tap Finish when your treadmill reaches 5 km. Time {{time}}.',
    });
  }
  if (type === '5k') {
    const meters = progress.remainingMeters ?? 0;
    const remaining =
      unit === 'miles' ? meters / METERS_PER_MILE : meters / 1000;
    const unitLabel =
      unit === 'miles'
        ? t('recordActivity.unitMi', { defaultValue: 'mi' })
        : t('recordActivity.unitKm', { defaultValue: 'km' });
    return t('fitnessTest.live.5k', {
      remaining: formatLocalizedNumber(remaining, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      unit: unitLabel,
      defaultValue:
        'Run evenly and hard. {{remaining}} {{unit}} to go until 5 km.',
    });
  }
  const time = formatClock(progress.remainingSeconds ?? 0);
  if (type === 'cooper') {
    return t('fitnessTest.live.cooper', {
      time,
      defaultValue: 'Cover as much distance as you can. {{time}} left.',
    });
  }
  if (indoor && !progress.inThresholdPhase) {
    return t('fitnessTest.live.30minFirst10Indoor', {
      time: formatClock(
        Math.max(0, (progress.remainingSeconds ?? 0) - 20 * 60)
      ),
      defaultValue:
        'Settle into a hard, steady effort. At 10:00, in {{time}}, note the distance on your treadmill.',
    });
  }
  return progress.inThresholdPhase
    ? t('fitnessTest.live.30minLast20', {
        time,
        defaultValue:
          'Hold this pace: the last 20 minutes set your threshold. {{time}} left.',
      })
    : t('fitnessTest.live.30minFirst10', {
        time: formatClock(
          Math.max(0, (progress.remainingSeconds ?? 0) - 20 * 60)
        ),
        defaultValue:
          'Settle into a hard, steady effort. The last 20 minutes start in {{time}}.',
      });
}

export interface FitnessTestCardProps {
  type: FitnessTestType;
  /** Recording time with pauses removed, seconds. */
  activeSeconds: number;
  distanceMeters: number;
  unit: 'km' | 'miles';
  /** On a treadmill: no GPS distance, so the 5K is ended by the person. */
  indoor?: boolean;
}

/** Live guidance for the test being run: what is left and what to do now. */
const FitnessTestCard: React.FC<FitnessTestCardProps> = ({
  type,
  activeSeconds,
  distanceMeters,
  unit,
  indoor = false,
}) => {
  const { t } = useTranslation();
  const progress = fitnessTestProgress(type, activeSeconds, distanceMeters);
  return (
    <View className="bg-surface rounded-xl p-4 mb-4" testID="fitness-test-card">
      <Text className="text-text-primary text-sm font-semibold">
        {fitnessTestName(t, type)}
      </Text>
      <Text
        className="text-text-secondary text-sm mt-1"
        testID="fitness-test-guidance"
      >
        {guidance(t, type, progress, unit, indoor, activeSeconds)}
      </Text>
      <View
        className="h-2 rounded-full bg-background mt-3 overflow-hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(progress.fraction * 100),
        }}
      >
        <View
          className="h-2 rounded-full bg-accent-primary"
          style={{ width: `${Math.round(progress.fraction * 100)}%` }}
        />
      </View>
    </View>
  );
};

export interface FitnessTestFinishedCardProps {
  type: FitnessTestType;
  /** The result the recording gives, or null when the test was not completed. */
  outcome: FitnessTestOutcome | null;
  unit: 'km' | 'miles';
  /** Treadmill: the incline correction, as what was measured and what it counted as. */
  adjustment?: { incline: string; raw: string; adjusted: string } | null;
  /** Treadmill: what is missing before the test can be saved. */
  problem?: 'tooShort' | 'noDistance' | 'badSplit' | 'badTime' | null;
}

/** After Finish: the result the test will be saved with, or why it will not count. */
export const FitnessTestFinishedCard: React.FC<
  FitnessTestFinishedCardProps
> = ({ type, outcome, unit, adjustment = null, problem = null }) => {
  const { t } = useTranslation();
  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4"
      testID="fitness-test-finished"
    >
      <Text className="text-text-primary text-sm font-semibold">
        {fitnessTestName(t, type)}
      </Text>
      {outcome ? (
        <>
          <Text className="text-text-secondary text-sm mt-1">
            {t('fitnessTest.finished.threshold', {
              pace: paceText(t, outcome.paces.thresholdSecondsPerKm, unit),
              time: formatClock(outcome.paces.equivalent5kSeconds),
              defaultValue:
                'Threshold pace {{pace}}, about {{time}} for 5K. Saving sets your training paces.',
            })}
          </Text>
          {adjustment ? (
            <Text
              className="text-text-secondary text-sm mt-1"
              testID="fitness-test-adjustment"
            >
              {t('fitnessTest.finished.adjusted', {
                incline: adjustment.incline,
                raw: adjustment.raw,
                adjusted: adjustment.adjusted,
                defaultValue:
                  'Adjusted for {{incline}}% incline: {{raw}} counts as {{adjusted}}.',
              })}
            </Text>
          ) : null}
        </>
      ) : problem === 'noDistance' ? (
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.finished.needDistance', {
            defaultValue:
              'Enter the distance your treadmill shows to save the test. Until then it will be saved as an ordinary run.',
          })}
        </Text>
      ) : problem === 'badSplit' ? (
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.finished.badSplit', {
            defaultValue:
              'The distance at 10:00 must be more than zero and less than the total.',
          })}
        </Text>
      ) : problem === 'badTime' ? (
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.finished.badTime', {
            defaultValue:
              'Enter your time to 5 km as minutes and seconds, like 24:30.',
          })}
        </Text>
      ) : (
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.finished.incomplete', {
            defaultValue:
              'The test was stopped before its mark, so it will be saved as an ordinary run and your paces stay as they were.',
          })}
        </Text>
      )}
    </View>
  );
};

export default FitnessTestCard;
