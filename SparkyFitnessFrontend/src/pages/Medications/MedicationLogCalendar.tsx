import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildMonthGrid } from '@workspace/shared';
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

interface DayCounts {
  taken: number;
  prn: number;
  skipped: number;
  snoozed: number;
}

interface DaySymptomInfo {
  sideEffect: boolean;
  general: boolean;
  /** Deduped symptom names logged that day, for the hover tooltip. */
  names: string[];
}

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

interface DayColor {
  fill: string;
  textColor?: string;
}

/** Colors a day by completion ratio: taken+PRN vs. skipped, not by a single dominant status. */
const getDayColor = (counts: DayCounts): DayColor | null => {
  const active = counts.taken + counts.prn;
  const total = active + counts.skipped;

  if (total === 0) {
    return counts.snoozed > 0
      ? { fill: COLOR_SNOOZED_ONLY, textColor: '#fff' }
      : null;
  }

  const pct = (active / total) * 100;
  if (pct === 100) return { fill: COLOR_ALL_TAKEN, textColor: '#fff' };
  if (pct >= 50) return { fill: COLOR_PARTIAL_TAKEN, textColor: '#fff' };
  if (pct > 0) return { fill: COLOR_MOSTLY_SKIPPED, textColor: '#fff' };
  return { fill: COLOR_ALL_SKIPPED, textColor: '#fff' };
};

interface MedicationLogCalendarProps {
  medications: Medication[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function MedicationLogCalendar({
  medications,
  selectedDate,
  onSelectDate,
}: MedicationLogCalendarProps) {
  const { t } = useTranslation();
  const { firstDayOfWeek } = usePreferences();

  const loggableMeds = useMemo(
    () => medications.filter((m) => m.is_active !== false),
    [medications]
  );

  const [selectedMedId, setSelectedMedId] = useState<string>(ALL_MEDS);
  const isAllSelected = selectedMedId === ALL_MEDS;
  const activeMedId = isAllSelected ? undefined : selectedMedId;

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

  const entriesByDay = useMemo(() => {
    const map: Record<string, DayCounts> = {};
    (entries as MedicationEntry[]).forEach((e) => {
      if (!isAllSelected && e.medication_id !== activeMedId) return;
      const day = e.entry_date.split('T')[0];
      if (!day) return;
      if (!map[day]) map[day] = { taken: 0, prn: 0, skipped: 0, snoozed: 0 };
      if (e.status === 'taken') map[day].taken++;
      else if (e.status === 'prn_taken') map[day].prn++;
      else if (e.status === 'skipped') map[day].skipped++;
      else if (e.status === 'snoozed') map[day].snoozed++;
    });
    return map;
  }, [entries, activeMedId, isAllSelected]);

  const symptomsByDay = useMemo(() => {
    const map: Record<string, DaySymptomInfo> = {};
    symptomEntries.forEach((s) => {
      const day = s.entry_date.split('T')[0];
      if (!day) return;
      if (!map[day])
        map[day] = { sideEffect: false, general: false, names: [] };
      // In "All medications" mode, any medication-linked symptom counts as a
      // side effect; otherwise only symptoms linked to the selected medication do.
      const isSideEffect = isAllSelected
        ? !!s.medication_id
        : s.medication_id === activeMedId;
      if (isSideEffect) {
        map[day].sideEffect = true;
      } else {
        map[day].general = true;
      }
      if (!map[day].names.includes(s.symptom_name_snapshot)) {
        map[day].names.push(s.symptom_name_snapshot);
      }
    });
    return map;
  }, [symptomEntries, activeMedId, isAllSelected]);

  const monthTotal = useMemo(() => {
    return Object.entries(entriesByDay).reduce((sum, [day, counts]) => {
      if (day.slice(0, 7) !== month) return sum;
      return sum + counts.taken + counts.prn;
    }, 0);
  }, [entriesByDay, month]);

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
            {t('medications.calendar.title', 'Medication Log Calendar')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            {t(
              'medications.calendar.noMeds',
              'Add a medication to see its log calendar here.'
            )}
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
                <SelectValue
                  placeholder={t(
                    'medications.calendar.selectMedication',
                    'Select a medication'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MEDS}>
                  {t('medications.calendar.allMedications', 'All medications')}
                </SelectItem>
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
        const color = counts ? getDayColor(counts) : null;
        const total = counts ? counts.taken + counts.prn : 0;

        const cell: DayCellRender = {};
        if (color) {
          cell.fill = color.fill;
          cell.textColor = color.textColor;
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
