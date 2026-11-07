import React from 'react';
import { Text, View } from 'react-native';
import {
  type CompareQuestion,
  type CompareResponse,
  type CompareSpan,
  timingOf,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import { useAppLocale } from '../../localization/i18n';
import { addDays, formatShortDate, getTodayDate } from '../../utils/dateUtils';

import { statsLine, verdictCopy } from '../../utils/compareCopy';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareAnswerCardProps {
  response: CompareResponse;
  question: CompareQuestion;
  span: CompareSpan;
}

const CompareAnswerCard: React.FC<CompareAnswerCardProps> = ({
  response,
  question,
  span,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const locale = useAppLocale();
  const { headline, detail } = verdictCopy(response, question, span, t);
  const { result } = response;
  const yesKey = result.binary?.yesKey;
  const outcome =
    yesKey === undefined
      ? undefined
      : yesKey === question.a
        ? question.b
        : question.a;
  const stats = statsLine(
    result,
    timingOf(question.choice).mode,
    t,
    outcome,
    energyUnit
  );

  const today = getTodayDate();
  const isWeekMode = timingOf(question.choice).mode === 'week';
  // The server stops at the last finished week, so a week-mode end within the
  // last 7 days is the end of last week.
  const endsLastWeek =
    isWeekMode &&
    [1, 2, 3, 4, 5, 6, 7].some((n) => addDays(response.through, n) === today);
  const through =
    response.through === addDays(today, -1)
      ? t('compareReport.answer.throughYesterday', {
          defaultValue: 'Through yesterday',
        })
      : endsLastWeek
        ? t('compareReport.answer.throughLastWeek', {
            defaultValue: 'Through last week',
          })
        : t('compareReport.answer.throughDate', {
            defaultValue: 'Through {{date}}',
            date: formatShortDate(response.through, locale),
          });

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-2xl font-bold">{headline}</Text>
      <Text className="text-text-secondary text-base mt-2">{detail}</Text>
      {stats ? (
        <Text className="text-text-muted text-xs mt-3">{stats}</Text>
      ) : null}
      <Text className="text-text-muted text-xs mt-1">{through}</Text>
    </View>
  );
};

export default CompareAnswerCard;
