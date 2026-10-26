import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';
import { useFitnessTests } from '../../services/fitnessTestService';
import {
  fitnessTestName,
  fitnessTestResultText,
  fitnessTestSurfaceText,
} from '../../utils/fitnessTest';

/**
 * Says that a logged activity was a fitness test, and its result ("5K time
 * trial · 5K in 25:00"). Renders nothing for any other activity.
 */
const FitnessTestBadge: React.FC<{
  entryId: string | undefined;
  unit: 'km' | 'miles';
}> = ({ entryId, unit }) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const { tests } = useFitnessTests(Boolean(entryId));
  const test = entryId
    ? tests.find((candidate) => candidate.exercise_entry_id === entryId)
    : undefined;
  if (!test) return null;
  return (
    <View
      className="bg-surface rounded-xl px-4 py-3 mb-4 shadow-sm flex-row items-center gap-2"
      testID="fitness-test-badge"
    >
      <Icon name="timer" size={16} color={accent || '#3B82F6'} />
      <View className="flex-1">
        <Text className="text-xs font-semibold text-text-secondary">
          {t('fitnessTest.badge.title', { defaultValue: 'Fitness test' })}
        </Text>
        <Text className="text-sm text-text-primary" numberOfLines={2}>
          {t('fitnessTest.badge.line', {
            test: fitnessTestName(t, test.test_type),
            result: fitnessTestResultText(t, test, unit),
            defaultValue: '{{test}}: {{result}}',
          })}
          {test.surface === 'indoor'
            ? ` · ${fitnessTestSurfaceText(t, test)}`
            : ''}
        </Text>
      </View>
    </View>
  );
};

export default FitnessTestBadge;
