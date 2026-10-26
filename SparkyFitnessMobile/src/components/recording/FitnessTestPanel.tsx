import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { programIdForFiveK } from '@workspace/shared';
import Button from '../ui/Button';
import FitnessRetestPrompt from './FitnessRetestPrompt';
import ProgramActionRow from './ProgramActionRow';
import { programName } from './RunProgramCard';
import { useFitnessTests } from '../../services/fitnessTestService';
import { formatClock } from '../../utils/gpsRecording';
import {
  fitnessTestName,
  fitnessTestResultText,
  paceText,
} from '../../utils/fitnessTest';
import { formatDayLabel } from '../../utils/dayLabel';

export interface FitnessTestPanelProps {
  today: string;
  unit: 'km' | 'miles';
  onOpenTests: () => void;
  onStartProgram: (programId: string) => void;
  onPlanRace: () => void;
  /** With no test yet, show one short row instead of the full invitation. */
  compact?: boolean;
}

/**
 * The top of the training programs screen: the latest fitness test and the
 * paces it set, a way to start a program or a race plan from it, and the
 * retest offer when it is six weeks old. With no test it invites one.
 */
const FitnessTestPanel: React.FC<FitnessTestPanelProps> = ({
  today,
  unit,
  onOpenTests,
  onStartProgram,
  onPlanRace,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { latest, loaded } = useFitnessTests();
  if (!loaded) return null;

  if (!latest && compact) {
    return (
      <View
        className="bg-surface rounded-xl px-4 mb-4"
        testID="fitness-test-panel-empty"
      >
        <ProgramActionRow
          label={t('fitnessTest.panel.emptyTitle', {
            defaultValue: 'Find your training paces',
          })}
          hint={t('fitnessTest.panel.compactHint', {
            defaultValue: 'Take a guided fitness test',
          })}
          onPress={onOpenTests}
          testID="fitness-test-take"
        />
      </View>
    );
  }

  if (!latest) {
    return (
      <View
        className="bg-surface rounded-xl p-4 mb-4"
        testID="fitness-test-panel-empty"
      >
        <Text className="text-text-primary text-base font-semibold">
          {t('fitnessTest.panel.emptyTitle', {
            defaultValue: 'Find your training paces',
          })}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.panel.emptyBody', {
            defaultValue:
              'Run a guided fitness test: a 5K time trial, a 30-minute all-out run or a 12-minute Cooper test. The result sets your training paces and can start a plan.',
          })}
        </Text>
        <View className="mt-3">
          <Button
            variant="secondary"
            onPress={onOpenTests}
            testID="fitness-test-take"
          >
            {t('fitnessTest.panel.take', {
              defaultValue: 'Take a fitness test',
            })}
          </Button>
        </View>
      </View>
    );
  }

  const suggestedId = programIdForFiveK(latest.paces.equivalent5kSeconds);
  return (
    <View className="mb-4" testID="fitness-test-panel">
      <FitnessRetestPrompt today={today} onRetest={onOpenTests} />
      <View className="bg-surface rounded-xl p-4">
        <Text className="text-text-primary text-base font-semibold">
          {t('fitnessTest.panel.title', { defaultValue: 'Your fitness test' })}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {t('fitnessTest.panel.latest', {
            test: fitnessTestName(t, latest.test_type),
            result: fitnessTestResultText(t, latest, unit),
            date: formatDayLabel(latest.test_date, 'long'),
            defaultValue: '{{test}} on {{date}}: {{result}}',
          })}
        </Text>
        <Text className="text-text-muted text-xs mt-1">
          {t('fitnessTest.panel.paces', {
            pace: paceText(t, latest.paces.thresholdSecondsPerKm, unit),
            time: formatClock(latest.paces.equivalent5kSeconds),
            defaultValue:
              'Threshold pace {{pace}}, about {{time}} for 5K. Your training paces follow this test.',
          })}
        </Text>
        <View className="mt-3">
          <Button
            variant="primary"
            onPress={() => onStartProgram(suggestedId)}
            testID="fitness-test-start-program"
          >
            {t('fitnessTest.panel.startProgram', {
              program: programName(t, suggestedId),
              defaultValue: 'Start {{program}} from my test',
            })}
          </Button>
        </View>
        <View className="flex-row mt-2">
          <View className="flex-1 mr-2">
            <Button
              variant="outline"
              onPress={onPlanRace}
              testID="fitness-test-plan-race"
            >
              {t('fitnessTest.panel.planRace', {
                defaultValue: 'Plan a race',
              })}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant="outline"
              onPress={onOpenTests}
              testID="fitness-test-open"
            >
              {t('fitnessTest.panel.open', { defaultValue: 'Tests and paces' })}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
};

export default FitnessTestPanel;
