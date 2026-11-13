import React from 'react';
import { Text, View } from 'react-native';
import {
  compareDisplayValue,
  type CompareQuestion,
  type CompareResponse,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import {
  compareValueText,
  yesNoDifferenceText,
  yesNoWording,
} from '../../utils/compareCopy';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareBarsProps {
  response: CompareResponse;
  question: CompareQuestion;
}

const CompareBars: React.FC<CompareBarsProps> = ({ response, question }) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const binary = response.result.binary;
  if (!binary) return null;

  const outcome = binary.yesKey === question.a ? question.b : question.a;
  const yesMean = compareDisplayValue(outcome, binary.yesMean, energyUnit);
  const noMean = compareDisplayValue(outcome, binary.noMean, energyUnit);
  const largest = Math.max(Math.abs(yesMean), Math.abs(noMean));
  const widthPercent = (value: number) =>
    largest > 0 ? Math.round((Math.abs(value) / largest) * 100) : 0;

  const wording = yesNoWording(question, binary.yesKey, t);
  const rows = [
    {
      id: 'yes',
      label: wording.yesLabel,
      mean: yesMean,
      text: compareValueText(outcome, binary.yesMean, energyUnit),
      count: binary.yesCount,
    },
    {
      id: 'no',
      label: wording.noLabel,
      mean: noMean,
      text: compareValueText(outcome, binary.noMean, energyUnit),
      count: binary.noCount,
    },
  ];

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      {rows.map((row) => (
        <View key={row.id} className="mb-3">
          <Text className="text-text-secondary text-sm mb-1">{row.label}</Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-3 rounded-full bg-progress-track overflow-hidden"
          >
            <View
              testID={`compare-bar-${row.id}`}
              className="h-3 rounded-full bg-accent-primary"
              style={{ width: `${widthPercent(row.mean)}%` }}
            />
          </View>
          <Text className="text-text-primary text-sm font-semibold mt-1">
            {wording.nights
              ? t('compareReport.bars.meanAndNights', {
                  defaultValue: '{{mean}} · {{count}} nights',
                  mean: row.text,
                  count: row.count,
                })
              : t('compareReport.bars.meanAndDays', {
                  defaultValue: '{{mean}} · {{count}} days',
                  mean: row.text,
                  count: row.count,
                })}
          </Text>
        </View>
      ))}
      <Text className="text-text-muted text-xs">
        {yesNoDifferenceText(question, binary, t, energyUnit)}
      </Text>
    </View>
  );
};

export default CompareBars;
