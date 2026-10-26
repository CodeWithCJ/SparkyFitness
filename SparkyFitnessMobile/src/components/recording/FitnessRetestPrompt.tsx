import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { retestStatus, weeksSinceTest } from '@workspace/shared';
import Button from '../ui/Button';
import { useFitnessTests } from '../../services/fitnessTestService';
import { formatLocalizedNumber } from '../../localization';

// Latest tests the person said "Later" to, kept for the life of the app so the
// prompt does not come back every time the screen re-renders.
const dismissed = new Set<string>();

export interface FitnessRetestPromptProps {
  /** Today, YYYY-MM-DD. */
  today: string;
  onRetest: () => void;
  /** Let the person dismiss it for now; the Diary's card does, the programs screen's does not. */
  dismissible?: boolean;
}

/**
 * Offers a retest once the latest fitness test is six weeks old or more, so
 * the training paces keep up with fitness. Renders nothing before then, or
 * for a person who has not run a test.
 */
const FitnessRetestPrompt: React.FC<FitnessRetestPromptProps> = ({
  today,
  onRetest,
  dismissible = false,
}) => {
  const { t } = useTranslation();
  const { latest } = useFitnessTests();
  const [, setVersion] = useState(0);
  if (!latest) return null;
  const status = retestStatus(latest.test_date, today);
  if (status === 'recent') return null;
  if (dismissible && dismissed.has(latest.id)) return null;
  const weeks = weeksSinceTest(latest.test_date, today);

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
      testID="fitness-retest-prompt"
    >
      <Text className="text-text-primary text-sm font-semibold">
        {status === 'due'
          ? t('fitnessTest.retest.dueTitle', {
              defaultValue: 'Time for a retest',
            })
          : t('fitnessTest.retest.overdueTitle', {
              defaultValue: 'Your paces may be out of date',
            })}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {t('fitnessTest.retest.body', {
          count: weeks,
          formattedCount: formatLocalizedNumber(weeks),
          defaultValue_one:
            'Your last fitness test was {{formattedCount}} week ago. A retest updates your training paces and shows how your fitness has changed.',
          defaultValue_other:
            'Your last fitness test was {{formattedCount}} weeks ago. A retest updates your training paces and shows how your fitness has changed.',
          defaultValue:
            'Your last fitness test was {{formattedCount}} weeks ago. A retest updates your training paces and shows how your fitness has changed.',
        })}
      </Text>
      <Text
        className="text-text-secondary text-xs mt-1"
        testID="fitness-retest-surface"
      >
        {latest.surface === 'indoor'
          ? t('fitnessTest.retest.sameTreadmill', {
              defaultValue:
                'You tested on a treadmill last time, so the retest starts on a treadmill too.',
            })
          : t('fitnessTest.retest.sameOutdoor', {
              defaultValue:
                'You tested outdoors last time, so the retest starts outdoors too.',
            })}
      </Text>
      <View className="flex-row mt-3">
        <View className="flex-1 mr-2">
          <Button
            variant="primary"
            onPress={onRetest}
            testID="fitness-retest-start"
          >
            {t('fitnessTest.retest.action', { defaultValue: 'Retest' })}
          </Button>
        </View>
        {dismissible ? (
          <View className="flex-1">
            <Button
              variant="ghost"
              onPress={() => {
                dismissed.add(latest.id);
                setVersion((v) => v + 1);
              }}
              testID="fitness-retest-later"
            >
              {t('fitnessTest.retest.later', { defaultValue: 'Later' })}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default FitnessRetestPrompt;
