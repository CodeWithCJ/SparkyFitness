import React from 'react';
import { Text, View } from 'react-native';
import {
  type CompareMode,
  type CompareQuestion,
  type CompareResult,
  timingOf,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import type { Translator } from '../../constants/reports';
import { metricName } from '../../utils/compareCopy';

interface CompareChecksCardProps {
  result: CompareResult;
  question: CompareQuestion;
  mode: CompareMode;
}

function directionLine(
  result: CompareResult,
  question: CompareQuestion,
  t: Translator
): string | null {
  const direction = result.checks.direction;
  if (!direction) return null;
  if (direction === 'cantTell') {
    return t('compareReport.checks.cantTell', {
      defaultValue: "Can't tell which comes first",
    });
  }
  const { timing } = timingOf(question.choice);
  const a = metricName(question.a, t);
  const b = metricName(question.b, t);
  if (timing === 0) {
    return t('compareReport.checks.seemsFirst', {
      defaultValue: '{{metric}} seems to come first',
      metric: direction === 'firstComesFirst' ? a : b,
    });
  }
  if (direction === 'strongerOtherWay') {
    return t('compareReport.checks.otherWay', {
      defaultValue: 'The link is stronger the other way round',
    });
  }
  return t('compareReport.checks.comesFirst', {
    defaultValue: '{{metric}} comes first',
    metric: timing === -1 ? b : a,
  });
}

const CompareChecksCard: React.FC<CompareChecksCardProps> = ({
  result,
  question,
  mode,
}) => {
  const { t } = useTranslation();
  const lines = [
    t('compareReport.checks.ownNormal', {
      defaultValue: '✓ Compared with your own normal',
    }),
    t('compareReport.checks.notProof', {
      defaultValue: 'A link, not proof of cause',
    }),
  ];

  if (result.linked) {
    const direction = directionLine(result, question, t);
    if (direction) lines.push(direction);
    if (mode === 'day' && result.checks.weekend) {
      lines.push(
        result.checks.weekend === 'holds'
          ? t('compareReport.checks.weekendHolds', {
              defaultValue: 'Still holds after accounting for weekends',
            })
          : t('compareReport.checks.weekendMay', {
              defaultValue: 'This may be a weekday-versus-weekend pattern',
            })
      );
    }
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      {lines.map((line, index) => (
        <Text key={index} className="text-text-secondary text-sm py-1">
          {line}
        </Text>
      ))}
    </View>
  );
};

export default CompareChecksCard;
