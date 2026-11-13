import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sentenceText } from '../../utils/compareCopy';
import { sinceSentence } from '../../utils/compareSinceCopy';
import { SUGGESTED_QUESTIONS, type CompareQuestion } from '@workspace/shared';

interface CompareStartStateProps {
  recent: readonly CompareQuestion[];
  onPick: (question: CompareQuestion) => void;
}

const CompareStartState: React.FC<CompareStartStateProps> = ({
  recent,
  onPick,
}) => {
  const { t } = useTranslation();

  const renderRows = (questions: readonly CompareQuestion[], prefix: string) =>
    questions.map((q) => (
      <TouchableOpacity
        key={`${prefix}-${q.a}-${q.b}-${q.choice}`}
        testID={`${prefix}-${q.a}-${q.b}-${q.choice}`}
        className="bg-surface rounded-lg px-4 py-3 mb-2"
        activeOpacity={0.7}
        accessibilityRole="button"
        onPress={() => onPick(q)}
      >
        <Text className="text-base text-text-primary">
          {q.choice === 'sinceHabit' ? sinceSentence(q, t) : sentenceText(q, t)}
        </Text>
      </TouchableOpacity>
    ));

  return (
    <View>
      <Text className="text-text-secondary text-sm font-semibold mb-2">
        {t('compareReport.start.suggestions', {
          defaultValue: 'Try one of these',
        })}
      </Text>
      {renderRows(SUGGESTED_QUESTIONS, 'compare-suggestion')}
      {recent.length > 0 ? (
        <>
          <Text className="text-text-secondary text-sm font-semibold mt-4 mb-2">
            {t('compareReport.start.recent', {
              defaultValue: 'Your recent questions',
            })}
          </Text>
          {renderRows(recent, 'compare-recent')}
        </>
      ) : null}
    </View>
  );
};

export default CompareStartState;
