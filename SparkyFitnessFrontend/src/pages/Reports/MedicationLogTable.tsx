import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  Medication,
  MedicationEntry,
  InjectionEntry,
} from '@/types/medications';

interface SymptomEntry {
  id: string;
  entry_date: string;
  medication_id?: string | null;
  symptom_name_snapshot: string;
  severity: number;
}

interface DayRow {
  date: string;
  taken: number;
  prn: number;
  injections: number;
  skipped: number;
  times: string[];
  symptoms: Array<{ name: string; isSideEffect: boolean }>;
}

interface MedicationLogTableProps {
  medications: Medication[];
  medicationEntries: MedicationEntry[];
  /**
   * GLP-1 injectable doses. The server keeps these out of `medicationEntries` for
   * reports specifically to avoid double-counting (unlike the Log tab's merged
   * feed), so they must be folded in here explicitly or injectable medications
   * would show zero doses in this table.
   */
  injections: InjectionEntry[];
  symptomEntries: SymptomEntry[];
  startDate: string;
  endDate: string;
}

export default function MedicationLogTable({
  medications,
  medicationEntries,
  injections,
  symptomEntries,
  startDate,
  endDate,
}: MedicationLogTableProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();

  const formatTime = useCallback(
    (timestamp: string | null | undefined) => {
      if (!timestamp) return null;
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(timestamp));
      } catch {
        return null;
      }
    },
    [timezone]
  );

  // Group medication entries + symptoms by medication, then by day.
  const sections = useMemo(() => {
    const symptomsByDay = new Map<string, SymptomEntry[]>();
    symptomEntries.forEach((s) => {
      const day = s.entry_date.split('T')[0];
      if (!day) return;
      const list = symptomsByDay.get(day) ?? [];
      list.push(s);
      symptomsByDay.set(day, list);
    });

    const getRow = (rowsByDay: Map<string, DayRow>, day: string): DayRow => {
      if (!rowsByDay.has(day)) {
        rowsByDay.set(day, {
          date: day,
          taken: 0,
          prn: 0,
          injections: 0,
          skipped: 0,
          times: [],
          symptoms: [],
        });
      }
      return rowsByDay.get(day)!;
    };

    return medications
      .map((med) => {
        const rowsByDay = new Map<string, DayRow>();

        medicationEntries
          .filter((e) => e.medication_id === med.id)
          .forEach((e) => {
            const day = e.entry_date.split('T')[0];
            if (!day) return;
            const row = getRow(rowsByDay, day);
            if (e.status === 'taken' || e.status === 'prn_taken') {
              if (e.status === 'taken') row.taken++;
              else row.prn++;
              const time = formatTime(e.taken_at);
              if (time) row.times.push(time);
            } else if (e.status === 'skipped') {
              row.skipped++;
            }
          });

        // GLP-1 injectable doses live in a separate array (see prop doc), each
        // one always counts as taken.
        injections
          .filter((inj) => inj.medication_id === med.id)
          .forEach((inj) => {
            const day = inj.entry_date.split('T')[0];
            if (!day) return;
            const row = getRow(rowsByDay, day);
            row.injections++;
            const time = formatTime(inj.injected_at);
            if (time) row.times.push(time);
          });

        // Attach same-day symptoms to every day this medication has a row for,
        // flagging side effects (symptom.medication_id === this medication).
        rowsByDay.forEach((row, day) => {
          const daySymptoms = symptomsByDay.get(day) ?? [];
          row.symptoms = daySymptoms.map((s) => ({
            name: s.symptom_name_snapshot,
            isSideEffect: s.medication_id === med.id,
          }));
        });

        const rows = Array.from(rowsByDay.values()).sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0
        );

        const totalDoses = rows.reduce(
          (sum, r) => sum + r.taken + r.prn + r.injections,
          0
        );

        return { medication: med, rows, totalDoses };
      })
      .filter((section) => section.rows.length > 0);
  }, [medications, medicationEntries, injections, symptomEntries, formatTime]);

  if (sections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('medications.reports.logTableTitle', 'Medication Log Table')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            {t(
              'medications.reports.logTableEmpty',
              'No medication doses logged in this date range.'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {t('medications.reports.logTableTitle', 'Medication Log Table')}
        </CardTitle>
        <CardDescription>
          {t(
            'medications.reports.logTableDesc',
            'Per-day dose counts and times for {{start}}–{{end}}, including same-day symptoms.',
            { start: startDate, end: endDate }
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.map(({ medication, rows, totalDoses }) => (
          <div key={medication.id} className="space-y-2">
            <h4 className="text-sm font-semibold">
              {medication.display_name || medication.name} —{' '}
              {t('medications.reports.dosesLogged', '{{count}} doses logged', {
                count: totalDoses,
              })}
            </h4>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.date', 'Date')}</TableHead>
                    <TableHead className="text-right">
                      {t('medications.reports.dosesTaken', 'Doses taken')}
                    </TableHead>
                    <TableHead>
                      {t('medications.reports.times', 'Times')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('medications.calendar.skipped', 'Skipped')}
                    </TableHead>
                    <TableHead>
                      {t('medications.reports.symptomsColumn', 'Symptoms')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.date}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.taken + row.prn + row.injections}
                        {row.prn > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({row.prn} PRN)
                          </span>
                        )}
                        {row.injections > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({row.injections}{' '}
                            {t('medications.reports.injectionAbbrev', 'inj')})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.times.length > 0 ? row.times.join(', ') : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.skipped || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.symptoms.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                          {row.symptoms.map((s, idx) => (
                            <Badge
                              key={`${s.name}-${idx}`}
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 border-none font-semibold ${
                                s.isSideEffect
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                              }`}
                            >
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
