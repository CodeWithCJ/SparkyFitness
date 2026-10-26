import React from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { comparePaces } from '@workspace/shared';
import Button from '../components/ui/Button';
import FitnessTestPaceList from '../components/recording/FitnessTestPaceList';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import {
  removeFitnessTest,
  useFitnessTests,
} from '../services/fitnessTestService';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDayLabel } from '../utils/dayLabel';
import { formatLocalizedNumber } from '../localization';
import { formatClock } from '../utils/gpsRecording';
import {
  fitnessTestName,
  fitnessTestResultText,
  fitnessTestSurfaceText,
  inclineAdjustmentText,
  paceChangeText,
  paceText,
} from '../utils/fitnessTest';

type Props = RootStackScreenProps<'FitnessTestResult'>;

/**
 * One fitness test: the result, the training paces it set and, when there is
 * an earlier test, how the paces moved since.
 */
const FitnessTestResultScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const unit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { tests, loaded, refetch } = useFitnessTests();
  useRefetchOnFocus(refetch, true);
  const index = tests.findIndex((test) => test.id === route.params.id);
  const test = index >= 0 ? tests[index] : null;
  // The test before this one, which this one's paces are compared with.
  const previous = index >= 0 ? (tests[index + 1] ?? null) : null;
  const change =
    test && previous ? comparePaces(previous.paces, test.paces) : null;
  const adjustment = test ? inclineAdjustmentText(t, test, unit) : null;

  const header = useScreenHeader({
    title: t('screens.fitnessTestResult', { defaultValue: 'Fitness test' }),
    right: {
      kind: 'primary',
      label: t('common.done', { defaultValue: 'Done' }),
      onPress: () => navigation.goBack(),
    },
  });

  const confirmDelete = () => {
    if (!test) return;
    Alert.alert(
      t('fitnessTest.delete.title', { defaultValue: 'Delete this test?' }),
      t('fitnessTest.delete.message', {
        defaultValue:
          'The activity stays in your diary. Your training paces follow your latest remaining test.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('fitnessTest.delete.confirm', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            void removeFitnessTest(test.id)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                addLog(
                  `[Fitness Test] Could not delete the test: ${error}`,
                  'WARNING'
                );
                Toast.show({
                  type: 'error',
                  text1: t('fitnessTest.delete.error', {
                    defaultValue: 'Could not delete the test',
                  }),
                  text2: t('common.tryAgain', {
                    defaultValue: 'Please try again.',
                  }),
                });
              });
          },
        },
      ]
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {!test ? (
          <Text
            className="text-text-secondary text-sm"
            testID="fitness-test-missing"
          >
            {loaded
              ? t('fitnessTest.result.missing', {
                  defaultValue: 'This test is no longer saved.',
                })
              : t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        ) : (
          <>
            <View className="bg-surface rounded-xl p-4" testID="fitness-result">
              <Text className="text-text-muted text-xs">
                {t('fitnessTest.result.when', {
                  date: formatDayLabel(test.test_date, 'long'),
                  test: fitnessTestName(t, test.test_type),
                  defaultValue: '{{date}} · {{test}}',
                })}
              </Text>
              <Text className="text-text-primary text-2xl font-bold mt-1">
                {fitnessTestResultText(t, test, unit)}
              </Text>
              <Text
                className="text-text-secondary text-sm mt-2"
                testID="fitness-result-surface"
              >
                {fitnessTestSurfaceText(t, test)}
              </Text>
              {adjustment && test.incline_percent !== null ? (
                <Text
                  className="text-text-secondary text-sm mt-1"
                  testID="fitness-result-adjustment"
                >
                  {t('fitnessTest.finished.adjusted', {
                    incline: formatLocalizedNumber(test.incline_percent, {
                      maximumFractionDigits: 1,
                    }),
                    raw: adjustment.raw,
                    adjusted: adjustment.adjusted,
                    defaultValue:
                      'Adjusted for {{incline}}% incline: {{raw}} counts as {{adjusted}}.',
                  })}
                </Text>
              ) : null}
              <Text className="text-text-secondary text-sm mt-2">
                {t('fitnessTest.result.derived', {
                  pace: paceText(t, test.paces.thresholdSecondsPerKm, unit),
                  time: formatClock(test.paces.equivalent5kSeconds),
                  defaultValue:
                    'Threshold pace {{pace}}. As a 5K that is about {{time}}.',
                })}
              </Text>
            </View>

            {change && previous ? (
              <View
                className="bg-surface rounded-xl p-4 mt-4"
                testID="fitness-result-change"
              >
                <Text className="text-text-primary text-base font-semibold">
                  {t('fitnessTest.result.changeTitle', {
                    date: formatDayLabel(previous.test_date, 'long'),
                    defaultValue: 'Since your test on {{date}}',
                  })}
                </Text>
                <Text className="text-text-secondary text-sm mt-1">
                  {t('fitnessTest.result.changeThreshold', {
                    change: paceChangeText(
                      t,
                      change.thresholdChangeSeconds,
                      unit
                    ),
                    defaultValue: 'Threshold pace: {{change}}.',
                  })}
                </Text>
              </View>
            ) : null}

            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-base font-semibold">
                {t('fitnessTest.result.pacesTitle', {
                  defaultValue: 'Your training paces',
                })}
              </Text>
              <Text className="text-text-secondary text-xs mt-1 mb-2">
                {t('fitnessTest.result.pacesBody', {
                  defaultValue:
                    'These now set your pace zones and the suggested ranges for plans and races.',
                })}
              </Text>
              <FitnessTestPaceList
                paces={test.paces}
                unit={unit}
                change={change}
              />
            </View>

            <View className="mt-4">
              <Button
                variant="primary"
                onPress={() => navigation.navigate('RunPrograms')}
                testID="fitness-result-plan"
              >
                {t('fitnessTest.result.plan', {
                  defaultValue: 'Start a plan from this test',
                })}
              </Button>
            </View>
            <View className="mt-2">
              <Button
                variant="ghost"
                onPress={confirmDelete}
                testID="fitness-result-delete"
              >
                {t('fitnessTest.delete.action', {
                  defaultValue: 'Delete this test',
                })}
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
};

export default FitnessTestResultScreen;
