import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  COMPARE_METRICS,
  isSleepMetric,
  timingOf,
  type CompareMetricKey,
  type CompareQuestion,
  type CompareResponse,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/DataTable';
import type { DataTableFeatures } from '@/components/ui/dataTableFeatures';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  compareAmountText,
  compareValueText,
  metricName,
  subjectName,
  timingLabel,
} from './compareCopy';
import { dayRows, hasDeviation, type CompareDayRow } from './compareTables';

interface CompareDaysTableProps {
  response: CompareResponse;
  question: CompareQuestion;
}

export const CompareDaysTable = ({
  response,
  question,
}: CompareDaysTableProps) => {
  const { t, i18n } = useTranslation();
  const { formatDateInUserTimezone, timeFormat, energyUnit } = usePreferences();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'day', desc: true },
  ]);

  const rows = useMemo(() => dayRows(response, question), [response, question]);

  const columns = useMemo<ColumnDef<DataTableFeatures, CompareDayRow>[]>(() => {
    const chosen = timingOf(question.choice);
    const isWeek = chosen.mode === 'week';
    const yesNo = (key: CompareMetricKey, value: number) => {
      if (COMPARE_METRICS[key].kind !== 'binary') {
        return compareValueText(key, value, timeFormat, energyUnit);
      }
      // By week a habit's value is the count of days you did it.
      if (isWeek) {
        const count = Math.round(value);
        return t('compareReport.days.count', {
          count,
          defaultValue: '{{count}} days',
          defaultValue_one: '{{count}} day',
          defaultValue_other: '{{count}} days',
        });
      }
      return value >= 0.5
        ? t('compareReport.days.yes', { defaultValue: 'Yes' })
        : t('compareReport.days.no', { defaultValue: 'No' });
    };
    // Sleep is dated by the day you woke, so with sleep on either side a
    // same-day row still needs its timing words ("the night before").
    const showWhen =
      chosen.mode !== 'since' &&
      (chosen.timing !== 0 ||
        (chosen.mode === 'day' &&
          (isSleepMetric(question.a) || isSleepMetric(question.b))));
    const aName = subjectName(question.a, chosen.mode, t);
    const bName = showWhen
      ? t('compareReport.days.metricWhen', {
          defaultValue: '{{metric}} ({{timing}})',
          metric: metricName(question.b, t),
          timing: timingLabel(question.choice, question.a, question.b, t),
        })
      : metricName(question.b, t);
    const vsUsual = (name: string) =>
      t('compareReport.days.vsUsual', {
        defaultValue: '{{metric}} vs. your usual',
        metric: name,
      });
    const devCell = (key: CompareMetricKey, dev: number | null) => {
      if (dev === null) return '—';
      if (isWeek && COMPARE_METRICS[key].kind === 'binary') {
        // Days against your usual weeks, so a fraction is real.
        const amount = new Intl.NumberFormat(i18n.language, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }).format(dev);
        return t('compareReport.days.daysDeviation', {
          defaultValue: '{{amount}} days',
          amount,
        });
      }
      // A bedtime deviation is a span of minutes, not a clock time.
      if (key === 'bedtime') {
        return t('compareReport.days.minutesDeviation', {
          defaultValue: '{{amount}} min',
          amount: compareAmountText(key, dev, true, energyUnit),
        });
      }
      return compareAmountText(key, dev, true, energyUnit);
    };
    const devSort = (dev: number | null) => dev ?? Number.NEGATIVE_INFINITY;

    const dayColumn: ColumnDef<DataTableFeatures, CompareDayRow> = {
      id: 'day',
      header: isWeek
        ? t('compareReport.days.week', { defaultValue: 'Week' })
        : t('compareReport.days.day', { defaultValue: 'Day' }),
      accessorFn: (row) => row.aKey,
      cell: ({ row }) => {
        const date = formatDateInUserTimezone(row.original.aKey, 'PP');
        return isWeek
          ? t('compareReport.days.weekOf', {
              defaultValue: 'Week of {{date}}',
              date,
            })
          : date;
      },
    };
    const aColumns: ColumnDef<DataTableFeatures, CompareDayRow>[] = [
      {
        id: 'a',
        header: aName,
        accessorFn: (row) => row.aRaw,
        cell: ({ row }) => yesNo(question.a, row.original.aRaw),
      },
    ];
    // A yes/no side by day is a flag, so it has no "vs. your usual" column.
    if (hasDeviation(question.a, chosen.mode)) {
      aColumns.push({
        id: 'aDev',
        header: vsUsual(aName),
        accessorFn: (row) => devSort(row.aDev),
        cell: ({ row }) => devCell(question.a, row.original.aDev),
      });
    }
    const bColumns: ColumnDef<DataTableFeatures, CompareDayRow>[] = [
      {
        id: 'b',
        header: bName,
        accessorFn: (row) => row.bRaw,
        cell: ({ row }) => yesNo(question.b, row.original.bRaw),
      },
    ];
    if (hasDeviation(question.b, chosen.mode)) {
      bColumns.push({
        id: 'bDev',
        header: vsUsual(bName),
        accessorFn: (row) => devSort(row.bDev),
        cell: ({ row }) => devCell(question.b, row.original.bDev),
      });
    }
    return [dayColumn, ...aColumns, ...bColumns];
  }, [
    question,
    t,
    i18n.language,
    formatDateInUserTimezone,
    timeFormat,
    energyUnit,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('compareReport.days.title', { defaultValue: 'Every day used' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          titleColumnId="day"
          getRowId={(row) => row.aKey}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      </CardContent>
    </Card>
  );
};
