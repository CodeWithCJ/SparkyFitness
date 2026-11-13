import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FitnessTestType } from '@workspace/shared';
import Button from '../ui/Button';
import RecordingSwitchRow from './RecordingSwitchRow';
import SegmentedControl from '../SegmentedControl';
import { fitnessTestName } from '../../utils/fitnessTest';

/** What the test is and how to run it, as a short list. */
export function fitnessTestSteps(
  t: ReturnType<typeof useTranslation>['t'],
  type: FitnessTestType
): string[] {
  const warmUp = t('fitnessTest.steps.warmUp', {
    defaultValue:
      'Warm up with 10 to 15 minutes of easy running, then come back here and start.',
  });
  const flat = t('fitnessTest.steps.flat', {
    defaultValue:
      'Pick a flat, open route and keep your phone with you. Pauses are not counted.',
  });
  switch (type) {
    case '5k':
      return [
        warmUp,
        flat,
        t('fitnessTest.steps.5k', {
          defaultValue:
            'Run 5 km as fast as you can hold evenly. Your time to 5 km is the result; keep going to cool down.',
        }),
      ];
    case '30min':
      return [
        warmUp,
        flat,
        t('fitnessTest.steps.30min', {
          defaultValue:
            'Run as hard as you can keep steady for 30 minutes. Your threshold pace is the average pace of the last 20 minutes, so do not start too fast.',
        }),
      ];
    default:
      return [
        warmUp,
        flat,
        t('fitnessTest.steps.cooper', {
          defaultValue:
            'Cover as much distance as you can in 12 minutes. The distance you reach is the result.',
        }),
      ];
  }
}

export interface FitnessTestSetupProps {
  type: FitnessTestType;
  /** Run it on a treadmill (no GPS); false for an outdoor GPS run. */
  indoor: boolean;
  onIndoorChange: (indoor: boolean) => void;
  /** Last test's surface, to say why this one is suggested. */
  suggestedFromLast?: boolean;
  audioCues: boolean;
  onAudioCuesChange: (value: boolean) => void;
  busy: boolean;
  /** Shown when location is refused, so the person knows why Start did nothing. */
  permissionProblem: 'denied' | 'services-disabled' | null;
  onStart: () => void;
  onOpenSettings: () => void;
}

/** The Record screen's before-Start view for a fitness test: guidance, voice cues and Start. */
const FitnessTestSetup: React.FC<FitnessTestSetupProps> = ({
  type,
  indoor,
  onIndoorChange,
  suggestedFromLast = false,
  audioCues,
  onAudioCuesChange,
  busy,
  permissionProblem,
  onStart,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <View className="bg-surface rounded-xl p-4" testID="fitness-test-setup">
        <Text className="text-text-primary text-base font-semibold">
          {fitnessTestName(t, type)}
        </Text>
        {fitnessTestSteps(t, type).map((line) => (
          <Text key={line} className="text-text-secondary text-sm mt-2">
            {line}
          </Text>
        ))}
        <View className="mt-3">
          <SegmentedControl<'outdoor' | 'indoor'>
            segments={[
              {
                key: 'outdoor',
                label: t('fitnessTest.setup.outdoor', {
                  defaultValue: 'Outdoor (GPS)',
                }),
              },
              {
                key: 'indoor',
                label: t('fitnessTest.setup.indoor', {
                  defaultValue: 'Treadmill',
                }),
              },
            ]}
            activeKey={indoor ? 'indoor' : 'outdoor'}
            onSelect={(key) => onIndoorChange(key === 'indoor')}
          />
        </View>
        <Text className="text-text-muted text-xs mt-3">
          {indoor
            ? t('fitnessTest.setup.indoorNote', {
                defaultValue:
                  'On a treadmill nothing is tracked by GPS. The test is timed, and when you finish you enter the distance your treadmill shows and its incline. It is saved as an indoor run and marked as a fitness test.',
              })
            : t('fitnessTest.setup.outdoorNote', {
                defaultValue:
                  'Outdoors the test is recorded with your phone’s GPS, as a run, and marked as a fitness test on the activity.',
              })}
        </Text>
        {suggestedFromLast ? (
          <Text className="text-text-muted text-xs mt-1">
            {t('fitnessTest.setup.sameAsLast', {
              defaultValue: 'Suggested because your last test was the same.',
            })}
          </Text>
        ) : null}
      </View>
      <RecordingSwitchRow
        testID="fitness-test-audio-cues"
        title={t('recordActivity.audioCues.title', {
          defaultValue: 'Voice cues',
        })}
        description={t('fitnessTest.setup.voiceDescription', {
          defaultValue: 'Speaks when the test is complete.',
        })}
        value={audioCues}
        onValueChange={onAudioCuesChange}
      />
      {permissionProblem ? (
        <View className="bg-surface rounded-xl p-4 mt-4">
          <Text className="text-text-primary text-sm mb-3">
            {permissionProblem === 'denied'
              ? t('recordActivity.permission.denied', {
                  defaultValue:
                    'SparkyFitness needs location access to record your route. You can allow it in Settings.',
                })
              : t('recordActivity.permission.servicesOff', {
                  defaultValue:
                    'Location services are turned off. Turn them on in Settings to record.',
                })}
          </Text>
          <Button variant="outline" onPress={onOpenSettings}>
            {t('recordActivity.permission.openSettings', {
              defaultValue: 'Open Settings',
            })}
          </Button>
        </View>
      ) : null}
      <Button
        className="mt-6"
        loading={busy}
        onPress={onStart}
        testID="fitness-test-start"
      >
        {t('fitnessTest.setup.start', { defaultValue: 'Start the test' })}
      </Button>
    </>
  );
};

export default FitnessTestSetup;
