import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  timingOf,
  type CompareQuestion,
  type CompareTimingChoice,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { metricName, timingLabel } from './compareCopy';
import {
  timingBarWidths,
  timingStrengthText,
  type CompareTimingRow,
} from './compareTables';

interface CompareTimingTableProps {
  question: CompareQuestion;
  rows: CompareTimingRow[];
  onPickTiming: (choice: CompareTimingChoice) => void;
}

export const CompareTimingTable = ({
  question,
  rows,
  onPickTiming,
}: CompareTimingTableProps) => {
  const { t, i18n } = useTranslation();
  const widths = timingBarWidths(rows);

  const statusText = (row: CompareTimingRow): string => {
    switch (row.status) {
      case 'error':
        return t('compareReport.timing.loadFailed', {
          defaultValue: "Couldn't load",
        });
      case 'not_enough':
        return timingOf(question.choice).mode === 'week'
          ? t('compareReport.timing.notEnoughWeeks', {
              defaultValue: 'Not enough weeks',
            })
          : t('compareReport.timing.notEnough', {
              defaultValue: 'Not enough days',
            });
      case 'ok':
        return row.linked
          ? t('compareReport.timing.linked', { defaultValue: 'Linked' })
          : t('compareReport.timing.noLink', { defaultValue: 'No clear link' });
      default:
        return '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('compareReport.timing.title', {
            defaultValue: 'Does timing matter?',
          })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, index) => (
          <button
            key={row.choice}
            type="button"
            aria-current={row.isAsked ? 'true' : undefined}
            onClick={() => {
              if (!row.isAsked) onPickTiming(row.choice);
            }}
            className={cn(
              'w-full rounded-md border p-3 text-left transition-colors',
              row.isAsked
                ? 'border-primary bg-primary/5 cursor-default'
                : 'hover:bg-muted/50'
            )}
          >
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {t('compareReport.timing.metricWhen', {
                  defaultValue: '{{metric}} {{timing}}',
                  metric: metricName(question.b, t),
                  timing: timingLabel(row.choice, question.a, question.b, t),
                })}
              </span>
              {row.isAsked && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {t('compareReport.timing.yourQuestion', {
                    defaultValue: 'Your question',
                  })}
                </span>
              )}
            </span>
            <span className="mt-2 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="block h-2 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-2 rounded-full bg-primary"
                  style={{
                    width: `${Math.round((widths[index] ?? 0) * 100)}%`,
                  }}
                />
              </span>
              <span className="w-14 text-right text-sm tabular-nums">
                {timingStrengthText(question, row, i18n.language)}
              </span>
              <span className="flex w-28 justify-end text-xs text-muted-foreground">
                {row.status === 'loading' ? (
                  <Loader2
                    role="status"
                    aria-label={t('compareReport.timing.loading', {
                      defaultValue: 'Loading',
                    })}
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  statusText(row)
                )}
              </span>
            </span>
          </button>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          {t('compareReport.timing.note', {
            defaultValue:
              "Looking at several timings makes one 'yes' by chance more likely. Trust the timing you meant to ask about.",
          })}
        </p>
      </CardContent>
    </Card>
  );
};
