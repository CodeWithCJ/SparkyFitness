import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  COMPARE_METRICS,
  type CompareSinceResponse,
  sinceCoversLastYear,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import type { DataTableFeatures } from '@/components/ui/dataTableFeatures';
import { usePreferences } from '@/contexts/PreferencesContext';
import { compareAmountText, compareValueText, metricName } from './compareCopy';
import { percentText } from './compareSinceCopy';
import { sinceMonthRows, type SinceMonthRow } from './compareSinceTables';

interface CompareSinceMonthTableProps {
  response: CompareSinceResponse;
}

export const CompareSinceMonthTable = ({
  response,
}: CompareSinceMonthTableProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'month', desc: false },
  ]);

  const rows = useMemo(() => sinceMonthRows(response), [response]);
  // With a start over a year ago, since is only the last year, so the months
  // between the stretches have no rows: say when it started and why.
  const { start } = response.result;
  const startedLongAgo =
    start !== null && sinceCoversLastYear(response.result) ? start : null;

  const columns = useMemo<ColumnDef<DataTableFeatures, SinceMonthRow>[]>(() => {
    const habitKey = response.habit.key;
    const outcomeKey = response.outcome.key;
    const yesNoOutcome = COMPARE_METRICS[outcomeKey].kind === 'binary';
    const nullLast = (value: number | null) =>
      value ?? Number.NEGATIVE_INFINITY;

    const habitCell = (row: SinceMonthRow) => {
      if (row.habitDays !== null) {
        const days = t('compareReport.verdict.days', {
          count: row.habitDays,
          defaultValue: '{{count}} days',
          defaultValue_one: '{{count}} day',
          defaultValue_other: '{{count}} days',
        });
        return row.habitTotal !== null
          ? `${days} · ${compareAmountText(habitKey, row.habitTotal)}`
          : days;
      }
      return row.habitMean !== null
        ? compareValueText(habitKey, row.habitMean, timeFormat)
        : '—';
    };

    const columns: ColumnDef<DataTableFeatures, SinceMonthRow>[] = [
      {
        id: 'month',
        header: t('compareReport.since.months.month', {
          defaultValue: 'Month',
        }),
        accessorFn: (row) => row.month,
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {formatDateInUserTimezone(`${row.original.month}-01`, 'MMM yyyy')}
            {row.original.isStartMonth && (
              <Badge variant="secondary">
                {t('compareReport.since.months.started', {
                  defaultValue: 'Started',
                })}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: 'habit',
        header: metricName(habitKey, t),
        accessorFn: (row) =>
          nullLast(row.habitDays !== null ? row.habitDays : row.habitMean),
        cell: ({ row }) => habitCell(row.original),
      },
      {
        id: 'outcome',
        header: metricName(outcomeKey, t),
        accessorFn: (row) => nullLast(row.outcomeMean),
        cell: ({ row }) => {
          const mean = row.original.outcomeMean;
          if (mean === null) return '—';
          return yesNoOutcome
            ? percentText(mean)
            : compareValueText(outcomeKey, mean, timeFormat);
        },
      },
    ];
    if (!yesNoOutcome) {
      columns.push({
        id: 'line',
        header: t('compareReport.since.months.atOrAbove', {
          defaultValue: 'At or above {{line}}',
          line: compareValueText(outcomeKey, response.result.line, timeFormat),
        }),
        accessorFn: (row) => nullLast(row.shareAtOrAbove),
        cell: ({ row }) =>
          row.original.shareAtOrAbove === null
            ? '—'
            : percentText(row.original.shareAtOrAbove),
      });
    }
    columns.push({
      id: 'valueDays',
      header: t('compareReport.since.months.valueDays', {
        defaultValue: 'Days with a value',
      }),
      accessorFn: (row) => row.valueDays,
    });
    return columns;
  }, [response, t, formatDateInUserTimezone, timeFormat]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('compareReport.since.months.title', {
            defaultValue: 'Month by month',
          })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          titleColumnId="month"
          getRowId={(row) => row.month}
          sorting={sorting}
          onSortingChange={setSorting}
        />
        {startedLongAgo && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t('compareReport.since.months.gap', {
              defaultValue:
                'You started on {{start}}. The months between the before and since stretches are left out.',
              start: formatDateInUserTimezone(startedLongAgo, 'PP'),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
