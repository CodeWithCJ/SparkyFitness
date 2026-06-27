import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useSearchParams } from 'react-router-dom';
import DayNavigator from '@/components/DayNavigator';
import {
  Package,
  Trash2,
  Activity,
  Star,
  Clock,
  Pencil,
  Info,
  Pill,
  Syringe,
} from 'lucide-react';
import { todayInZone, addDays, getDueDosesForDate } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  useMedications,
  useDeleteMedicationMutation,
  useMedicationEntries,
} from '@/hooks/useMedications';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { MedicationDetail, MedicationSchedule } from '@/types/medications';
import Glp1Coach from './Glp1Coach';
import AddMedicationDialog, { MedTypeIcon } from './AddMedicationDialog';
import ScheduleManager from './ScheduleManager';
import TodayMedications from './TodayMedications';
import SymptomDashboard from './SymptomDashboard';

const formatDaysOfWeek = (days: number[] | null) => {
  if (!days || days.length === 0) return '';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d] ?? '').join(', ');
};

const formatScheduleDescription = (sched: MedicationSchedule) => {
  const timeStr = sched.time_of_day
    ? i18n.t('medications.scheduleDesc.atTime', ' at {{time}}', {
        time: sched.time_of_day.substring(0, 5),
      })
    : '';
  const mealStr = sched.with_meal
    ? i18n.t('medications.scheduleDesc.mealSuffix', ' ({{meal}} meal)', {
        meal: sched.with_meal,
      })
    : '';

  switch (sched.schedule_type_id) {
    case 'daily':
      return `${i18n.t('medications.scheduleDesc.daily', 'Daily')}${timeStr}${mealStr}`;
    case 'weekly':
    case 'specific_days':
      return `${i18n.t('medications.scheduleDesc.weeklyOn', 'Weekly on {{days}}', { days: formatDaysOfWeek(sched.days_of_week) })}${timeStr}${mealStr}`;
    case 'every_n_days':
      return `${i18n.t('medications.scheduleDesc.everyNDays', 'Every {{n}} days', { n: sched.interval_days })}${timeStr}${mealStr}`;
    case 'cyclic':
      return `${i18n.t('medications.scheduleDesc.cyclic', 'Cycle: {{on}} days on, {{off}} days off', { on: sched.cycle_on_days, off: sched.cycle_off_days })}${timeStr}${mealStr}`;
    case 'monthly':
      return `${i18n.t('medications.scheduleDesc.monthly', 'Monthly on day {{day}}', { day: sched.day_of_month })}${timeStr}${mealStr}`;
    case 'prn':
      return `${i18n.t('medications.scheduleDesc.prn', 'As needed (PRN)')}${sched.prn_reason ? `: ${sched.prn_reason}` : ''}`;
    case 'taper':
      return `${i18n.t('medications.scheduleDesc.taper', 'Taper / titration')}${timeStr}${mealStr}`;
    default:
      return `${sched.schedule_type_id}${timeStr}${mealStr}`;
  }
};

