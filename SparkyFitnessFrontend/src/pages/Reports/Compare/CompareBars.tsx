import { useTranslation } from 'react-i18next';
import {
  compareDisplayValue,
  type CompareQuestion,
  type CompareResponse,
} from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { compareValueText, yesNoWording } from './compareCopy';

interface CompareBarsProps {
  response: CompareResponse;
  question: CompareQuestion;
}

export const CompareBars = ({ response, question }: CompareBarsProps) => {
  const { t } = useTranslation();
  const { timeFormat, energyUnit } = usePreferences();
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
      text: compareValueText(outcome, binary.yesMean, timeFormat, energyUnit),
      count: binary.yesCount,
      color: 'bg-[#8884d8]',
    },
    {
      id: 'no',
      label: wording.noLabel,
      mean: noMean,
      text: compareValueText(outcome, binary.noMean, timeFormat, energyUnit),
      count: binary.noCount,
      color: 'bg-muted-foreground/60',
    },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {rows.map((row) => (
          <div key={row.id}>
            <p className="mb-1 text-sm text-muted-foreground">{row.label}</p>
            <div
              aria-hidden="true"
              className="h-4 overflow-hidden rounded-full bg-muted"
            >
              <div
                data-testid={`compare-bar-${row.id}`}
                className={`h-4 rounded-full ${row.color}`}
                style={{ width: `${widthPercent(row.mean)}%` }}
              />
            </div>
            <p className="mt-1 text-sm font-semibold">
              {wording.nights
                ? t('compareReport.bars.meanAndNights', {
                    defaultValue: '{{mean}} · {{count}} nights',
                    defaultValue_one: '{{mean}} · {{count}} night',
                    defaultValue_other: '{{mean}} · {{count}} nights',
                    mean: row.text,
                    count: row.count,
                  })
                : t('compareReport.bars.meanAndDays', {
                    defaultValue: '{{mean}} · {{count}} days',
                    defaultValue_one: '{{mean}} · {{count}} day',
                    defaultValue_other: '{{mean}} · {{count}} days',
                    mean: row.text,
                    count: row.count,
                  })}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
