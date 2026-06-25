import { useState, useMemo } from 'react';
import {
  Pill,
  Syringe,
  Plus,
  Trash2,
  Calendar,
  X,
  Clock,
  Activity,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import {
  GLP1_DRUG_PROFILES,
  todayInZone,
  dayToUtcRange,
  getDueDosesForDate,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMedications,
  useCreateMedicationMutation,
  useDeleteMedicationMutation,
  useMedicationEntries,
  useCreateMedicationEntryMutation,
  useDeleteMedicationEntryMutation,
  useAddScheduleMutation,
  useDeleteScheduleMutation,
} from '@/hooks/useMedications';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication, MedicationSchedule } from '@/types/medications';
import Glp1Coach from './Glp1Coach';

const MED_TYPES = [
  'pill',
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'patch',
  'inhaler',
  'drops',
  'cream',
  'other',
];

type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

function AddMedicationDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('injection');
  const [isGlp1, setIsGlp1] = useState(true);
  const [glp1Drug, setGlp1Drug] = useState('semaglutide');
  const [strength, setStrength] = useState('');
  const [strengthUnit, setStrengthUnit] = useState('mg');

  const mutation = useCreateMedicationMutation();

  const handleSave = () => {
    const body: Partial<Medication> & { name: string } = {
      name: name.trim(),
      type_id: typeId,
      is_glp1: isGlp1,
      strength_value: strength ? Number(strength) : null,
      strength_unit: strengthUnit || null,
      dose_amount: strength ? Number(strength) : null,
      dose_unit: strengthUnit || null,
      custom_fields: isGlp1 ? { glp1_drug: glp1Drug } : {},
    };
    mutation.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setName('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add medication
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add medication</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="med-name">Name</Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wegovy"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MED_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Strength</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  placeholder="1.0"
                />
                <Input
                  className="w-20"
                  value={strengthUnit}
                  onChange={(e) => setStrengthUnit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm font-medium">GLP-1 medication</Label>
              <p className="text-xs text-muted-foreground">
                Unlocks the injection coach, PK curve & site rotation.
              </p>
            </div>
            <Switch checked={isGlp1} onCheckedChange={setIsGlp1} />
          </div>
          {isGlp1 && (
            <div className="space-y-2">
              <Label>GLP-1 drug (for the PK model)</Label>
              <Select value={glp1Drug} onValueChange={setGlp1Drug}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(GLP1_DRUG_PROFILES).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName} ({p.brands.join(', ')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const formatDaysOfWeek = (days: number[] | null) => {
  if (!days || days.length === 0) return '';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((d) => names[d]).join(', ');
};

const formatScheduleDescription = (sched: MedicationSchedule) => {
  const timeStr = sched.time_of_day
    ? ` at ${sched.time_of_day.substring(0, 5)}`
    : '';
  const mealStr = sched.with_meal ? ` (${sched.with_meal} meal)` : '';

  switch (sched.schedule_type_id) {
    case 'daily':
      return `Daily${timeStr}${mealStr}`;
    case 'weekly':
    case 'specific_days':
      return `Weekly on ${formatDaysOfWeek(sched.days_of_week)}${timeStr}${mealStr}`;
    case 'every_n_days':
      return `Every ${sched.interval_days} days${timeStr}${mealStr}`;
    case 'cyclic':
      return `Cycle: ${sched.cycle_on_days} days on, ${sched.cycle_off_days} days off${timeStr}${mealStr}`;
    case 'monthly':
      return `Monthly on day ${sched.day_of_month}${timeStr}${mealStr}`;
    case 'prn':
      return `As needed (PRN)${sched.prn_reason ? `: ${sched.prn_reason}` : ''}`;
    case 'taper':
      return `Taper / titration${timeStr}${mealStr}`;
    default:
      return `${sched.schedule_type_id}${timeStr}${mealStr}`;
  }
};

function ScheduleManager({ med }: { med: MedicationDetail }) {
  const [open, setOpen] = useState(false);
  const [scheduleTypeId, setScheduleTypeId] = useState('daily');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [doseAmount, setDoseAmount] = useState('');
  const [withMeal, setWithMeal] = useState<string | null>(null);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [cycleOnDays, setCycleOnDays] = useState('7');
  const [cycleOffDays, setCycleOffDays] = useState('7');
  const [prnReason, setPrnReason] = useState('');
  const [prnMaxPerDay, setPrnMaxPerDay] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const addMutation = useAddScheduleMutation(med.id);
  const deleteMutation = useDeleteScheduleMutation();

  const handleSave = () => {
    const body: Partial<MedicationSchedule> & { schedule_type_id: string } = {
      schedule_type_id: scheduleTypeId,
      time_of_day: scheduleTypeId === 'prn' ? null : timeOfDay,
      dose_amount: doseAmount ? Number(doseAmount) : null,
      with_meal: withMeal || null,
      start_date: startDate || null,
      end_date: endDate || null,
    };

    if (scheduleTypeId === 'weekly') {
      body.days_of_week = daysOfWeek;
    } else if (scheduleTypeId === 'every_n_days') {
      body.interval_days = Number(intervalDays);
    } else if (scheduleTypeId === 'monthly') {
      body.day_of_month = Number(dayOfMonth);
    } else if (scheduleTypeId === 'cyclic') {
      body.cycle_on_days = Number(cycleOnDays);
      body.cycle_off_days = Number(cycleOffDays);
    } else if (scheduleTypeId === 'prn') {
      body.prn_reason = prnReason || null;
      body.prn_max_per_day = prnMaxPerDay ? Number(prnMaxPerDay) : null;
    }

    addMutation.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setScheduleTypeId('daily');
        setTimeOfDay('09:00');
        setDoseAmount('');
        setWithMeal(null);
        setDaysOfWeek([]);
        setIntervalDays('1');
        setDayOfMonth('1');
        setCycleOnDays('7');
        setCycleOffDays('7');
        setPrnReason('');
        setPrnMaxPerDay('');
        setStartDate('');
        setEndDate('');
      },
    });
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const DAYS = [
    { label: 'S', value: 0 },
    { label: 'M', value: 1 },
    { label: 'T', value: 2 },
    { label: 'W', value: 3 },
    { label: 'T', value: 4 },
    { label: 'F', value: 5 },
    { label: 'S', value: 6 },
  ];

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">
            Schedules & Reminders
          </CardTitle>
          <CardDescription>
            Configure reminders and intake rules
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Schedule Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Schedule Type</Label>
                <Select
                  value={scheduleTypeId}
                  onValueChange={setScheduleTypeId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">
                      Specific days of week
                    </SelectItem>
                    <SelectItem value="every_n_days">Every N days</SelectItem>
                    <SelectItem value="cyclic">Cyclic (on/off)</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="prn">As needed (PRN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleTypeId !== 'prn' && (
                <div className="space-y-2">
                  <Label htmlFor="time-of-day">Time of Day</Label>
                  <Input
                    id="time-of-day"
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                  />
                </div>
              )}

              {scheduleTypeId === 'weekly' && (
                <div className="space-y-2">
                  <Label>Days of Week</Label>
                  <div className="flex gap-2 justify-between">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`h-9 w-9 rounded-full text-xs font-semibold border transition ${
                          daysOfWeek.includes(day.value)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {scheduleTypeId === 'every_n_days' && (
                <div className="space-y-2">
                  <Label htmlFor="interval-days">Interval (Days)</Label>
                  <Input
                    id="interval-days"
                    type="number"
                    min="1"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              )}

              {scheduleTypeId === 'monthly' && (
                <div className="space-y-2">
                  <Label htmlFor="day-of-month">Day of Month (1-31)</Label>
                  <Input
                    id="day-of-month"
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </div>
              )}

              {scheduleTypeId === 'cyclic' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cycle-on">Days On</Label>
                    <Input
                      id="cycle-on"
                      type="number"
                      min="1"
                      value={cycleOnDays}
                      onChange={(e) => setCycleOnDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cycle-off">Days Off</Label>
                    <Input
                      id="cycle-off"
                      type="number"
                      min="1"
                      value={cycleOffDays}
                      onChange={(e) => setCycleOffDays(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {scheduleTypeId === 'prn' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prn-reason">Reason (Optional)</Label>
                    <Input
                      id="prn-reason"
                      placeholder="e.g. Pain"
                      value={prnReason}
                      onChange={(e) => setPrnReason(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prn-max">Max Doses / Day</Label>
                    <Input
                      id="prn-max"
                      type="number"
                      min="1"
                      placeholder="4"
                      value={prnMaxPerDay}
                      onChange={(e) => setPrnMaxPerDay(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dose-override">Dose Amount (Optional)</Label>
                  <Input
                    id="dose-override"
                    type="number"
                    step="any"
                    placeholder={med.dose_amount?.toString() || '1'}
                    value={doseAmount}
                    onChange={(e) => setDoseAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>With Meal</Label>
                  <Select
                    value={withMeal || 'none'}
                    onValueChange={(val) =>
                      setWithMeal(val === 'none' ? null : val)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any time</SelectItem>
                      <SelectItem value="before">Before meal</SelectItem>
                      <SelectItem value="with">With meal</SelectItem>
                      <SelectItem value="after">After meal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date (Optional)</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date (Optional)</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Saving...' : 'Add Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="pt-4">
        {!med.schedules || med.schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            No schedule rules configured yet.
          </p>
        ) : (
          <div className="space-y-3">
            {med.schedules.map((sched) => (
              <div
                key={sched.id}
                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="font-medium text-foreground">
                      {formatScheduleDescription(sched)}
                    </span>
                    {sched.dose_amount && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({sched.dose_amount}{' '}
                        {sched.dose_amount === 1
                          ? med.type_id
                          : `${med.type_id}s`}
                        )
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(sched.id)}
                  disabled={deleteMutation.isPending}
                  aria-label="Delete schedule rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Medications() {
  const [activeTab, setActiveTab] = useState<'today' | 'cabinet'>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInZone(timezone);

  const { data: meds = [], isLoading: loadingMeds } = useMedications({
    activeOnly: false,
  });
  const { data: entries = [], isLoading: loadingEntries } =
    useMedicationEntries({
      fromDate: today,
      toDate: today,
    });

  const removeMedMutation = useDeleteMedicationMutation();
  const createEntryMutation = useCreateMedicationEntryMutation();
  const deleteEntryMutation = useDeleteMedicationEntryMutation();

  const handleDeleteMed = (id: string) =>
    removeMedMutation.mutate(id, { onSuccess: () => setSelectedId(null) });

  const selected =
    (meds.find((m) => m.id === selectedId) as MedicationDetail) ?? null;

  const dueDoses = useMemo(() => {
    if (loadingMeds || meds.length === 0) return [];
    return getDueDosesForDate(meds, today);
  }, [meds, today, loadingMeds]);

  const prnMeds = useMemo(() => {
    return meds.filter((m) => {
      if (!m.is_active) return false;
      if (!m.schedules || m.schedules.length === 0) return true;
      return m.schedules.some(
        (s: MedicationSchedule) => s.schedule_type_id === 'prn'
      );
    });
  }, [meds]);

  const completedDosesCount = useMemo(() => {
    return dueDoses.filter((due) =>
      entries.some(
        (e) =>
          e.schedule_id === due.schedule.id &&
          (e.status === 'taken' || e.status === 'skipped')
      )
    ).length;
  }, [dueDoses, entries]);

  const progressPercentage =
    dueDoses.length > 0
      ? Math.round((completedDosesCount / dueDoses.length) * 100)
      : 100;

  const handleLogScheduled = (
    due: (typeof dueDoses)[0],
    status: 'taken' | 'skipped' | 'snoozed'
  ) => {
    let scheduledFor = null;
    if (due.schedule.time_of_day) {
      try {
        const { start } = dayToUtcRange(today, timezone);
        const [h, m] = due.schedule.time_of_day.split(':');
        scheduledFor = new Date(
          start.getTime() +
            parseInt(h || '0', 10) * 3600000 +
            parseInt(m || '0', 10) * 60000
        ).toISOString();
      } catch (e) {
        console.error(e);
      }
    }

    createEntryMutation.mutate({
      medication_id: due.medication.id,
      schedule_id: due.schedule.id,
      status,
      taken_at: new Date().toISOString(),
      scheduled_for: scheduledFor,
      entry_date: today,
    });
  };

  const handleLogPrn = (med: MedicationDetail) => {
    const prnSched = med.schedules?.find((s) => s.schedule_type_id === 'prn');
    createEntryMutation.mutate({
      medication_id: med.id,
      schedule_id: prnSched?.id || null,
      status: 'prn_taken',
      taken_at: new Date().toISOString(),
      entry_date: today,
    });
  };

  const handleUndoEntry = (entryId: string) => {
    deleteEntryMutation.mutate(entryId);
  };

  const formatEntryTime = (timestamp: string) => {
    try {
      const parts = Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).formatToParts(new Date(timestamp));

      let hour = '';
      let minute = '';
      let dayPeriod = '';
      for (const p of parts) {
        if (p.type === 'hour') hour = p.value;
        if (p.type === 'minute') minute = p.value;
        if (p.type === 'dayPeriod') dayPeriod = p.value;
      }
      return `${hour}:${minute} ${dayPeriod}`;
    } catch (e) {
      return '--:--';
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-4">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Pill className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Medications</h1>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md p-0.5 bg-muted/50">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-sm transition ${
                activeTab === 'today'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveTab('cabinet')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-sm transition ${
                activeTab === 'cabinet'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cabinet
            </button>
          </div>
          <AddMedicationDialog />
        </div>
      </div>

      {activeTab === 'today' && (
        <div className="space-y-6">
          {/* Progress Banner */}
          <Card className="bg-gradient-to-r from-blue-500/10 to-teal-500/10 border border-blue-500/20 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-500" /> Today's
                  Checklist
                </CardTitle>
                <CardDescription className="mt-1">
                  {dueDoses.length === 0
                    ? 'No scheduled doses for today.'
                    : `${completedDosesCount} of ${dueDoses.length} doses logged today.`}
                </CardDescription>
              </div>
              {dueDoses.length > 0 && (
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="w-full bg-muted rounded-full h-2.5 max-w-[200px] overflow-hidden">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-semibold">
                    {progressPercentage}%
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-[1fr_350px]">
            {/* Scheduled & PRN Column */}
            <div className="space-y-6">
              {/* Checklist */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Scheduled Doses
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingMeds && (
                    <p className="text-sm text-muted-foreground">
                      Loading checklist…
                    </p>
                  )}
                  {!loadingMeds && dueDoses.length === 0 && (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      No medication doses scheduled for today. Add a schedule in
                      the Cabinet view.
                    </div>
                  )}
                  {!loadingMeds &&
                    dueDoses.map((due, idx) => {
                      const entry = entries.find(
                        (e) => e.schedule_id === due.schedule.id
                      );
                      const isLogged =
                        entry &&
                        (entry.status === 'taken' ||
                          entry.status === 'skipped');
                      const isSnoozed = entry && entry.status === 'snoozed';

                      return (
                        <div
                          key={`${due.medication.id}-${due.schedule.id}-${idx}`}
                          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border rounded-lg transition-all ${
                            isLogged
                              ? 'bg-muted/30 border-muted text-muted-foreground'
                              : isSnoozed
                                ? 'border-amber-200 bg-amber-50/20'
                                : 'bg-card border-border hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              {isLogged && entry.status === 'taken' ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              ) : isLogged && entry.status === 'skipped' ? (
                                <X className="h-5 w-5 text-muted-foreground" />
                              ) : due.medication.is_glp1 ? (
                                <Syringe className="h-5 w-5 text-blue-500" />
                              ) : (
                                <Pill className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p
                                className={`font-semibold text-sm ${isLogged ? 'line-through' : ''}`}
                              >
                                {due.medication.display_name ||
                                  due.medication.name}
                              </p>
                              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground mt-0.5">
                                <span>
                                  {due.schedule.dose_amount ||
                                    due.medication.strength_value}{' '}
                                  {due.schedule.dose_amount
                                    ? due.medication.type_id
                                    : due.medication.strength_unit}
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-medium text-primary">
                                  <Clock className="h-3 w-3" />
                                  {due.schedule.time_of_day
                                    ? due.schedule.time_of_day.substring(0, 5)
                                    : 'Any time'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 mt-3 sm:mt-0 shrink-0">
                            {isLogged && entry ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs hover:bg-destructive/10 hover:text-destructive flex items-center gap-1"
                                onClick={() => handleUndoEntry(entry.id)}
                                disabled={deleteEntryMutation.isPending}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Undo
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                                  onClick={() =>
                                    handleLogScheduled(due, 'snoozed')
                                  }
                                  disabled={
                                    createEntryMutation.isPending || isSnoozed
                                  }
                                >
                                  {isSnoozed ? 'Snoozed' : 'Snooze'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-muted-foreground hover:bg-muted"
                                  onClick={() =>
                                    handleLogScheduled(due, 'skipped')
                                  }
                                  disabled={createEntryMutation.isPending}
                                >
                                  Skip
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() =>
                                    handleLogScheduled(due, 'taken')
                                  }
                                  disabled={createEntryMutation.isPending}
                                >
                                  Take
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>

              {/* PRN Log */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Log As Needed (PRN)
                  </CardTitle>
                  <CardDescription>
                    Log medications that are taken as required rather than on a
                    fixed schedule
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingMeds && (
                    <p className="text-sm text-muted-foreground">
                      Loading active medications…
                    </p>
                  )}
                  {!loadingMeds && prnMeds.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2 text-center">
                      No PRN or non-scheduled medications configured.
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {prnMeds.map((med) => (
                      <Button
                        key={med.id}
                        variant="outline"
                        className="justify-start h-12 flex items-center gap-3"
                        onClick={() => handleLogPrn(med as MedicationDetail)}
                        disabled={createEntryMutation.isPending}
                      >
                        {med.is_glp1 ? (
                          <Syringe className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                        ) : (
                          <Pill className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="text-left truncate">
                          <p className="font-semibold text-xs truncate">
                            {med.display_name || med.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {med.strength_value
                              ? `${med.strength_value} ${med.strength_unit ?? ''}`
                              : med.type_id}
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Today Activity Log Column */}
            <div>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Today's Intake History
                  </CardTitle>
                  <CardDescription>Logged history for today</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingEntries && (
                    <p className="text-sm text-muted-foreground">
                      Loading history…
                    </p>
                  )}
                  {!loadingEntries && entries.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No entries logged yet today.
                    </div>
                  )}
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/10 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {entry.med_name_snapshot}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span className="tabular-nums font-medium">
                            {formatEntryTime(entry.taken_at)}
                          </span>
                          <span>•</span>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 border-none font-semibold ${
                              entry.status === 'taken'
                                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                : entry.status === 'prn_taken'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : entry.status === 'snoozed'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-850 dark:text-gray-300'
                            }`}
                          >
                            {entry.status === 'taken'
                              ? 'Taken'
                              : entry.status === 'prn_taken'
                                ? 'PRN Taken'
                                : entry.status === 'snoozed'
                                  ? 'Snoozed'
                                  : 'Skipped'}
                          </Badge>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleUndoEntry(entry.id)}
                        disabled={deleteEntryMutation.isPending}
                        aria-label="Remove entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cabinet' && (
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          {/* Medications list */}
          <div className="space-y-3">
            {loadingMeds && (
              <p className="text-sm text-muted-foreground">
                Loading medications…
              </p>
            )}
            {!loadingMeds && meds.length === 0 && (
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
                    {med.is_glp1 ? (
                      <Syringe className="h-5 w-5 text-blue-500" />
                    ) : (
                      <Pill className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">
                        {med.display_name || med.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {med.strength_value
                          ? `${med.strength_value} ${med.strength_unit ?? ''}`
                          : med.type_id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {med.is_glp1 && <Badge variant="secondary">GLP-1</Badge>}
                    {med.schedules && med.schedules.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] flex items-center gap-1"
                      >
                        <Clock className="h-2.5 w-2.5" /> {med.schedules.length}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Details pane */}
          <div>
            {!selected && (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Select a medication to view details and schedules.
                </CardContent>
              </Card>
            )}
            {selected && (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>
                        {selected.display_name || selected.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {selected.strength_value
                          ? `${selected.strength_value} ${selected.strength_unit ?? ''}`
                          : selected.type_id}
                        {selected.reason_text
                          ? ` · ${selected.reason_text}`
                          : ''}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMed(selected.id)}
                      disabled={removeMedMutation.isPending}
                      aria-label="Delete medication"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardHeader>
                  {selected.notes && (
                    <CardContent className="text-sm text-muted-foreground border-t pt-4">
                      <p className="font-medium text-foreground mb-1">Notes</p>
                      <p>{selected.notes}</p>
                    </CardContent>
                  )}
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
                          Adherence Adherence Overview
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        Schedules and daily checklists for non-GLP-1 medications
                        are fully active. Manage schedule rules below, and log
                        daily intake from the <strong>Today</strong> tab.
                      </CardContent>
                    </Card>
                    <ScheduleManager med={selected} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
