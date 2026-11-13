import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildMonthGrid,
  dayDoseTotal,
  dayLogStatus,
  isEntryVisibleForSubtype,
  monthDoseTotal,
  tallyEntriesByDay,
  tallySymptomsByDay,
  type DayLogStatus,
  type MedSubtype,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useMedicationEntries } from '@/hooks/useMedications';
import { useSymptomEntries } from '@/hooks/useSymptoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MonthCalendar, { type DayCellRender } from '@/components/MonthCalendar';
import type { Medication, MedicationEntry } from '@/types/medications';

// Ratio-based coloring: a day's fill reflects how complete that day's doses
// were (taken+PRN vs. skipped), not just "was anything taken" — so a day with
// 2 taken + 1 skipped reads as partial (amber), not solid "taken" green.
const COLOR_ALL_TAKEN = '#10b981'; // emerald-500 — every dose taken
const COLOR_PARTIAL_TAKEN = '#f59e0b'; // amber-500 — some taken, some skipped
const COLOR_MOSTLY_SKIPPED = '#f97316'; // orange-500 — mostly skipped
const COLOR_ALL_SKIPPED = '#ef4444'; // red-500 — none taken, all skipped
const COLOR_SNOOZED_ONLY = '#94a3b8'; // slate-400 — only snoozed doses logged

const SIDE_EFFECT_COLOR = '#f43f5e'; // rose-500
const GENERAL_SYMPTOM_COLOR = '#8b5cf6'; // violet-500

/** Sentinel dropdown value meaning "aggregate across every medication". */
const ALL_MEDS = '__all__';

const DAY_STATUS_COLOR: Record<DayLogStatus, string> = {
  all_taken: COLOR_ALL_TAKEN,
  partial: COLOR_PARTIAL_TAKEN,
  mostly_skipped: COLOR_MOSTLY_SKIPPED,
  all_skipped: COLOR_ALL_SKIPPED,
  snoozed_only: COLOR_SNOOZED_ONLY,
};