export default function Medications() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'today' | 'cabinet' | 'symptoms'>(
    'today'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const dateParam = searchParams.get('date');

  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInZone(timezone);

  const [selectedDate, setSelectedDate] = useState<string>(
    () => dateParam || today
  );

  useEffect(() => {
    const targetDate = dateParam || today;
    if (targetDate !== selectedDate) {
      setSelectedDate(targetDate);
    }
  }, [dateParam, today, selectedDate]);

  const thirtyDaysAgo = useMemo(
    () => addDays(selectedDate, -30),
    [selectedDate]
  );

  // Queries
  const { data: meds = [], isLoading: loadingMeds } = useMedications({
    activeOnly: false,
  });

  const { data: entries = [], isLoading: loadingEntries } =
    useMedicationEntries({
      fromDate: selectedDate,
      toDate: selectedDate,
    });

  const { data: recentEntries = [] } = useMedicationEntries({
    fromDate: thirtyDaysAgo,
    toDate: selectedDate,
  });

  const dueTodayCount = useMemo(() => {
    return getDueDosesForDate(meds as MedicationDetail[], selectedDate).length;
  }, [meds, selectedDate]);

  // Mutations
  const removeMedMutation = useDeleteMedicationMutation();

  const handleDeleteMed = (id: string) =>
    removeMedMutation.mutate(id, { onSuccess: () => setSelectedId(null) });

  const selected =
    (meds.find((m) => m.id === selectedId) as MedicationDetail) ?? null;

  return (
    <div className="space-y-6">
      {/* Navigation & Date Filter Row */}
      <div className="w-full flex flex-col lg:flex-row items-center gap-4 lg:gap-6 border-b pb-3 mb-6">
        {/* Navigation Pills */}
        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1 flex-1">
          <Button
            variant={activeTab === 'today' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('today')}
            className={`rounded-full px-4 h-9 gap-2 transition-all ${
              activeTab === 'today'
                ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {t('medications.tabs.log', 'Log')}
            </span>
          </Button>
          <Button
            variant={activeTab === 'cabinet' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('cabinet')}
            className={`rounded-full px-4 h-9 gap-2 transition-all ${
              activeTab === 'cabinet'
                ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Package className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {t('medications.tabs.cabinet', 'Cabinet')}
            </span>
          </Button>
          <Button
            variant={activeTab === 'symptoms' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('symptoms')}
            className={`rounded-full px-4 h-9 gap-2 transition-all ${
              activeTab === 'symptoms'
                ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-xs font-semibold">
              {t('medications.tabs.symptoms', 'Symptoms')}
            </span>
          </Button>
          <span className="mx-2 text-muted-foreground/30 hidden sm:inline">
            |
          </span>
          <AddMedicationDialog />
        </div>

        {/* Vertical Divider (Desktop Only) */}
        <div className="hidden lg:block w-px h-6 bg-border" />

        {/* Date Filter */}
        <div className="shrink-0">
          <DayNavigator
            selectedDate={selectedDate}
            onDateChange={(d) => setSearchParams({ date: d })}
            className="flex items-center justify-end gap-2 mb-0"
          />
        </div>
      </div>

      {activeTab === 'today' && (
        <TodayMedications
          selectedDate={selectedDate}
          today={today}
          meds={meds as MedicationDetail[]}
          entries={entries}
          recentEntries={recentEntries}
          loadingMeds={loadingMeds}
          loadingEntries={loadingEntries}
        />
      )}

      {activeTab === 'cabinet' && (
        <div className="space-y-6">
          {/* KPI tiles (real counts only — no cost) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t('medications.cabinet.activeScripts', 'Active scripts'),
                value: meds.filter((m) => m.is_active).length,
                Icon: Pill,
                color: 'text-rose-500',
              },
              {
                label: t('medications.cabinet.glp1Meds', 'GLP-1 meds'),
                value: meds.filter((m) => m.is_active && m.is_glp1).length,
                Icon: Syringe,
                color: 'text-blue-500',
              },
              {
                label: t(
                  'medications.cabinet.scheduledToday',
                  'Scheduled today'
                ),
                value: dueTodayCount,
                Icon: Clock,
                color: 'text-amber-500',
              },
              {
                label: t('medications.cabinet.totalMeds', 'Total meds'),
                value: meds.length,
                Icon: Activity,
                color: 'text-slate-500',
              },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-lg bg-muted p-2 ${kpi.color}`}>
                    <kpi.Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold leading-none">
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      {kpi.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-[380px_1fr]">
            {/* Medications List */}
            <div className="space-y-4">
              {meds.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No medications yet. Add your first one to get started.
                  </CardContent>
                </Card>
              )}
              {meds.map((med) => (
                <Card
                  key={med.id}
                  onClick={() => setSelectedId(med.id)}
                  className={`cursor-pointer transition hover:shadow-sm ${
                    selectedId === med.id
                      ? 'border-primary ring-1 ring-primary'
                      : ''
                  }`}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <MedTypeIcon
                        typeId={med.type_id}
                        isGlp1={med.is_glp1}
                        className="h-5 w-5"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {med.display_name || med.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>
                            {med.strength_value
                              ? `${med.strength_value} ${med.strength_unit ?? ''}`
                              : med.type_id}
                          </span>
                          {med.schedules?.[0] && (
                            <>
                              <span>·</span>
                              <span>
                                {formatScheduleDescription(med.schedules[0])}
                              </span>
                            </>
                          )}
                          {med.prescriber && (
                            <>
                              <span>·</span>
                              <span className="truncate">
                                Dr. {med.prescriber}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {!med.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Selected Medication Details (Drawer-like Right Column) */}
            <div>
              {!selected ? (
                <Card className="h-full border-dashed flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Info className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-sm font-semibold">
                    No medication selected
                  </CardTitle>
                  <CardDescription className="max-w-[240px] mt-1 text-xs">
                    Select a medication from the list to view schedules, notes,
                    and GLP-1 coaching tools.
                  </CardDescription>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base font-bold">
                            {selected.display_name || selected.name}
                          </CardTitle>
                          {selected.is_glp1 && (
                            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-1.5 py-0">
                              GLP-1
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs mt-0.5">
                          {selected.strength_value
                            ? `${selected.strength_value} ${selected.strength_unit ?? ''}`
                            : selected.type_id}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1">
                        <AddMedicationDialog
                          key={selected.id}
                          editMed={selected}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteMed(selected.id)}
                          disabled={removeMedMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {/* Advanced details cards / sections */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {selected.prescriber && (
                          <div className="rounded-lg bg-muted/40 p-2 border">
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Prescriber
                            </p>
                            <p className="font-medium mt-0.5 truncate">
                              {selected.prescriber}
                            </p>
                          </div>
                        )}
                        {selected.pharmacy && (
                          <div className="rounded-lg bg-muted/40 p-2 border">
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Pharmacy
                            </p>
                            <p className="font-medium mt-0.5 truncate">
                              {selected.pharmacy}
                            </p>
                          </div>
                        )}
                        {selected.rx_number && (
                          <div className="rounded-lg bg-muted/40 p-2 border col-span-2">
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Rx Number
                            </p>
                            <p className="font-medium mt-0.5 truncate">
                              {selected.rx_number}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Photo / Pill Image Display (Phase A) */}
                      {selected.photo_path && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Pill/Packaging Photo
                          </p>
                          <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                            <img
                              src={selected.photo_path}
                              alt={selected.display_name || selected.name}
                              className="object-cover w-full h-full"
                              onError={(e) => {
                                // hide broken images gracefully
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Effectiveness Rating (Phase A) */}
                      {selected.effectiveness_rating != null && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Effectiveness
                          </p>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < (selected.effectiveness_rating ?? 0)
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-muted/40'
                                }`}
                              />
                            ))}
                            <span className="text-xs font-medium text-muted-foreground ml-1">
                              ({selected.effectiveness_rating}/5)
                            </span>
                          </div>
                        </div>
                      )}

                      {selected.reason_text && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {t('medications.cabinet.reason', 'Reason')}
                          </p>
                          <p className="mt-0.5">{selected.reason_text}</p>
                        </div>
                      )}

                      {selected.notes && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {t('medications.cabinet.notes', 'Notes')}
                          </p>
                          <p className="whitespace-pre-wrap mt-0.5">
                            {selected.notes}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {selected.is_glp1 ? (
                    <div className="space-y-4">
                      <Glp1Coach med={selected} />
                      <ScheduleManager med={selected} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Activity className="h-4 w-4 text-primary" />{' '}
                            Adherence Overview
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          Schedules and daily checklists for non-GLP-1
                          medications are fully active. Manage schedule rules
                          below, and log daily intake from the{' '}
                          <strong>Today</strong> tab.
                        </CardContent>
                      </Card>
                      <ScheduleManager med={selected} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'symptoms' && (
        <SymptomDashboard
          selectedDate={selectedDate}
          today={today}
          meds={meds as MedicationDetail[]}
          recentEntries={recentEntries}
        />
      )}
    </div>
  );
}
