import { useTranslation } from 'react-i18next';
import {
  addDays,
  type CompareQuestion,
  type CompareResponse,
  type CompareSpan,
  timingOf,
  todayInZone,
} from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { verdictCopy } from './compareCopy';

interface CompareAnswerCardProps {
  response: CompareResponse;
  question: CompareQuestion;
  span: CompareSpan;
}

export const CompareAnswerCard = ({
  response,
  question,
  span,
}: CompareAnswerCardProps) => {
  const { t } = useTranslation();
  const { timezone, formatDateInUserTimezone } = usePreferences();
  const { headline, detail } = verdictCopy(response, question, span, t);

  const today = todayInZone(timezone);
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
            date: formatDateInUserTimezone(response.through, 'PP'),
          });

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-2xl font-bold">{headline}</h2>
        <p className="mt-2 text-base text-muted-foreground">{detail}</p>
        <p className="mt-3 text-xs text-muted-foreground">{through}</p>
      </CardContent>
    </Card>
  );
};