interface MedicationLogCalendarProps {
  medications: Medication[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  subtype?: MedSubtype;
}

export default function MedicationLogCalendar({
  medications,
  selectedDate,
  onSelectDate,
  subtype = 'all',
}: MedicationLogCalendarProps) {
  const { t } = useTranslation();
  const { firstDayOfWeek } = usePreferences();

  // The calendar already receives the subtype-filtered list, so only its wording
  // needs to follow the filter. In the mixed All view the picker's catch-all is just
  // "All", because the list it heads can hold both medications and supplements.
  const copy = useMemo(() => {
    if (subtype === 'supplements') {
      return {
        title: t(
          'medications.calendar.titleSupplements',
          'Supplement Log Calendar'
        ),
        empty: t(
          'medications.calendar.noSupplements',
          'Add a supplement to see its log calendar here.'
        ),
        all: t('medications.calendar.allSupplements', 'All supplements'),
        placeholder: t(
          'medications.calendar.selectSupplement',
          'Select a supplement'
        ),
      };
    }
    if (subtype === 'meds') {
      return {
        title: t('medications.calendar.title', 'Medication Log Calendar'),
        empty: t(
          'medications.calendar.noMeds',
          'Add a medication to see its log calendar here.'
        ),
        all: t('medications.calendar.allMedications', 'All medications'),
        placeholder: t(
          'medications.calendar.selectMedication',
          'Select a medication'
        ),
      };
    }
    return {
      title: t('medications.calendar.titleAll', 'Log Calendar'),
      empty: t(
        'medications.calendar.noEntries',
        'Add a medication or supplement to see its log calendar here.'
      ),
      all: t('medications.calendar.allEntries', 'All'),
      placeholder: t('medications.calendar.selectEntry', 'Select an item'),
    };
  }, [subtype, t]);

  const loggableMeds = useMemo(
    () => medications.filter((m) => m.is_active !== false),
    [medications]
  );

  const [selectedMedId, setSelectedMedId] = useState<string>(ALL_MEDS);
  const isAllSelected = selectedMedId === ALL_MEDS;
  const activeMedId = isAllSelected ? undefined : selectedMedId;

  // `medications` arrives already narrowed by the subtype filter, but the entries
  // below are fetched by date and only constrained when a single item is picked.
  // With the catch-all selected the month total and day colours would therefore
  // count the subtype the user just filtered out. Narrow them by the visible ids.
  //
  // `all` deliberately does NOT filter: an entry outlives the medication it came
  // from, and those orphans match no visible id, so filtering the mixed view would
  // silently drop history it exists to show.
  const visibleMedIds = useMemo(
    () => new Set(medications.map((m) => m.id)),
    [medications]
  );
  const entryIsVisible = useCallback(
    (medicationId: string | null | undefined) =>
      isEntryVisibleForSubtype(medicationId, visibleMedIds, subtype),
    [subtype, visibleMedIds]
  );

  // A selection made under one filter can survive a switch that hides it, leaving
  // the calendar pinned to an item the list no longer offers.
  useEffect(() => {
    if (!isAllSelected && !visibleMedIds.has(selectedMedId)) {
      setSelectedMedId(ALL_MEDS);
    }
  }, [isAllSelected, selectedMedId, visibleMedIds]);

  const [month, setMonth] = useState(() => selectedDate.slice(0, 7));

  const { year, monthVal } = useMemo(() => {
    const parts = month.split('-').map(Number);
    return { year: parts[0] ?? 2026, monthVal: parts[1] ?? 1 };
  }, [month]);

  // Fetch the exact grid range shown by MonthCalendar (which uses the same
  // buildMonthGrid + firstDayOfWeek inputs), so entries/symptoms cover every
  // visible leading/trailing day from adjacent months.
  const { gridStart: fetchFrom, gridEnd: fetchTo } = useMemo(
    () => buildMonthGrid(year, monthVal, firstDayOfWeek),
    [year, monthVal, firstDayOfWeek]
  );

  const { data: entries = [] } = useMedicationEntries({
    fromDate: fetchFrom,
    toDate: fetchTo,
    medicationId: activeMedId,
  });
  const { data: symptomEntries = [] } = useSymptomEntries({
    fromDate: fetchFrom,
    toDate: fetchTo,
  });

  const entriesByDay = useMemo(
    () =>
      tallyEntriesByDay(entries as MedicationEntry[], {
        medicationId: activeMedId,
        include: entryIsVisible,
      }),
    [entries, activeMedId, entryIsVisible]
  );

  // A symptom linked to an item the subtype filter hides belongs to the other
  // kind, so it is dropped outright rather than reclassified as "general".
  // Symptoms with no medication at all are genuinely general and always stay.
  const symptomsByDay = useMemo(
    () =>
      tallySymptomsByDay(symptomEntries, {
        medicationId: activeMedId,
        include: entryIsVisible,
      }),
    [symptomEntries, activeMedId, entryIsVisible]
  );

  const monthTotal = useMemo(
    () => monthDoseTotal(entriesByDay, month),
    [entriesByDay, month]
  );

  const weekdayLabels = useMemo(() => {
    const days = [
      t('medications.calendar.sun', 'Sun'),
      t('medications.calendar.mon', 'Mon'),
      t('medications.calendar.tue', 'Tue'),
      t('medications.calendar.wed', 'Wed'),
      t('medications.calendar.thu', 'Thu'),
      t('medications.calendar.fri', 'Fri'),
      t('medications.calendar.sat', 'Sat'),
    ];
    const reordered: string[] = [];
    for (let i = 0; i < 7; i++) {
      reordered.push(days[(firstDayOfWeek + i) % 7]!);
    }
    return reordered;
  }, [t, firstDayOfWeek]);

  const monthLabel = useMemo(() => {
    const date = new Date(Date.UTC(year, monthVal - 1, 1));
    return date.toLocaleDateString(t('i18n.locale', 'en-US'), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }, [year, monthVal, t]);

  if (loggableMeds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {copy.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            {copy.empty}
          </p>
        </CardContent>
      </Card>
    );
  }

  const legend = [
    {
      label: t('medications.calendar.allTaken', 'All doses taken'),
      color: COLOR_ALL_TAKEN,
    },
    {
      label: t('medications.calendar.partialTaken', 'Partially taken'),
      color: COLOR_PARTIAL_TAKEN,
    },
    {
      label: t('medications.calendar.mostlySkipped', 'Mostly skipped'),
      color: COLOR_MOSTLY_SKIPPED,
    },
    {
      label: t('medications.calendar.allSkipped', 'All doses skipped'),
      color: COLOR_ALL_SKIPPED,
    },
    {
      label: t('medications.calendar.snoozedOnly', 'Snoozed only'),
      color: COLOR_SNOOZED_ONLY,
    },
    {
      label: t('medications.calendar.sideEffect', 'Side-effect symptom'),
      color: SIDE_EFFECT_COLOR,
    },
    {
      label: t('medications.calendar.generalSymptom', 'General symptom'),
      color: GENERAL_SYMPTOM_COLOR,
    },
  ];

  return (
    <MonthCalendar
      month={month}
      onMonthChange={setMonth}
      weekdayLabels={weekdayLabels}
      selectedDate={selectedDate}
      onDayClick={onSelectDate}
      legend={legend}
      monthLabelLocale={t('i18n.locale', 'en-US')}
      topContent={
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Select value={selectedMedId} onValueChange={setSelectedMedId}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={copy.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MEDS}>{copy.all}</SelectItem>
                {loggableMeds.map((med) => (
                  <SelectItem key={med.id} value={med.id}>
                    {med.display_name || med.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'medications.calendar.monthTotal',
              '{{count}} doses logged in {{month}}',
              { count: monthTotal, month: monthLabel }
            )}
          </p>
        </div>
      }
      renderDay={(day): DayCellRender => {
        const counts = entriesByDay[day];
        const symptoms = symptomsByDay[day];
        const status = counts ? dayLogStatus(counts) : null;
        const total = counts ? dayDoseTotal(counts) : 0;

        const cell: DayCellRender = {};
        if (status) {
          cell.fill = DAY_STATUS_COLOR[status];
          cell.textColor = '#fff';
        }

        // Hover tooltip: exact breakdown, since the fill color alone can't
        // distinguish e.g. "2 taken + 1 skipped" from other combinations
        // that land in the same amber/orange band.
        if (counts) {
          const parts: string[] = [];
          if (counts.taken > 0) {
            parts.push(
              t('medications.calendar.tooltipTaken', '{{count}} taken', {
                count: counts.taken,
              })
            );
          }
          if (counts.prn > 0) {
            parts.push(
              t('medications.calendar.tooltipPrn', '{{count}} PRN taken', {
                count: counts.prn,
              })
            );
          }
          if (counts.skipped > 0) {
            parts.push(
              t('medications.calendar.tooltipSkipped', '{{count}} skipped', {
                count: counts.skipped,
              })
            );
          }
          if (counts.snoozed > 0) {
            parts.push(
              t('medications.calendar.tooltipSnoozed', '{{count}} snoozed', {
                count: counts.snoozed,
              })
            );
          }
          if (symptoms && symptoms.names.length > 0) {
            parts.push(
              t('medications.calendar.tooltipSymptoms', 'Symptoms: {{names}}', {
                names: symptoms.names.join(', '),
              })
            );
          }
          if (parts.length > 0) {
            cell.title = parts.join(' · ');
          }
        }

        const badges: React.ReactNode[] = [];
        if (total > 1) {
          badges.push(
            <span
              key="count"
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background"
            >
              {total}
            </span>
          );
        }
        if (symptoms?.sideEffect) {
          badges.push(
            <span
              key="side-effect"
              className="absolute bottom-1 left-1/2 -translate-x-[5px] h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: SIDE_EFFECT_COLOR }}
            />
          );
        }
        if (symptoms?.general) {
          badges.push(
            <span
              key="general"
              className="absolute bottom-1 left-1/2 translate-x-[1px] h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: GENERAL_SYMPTOM_COLOR }}
            />
          );
        }
        if (badges.length > 0) {
          cell.content = <>{badges}</>;
        }

        return cell;
      }}
    />
  );
}
