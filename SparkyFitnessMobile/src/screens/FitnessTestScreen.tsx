import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FITNESS_TEST_TYPES,
  paceZone,
  type FitnessTestType,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useFitnessTests } from '../services/fitnessTestService';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDayLabel } from '../utils/dayLabel';
import {
  fitnessTestName,
  fitnessTestResultText,
  fitnessTestSurfaceName,
  fitnessTestSurfaceText,
  paceRangeText,
  paceText,
} from '../utils/fitnessTest';

type Props = RootStackScreenProps<'FitnessTest'>;

/** Tests listed in the history; older ones stay on the server. */
const HISTORY_LIMIT = 10;

function describe(
  t: ReturnType<typeof useTranslation>['t'],
  type: FitnessTestType
): string {
  switch (type) {
    case '5k':
      return t('fitnessTest.describe.5k', {
        defaultValue:
          'Run 5 km as fast as you can hold evenly. Your time sets your paces.',
      });
    case '30min':
      return t('fitnessTest.describe.30min', {
        defaultValue:
          'Run 30 minutes all-out. Your threshold pace is the average pace of the last 20 minutes.',
      });
    default:
      return t('fitnessTest.describe.cooper', {
        defaultValue:
          'Cover as far as you can in 12 minutes. Your distance is turned into a 5K time.',
      });
  }
}

/**
 * Fitness tests: pick a guided running test, and see the history of tests with
 * the result and the training paces each one gave.
 */
const FitnessTestScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const unit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { tests, latest, refetch } = useFitnessTests();
  useRefetchOnFocus(refetch, true);

  const header = useScreenHeader({
    title: t('screens.fitnessTest', { defaultValue: 'Fitness tests' }),
    left: { kind: 'back' },
  });

  // A retest starts on the surface the last test was run on.
  const start = (type: FitnessTestType) =>
    navigation.navigate(
      'RecordActivity',
      latest
        ? { fitnessTest: type, indoor: latest.surface === 'indoor' }
        : { fitnessTest: type }
    );

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
        <Text className="text-text-secondary text-sm">
          {t('fitnessTest.intro', {
            defaultValue:
              'A fitness test is one hard, measured run. It is recorded with your phone’s GPS, and the result sets your training paces for easy runs, tempo, intervals and race plans.',
          })}
        </Text>

        {latest ? (
          <Text
            className="text-text-muted text-xs mt-3"
            testID="fitness-test-last-surface"
          >
            {t('fitnessTest.lastSurface', {
              surface: fitnessTestSurfaceName(t, latest.surface),
              defaultValue:
                'Your last test was on: {{surface}}. A new test starts on the same, and you can change it before you start.',
            })}
          </Text>
        ) : null}

        {FITNESS_TEST_TYPES.map((type) => (
          <View
            key={type}
            className="bg-surface rounded-xl p-4 mt-4"
            testID={`fitness-test-${type}`}
          >
            <Text className="text-text-primary text-base font-semibold">
              {fitnessTestName(t, type)}
            </Text>
            <Text className="text-text-secondary text-sm mt-1">
              {describe(t, type)}
            </Text>
            <View className="mt-3">
              <Button
                variant="outline"
                onPress={() => start(type)}
                testID={`fitness-test-start-${type}`}
              >
                {t('fitnessTest.choose', { defaultValue: 'Start this test' })}
              </Button>
            </View>
          </View>
        ))}

        <Text className="text-text-primary text-base font-semibold mt-6">
          {t('fitnessTest.history.title', { defaultValue: 'Your tests' })}
        </Text>
        {tests.length === 0 ? (
          <Text
            className="text-text-secondary text-sm mt-1"
            testID="fitness-test-history-empty"
          >
            {t('fitnessTest.history.empty', {
              defaultValue:
                'No tests yet. Your results and the paces they gave will be listed here.',
            })}
          </Text>
        ) : (
          tests.slice(0, HISTORY_LIMIT).map((test) => {
            const easy = paceZone(test.paces.zones, 'easy');
            return (
              <Pressable
                key={test.id}
                onPress={() =>
                  navigation.navigate('FitnessTestResult', { id: test.id })
                }
                accessibilityRole="button"
                className="bg-surface rounded-xl p-4 mt-3"
                testID={`fitness-test-row-${test.id}`}
              >
                <Text className="text-text-muted text-xs">
                  {t('fitnessTest.history.rowTitle', {
                    date: formatDayLabel(test.test_date, 'long'),
                    test: fitnessTestName(t, test.test_type),
                    defaultValue: '{{date}} · {{test}}',
                  })}
                </Text>
                <Text className="text-text-primary text-base font-semibold mt-0.5">
                  {fitnessTestResultText(t, test, unit)}
                </Text>
                <Text
                  className="text-text-muted text-xs mt-0.5"
                  testID={`fitness-test-surface-${test.id}`}
                >
                  {fitnessTestSurfaceText(t, test)}
                </Text>
                <Text className="text-text-secondary text-xs mt-1">
                  {t('fitnessTest.history.paces', {
                    threshold: paceText(
                      t,
                      test.paces.thresholdSecondsPerKm,
                      unit
                    ),
                    easy: easy
                      ? paceRangeText(
                          t,
                          easy.minSecondsPerKm,
                          easy.maxSecondsPerKm,
                          unit
                        )
                      : '',
                    defaultValue: 'Threshold {{threshold}} · Easy {{easy}}',
                  })}
                </Text>
              </Pressable>
            );
          })
        )}
        {tests.length > HISTORY_LIMIT ? (
          <Text className="text-text-muted text-xs mt-2">
            {t('fitnessTest.history.limit', {
              limit: HISTORY_LIMIT,
              defaultValue: 'Showing your latest {{limit}} tests.',
            })}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
};

export default FitnessTestScreen;
