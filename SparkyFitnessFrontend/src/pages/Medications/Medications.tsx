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
  AlertCircle,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  GLP1_DRUG_PROFILES,
  todayInZone,
  dayToUtcRange,
  getDueDosesForDate,
  BUILT_IN_SYMPTOMS,
  getSymptomPatternHints,
  addDays,
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
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
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
import {
  useCustomSymptoms,
  useCreateCustomSymptomMutation,
  useDeleteCustomSymptomMutation,
  useSymptomEntries,
  useCreateSymptomEntryMutation,
  useDeleteSymptomEntryMutation,
} from '@/hooks/useSymptoms';
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
  const [prescriber, setPrescriber] = useState('');
  const [pharmacy, setPharmacy] = useState('');
  const [rxNumber, setRxNumber] = useState('');
  const [reason, setReason] = useState('');

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
      prescriber: prescriber.trim() || null,
      pharmacy: pharmacy.trim() || null,
      rx_number: rxNumber.trim() || null,
      reason_text: reason.trim() || null,
      custom_fields: isGlp1 ? { glp1_drug: glp1Drug } : {},
    };
    mutation.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setName('');
        setPrescriber('');
        setPharmacy('');
        setRxNumber('');
        setReason('');
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
          <div className="space-y-2">
            <Label htmlFor="med-reason">Reason / condition (optional)</Label>
            <Input
              id="med-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Weight management, Type 2 diabetes"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="med-prescriber">Prescriber (optional)</Label>
              <Input
                id="med-prescriber"
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                placeholder="Dr. Chen"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="med-pharmacy">Pharmacy (optional)</Label>
              <Input
                id="med-pharmacy"
                value={pharmacy}
                onChange={(e) => setPharmacy(e.target.value)}
                placeholder="CVS #4421"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-rx">Rx number (optional)</Label>
            <Input
              id="med-rx"
              value={rxNumber}
              onChange={(e) => setRxNumber(e.target.value)}
              placeholder="Rx-482-93221"
            />
          </div>
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

const BRISTOL_TYPES = [
  {
    type: 1,
    label: 'Type 1',
    desc: 'Separate hard lumps, like nuts (constipation)',
    color: 'border-red-300 bg-red-50/20',
  },
  {
    type: 2,
    label: 'Type 2',
    desc: 'Sausage-shaped but lumpy (mild constipation)',
    color: 'border-orange-300 bg-orange-50/20',
  },
  {
    type: 3,
    label: 'Type 3',
    desc: 'Like a sausage but with cracks on surface (normal)',
    color: 'border-green-300 bg-green-50/10',
  },
  {
    type: 4,
    label: 'Type 4',
    desc: 'Like a sausage or snake, smooth and soft (optimal)',
    color: 'border-emerald-300 bg-emerald-50/20',
  },
  {
    type: 5,
    label: 'Type 5',
    desc: 'Soft blobs with clear-cut edges (lacks fiber)',
    color: 'border-blue-200 bg-blue-50/10',
  },
  {
    type: 6,
    label: 'Type 6',
    desc: 'Fluffy pieces with ragged edges, mushy (mild diarrhea)',
    color: 'border-yellow-300 bg-yellow-50/20',
  },
  {
    type: 7,
    label: 'Type 7',
    desc: 'Watery, no solid pieces, entirely liquid (diarrhea)',
    color: 'border-red-400 bg-red-100/10',
  },
];

const SYMPTOM_EMOJI: Record<string, string> = {
  nausea: '🤢',
  fatigue: '😮‍💨',
  headache: '🤕',
  constipation: '🚽',
  diarrhea: '💧',
  vomiting: '🤮',
  acid_reflux: '🔥',
  stomach_pain: '😖',
  dizziness: '💫',
};

export default function Medications() {
  const [activeTab, setActiveTab] = useState<'today' | 'cabinet' | 'symptoms'>(
    'today'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Symptoms tracking state
  const [symptomName, setSymptomName] = useState('nausea');
  const [customSymptomInput, setCustomSymptomInput] = useState('');
  const [severity, setSeverity] = useState([5]);
  const [bodyLocation, setBodyLocation] = useState('general');
  const [contextText, setContextText] = useState('');
  const [bristolType, setBristolType] = useState<number | null>(null);
  const [linkedMedId, setLinkedMedId] = useState<string | null>(null);
  const [symptomCustomOpen, setSymptomCustomOpen] = useState(false);
  const [customSymptomDisplayName, setCustomSymptomDisplayName] = useState('');

  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInZone(timezone);
  const thirtyDaysAgo = addDays(today, -30);

  // Queries
  const { data: meds = [], isLoading: loadingMeds } = useMedications({
    activeOnly: false,
  });

  const { data: entries = [], isLoading: loadingEntries } =
    useMedicationEntries({
      fromDate: today,
      toDate: today,
    });

  const { data: recentEntries = [] } = useMedicationEntries({
    fromDate: thirtyDaysAgo,
    toDate: today,
  });

  const { data: customSymptoms = [] } = useCustomSymptoms();
  const { data: symptomLogs = [], isLoading: loadingSymptoms } =
    useSymptomEntries({
      fromDate: thirtyDaysAgo,
      toDate: today,
    });

  // Mutations
  const removeMedMutation = useDeleteMedicationMutation();
  const createEntryMutation = useCreateMedicationEntryMutation();
  const deleteEntryMutation = useDeleteMedicationEntryMutation();

  const createCustomSymptomMutation = useCreateCustomSymptomMutation();
  const deleteCustomSymptomMutation = useDeleteCustomSymptomMutation();
  const createSymptomEntryMutation = useCreateSymptomEntryMutation();
  const deleteSymptomEntryMutation = useDeleteSymptomEntryMutation();

  const handleDeleteMed = (id: string) =>
    removeMedMutation.mutate(id, { onSuccess: () => setSelectedId(null) });

  const selected =
    (meds.find((m) => m.id === selectedId) as MedicationDetail) ?? null;

  // Schedules evaluation
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

  // True 14-day adherence: evaluate each day's scheduled doses vs. what was taken.
  const adherence14 = useMemo(() => {
    let due = 0;
    let taken = 0;
    let perfectDays = 0;
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const dayDue = getDueDosesForDate(meds, d);
      if (dayDue.length === 0) continue;
      let dayTaken = 0;
      for (const dd of dayDue) {
        const hit = recentEntries.some(
          (e) =>
            e.schedule_id === dd.schedule.id &&
            e.entry_date === d &&
            (e.status === 'taken' || e.status === 'prn_taken')
        );
        if (hit) dayTaken++;
      }
      due += dayDue.length;
      taken += dayTaken;
      if (dayTaken === dayDue.length) perfectDays++;
    }
    return {
      due,
      taken,
      perfectDays,
      pct: due > 0 ? Math.round((taken / due) * 100) : 100,
    };
  }, [meds, today, recentEntries]);

  // The next GLP-1 dose due today (if any), for the next-injection banner.
  const nextGlpDue = useMemo(
    () => dueDoses.find((d) => d.medication.is_glp1) ?? null,
    [dueDoses]
  );

  // Pattern Correlation Calculations
  const patternDoses = useMemo(() => {
    return recentEntries
      .filter((e) => e.status === 'taken' || e.status === 'prn_taken')
      .map((e) => ({
        injected_at: e.taken_at,
        dose_mg: e.dose_amount_snapshot,
        medication_name: e.med_name_snapshot ?? undefined,
      }));
  }, [recentEntries]);

  const patternHints = useMemo(() => {
    return getSymptomPatternHints(patternDoses, symptomLogs);
  }, [patternDoses, symptomLogs]);

  // Combined built-in and custom symptoms list
  const allSymptomOptions = useMemo(() => {
    const list = BUILT_IN_SYMPTOMS.map((s) => ({
      id: s.name,
      name: s.name,
      displayName: s.displayName,
      isGlp1: s.isGlp1,
    }));
    customSymptoms.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name,
        displayName: s.display_name || s.name,
        isGlp1: s.is_glp1_flagged,
      });
    });
    return list;
  }, [customSymptoms]);

  // Calendar rendering helper: build past 30 days
  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const dStr = addDays(today, -i);
      const logsForDay = symptomLogs.filter((l) => l.entry_date === dStr);
      days.push({
        dateString: dStr,
        dayLabel: dStr.substring(8, 10),
        logs: logsForDay,
        maxSeverity:
          logsForDay.length > 0
            ? Math.max(...logsForDay.map((l) => l.severity))
            : 0,
      });
    }
    return days;
  }, [today, symptomLogs]);

  // GI sub-tracker: real per-week rates over the loaded 30-day window.
  const giStats = useMemo(() => {
    const weeks = 30 / 7;
    const rate = (needle: string) =>
      (
        symptomLogs.filter((l) =>
          l.symptom_name_snapshot.toLowerCase().includes(needle)
        ).length / weeks
      ).toFixed(1);
    const bristolLogs = symptomLogs.filter((l) => l.bristol_type != null);
    const avgBristol = bristolLogs.length
      ? (
          bristolLogs.reduce((s, l) => s + (l.bristol_type ?? 0), 0) /
          bristolLogs.length
        ).toFixed(1)
      : '—';
    return {
      nausea: rate('nausea'),
      vomiting: rate('vomit'),
      reflux: rate('reflux'),
      avgBristol,
    };
  }, [symptomLogs]);

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

  const handleCreateCustomSymptom = () => {
    if (!customSymptomInput.trim()) return;
    createCustomSymptomMutation.mutate(
      {
        name: customSymptomInput.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name:
          customSymptomDisplayName.trim() || customSymptomInput.trim(),
        scale_type: '1-10',
        is_glp1_flagged: false,
      },
      {
        onSuccess: () => {
          setSymptomCustomOpen(false);
          setSymptomName(
            customSymptomInput.trim().toLowerCase().replace(/\s+/g, '_')
          );
          setCustomSymptomInput('');
          setCustomSymptomDisplayName('');
        },
      }
    );
  };

  const handleLogSymptom = () => {
    const selectedOpt = allSymptomOptions.find((s) => s.name === symptomName);
    const snapName = selectedOpt ? selectedOpt.displayName : symptomName;

    let severityLabel = 'Moderate';
    const val = severity[0] ?? 5;
    if (val <= 3) severityLabel = 'Mild';
    else if (val >= 7) severityLabel = 'Severe';

    createSymptomEntryMutation.mutate(
      {
        medication_id: linkedMedId || null,
        symptom_id:
          selectedOpt && selectedOpt.id !== selectedOpt.name
            ? selectedOpt.id
            : null,
        symptom_name_snapshot: snapName,
        severity: val,
        severity_label: severityLabel,
        body_location: bodyLocation,
        context_text: contextText || null,
        bristol_type: ['constipation', 'diarrhea'].includes(symptomName)
          ? bristolType
          : null,
        entry_date: today,
        logged_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setContextText('');
          setBristolType(null);
          setLinkedMedId(null);
          setBodyLocation('general');
        },
      }
    );
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
            <button
              onClick={() => setActiveTab('symptoms')}
              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-sm transition ${
                activeTab === 'symptoms'
                  ? 'bg-background shadow text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Symptoms
            </button>
          </div>
          <AddMedicationDialog />
        </div>
      </div>

      {activeTab === 'today' && (
        <div className="space-y-6">
          {/* Next GLP-1 injection banner */}
          {nextGlpDue && (
            <Card className="border-blue-500/30 bg-blue-50/40 dark:bg-blue-950/20">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <Syringe className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-semibold">
                      {nextGlpDue.medication.display_name ||
                        nextGlpDue.medication.name}{' '}
                      injection — due today
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {nextGlpDue.schedule.time_of_day
                        ? `Scheduled ${nextGlpDue.schedule.time_of_day.substring(0, 5)}`
                        : 'Any time today'}
                    </p>
                  </div>
                </div>
                {!entries.some(
                  (e) =>
                    e.schedule_id === nextGlpDue.schedule.id &&
                    (e.status === 'taken' || e.status === 'skipped')
                ) && (
                  <Button
                    size="sm"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => handleLogScheduled(nextGlpDue, 'taken')}
                    disabled={createEntryMutation.isPending}
                  >
                    Log shot
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Today stats + 14-day adherence ring */}
          <Card>
            <CardContent className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:justify-between">
              <div className="grid w-full grid-cols-3 gap-3">
                {[
                  {
                    label: 'Doses today',
                    value: `${completedDosesCount}/${dueDoses.length}`,
                  },
                  { label: '14-day adherence', value: `${adherence14.pct}%` },
                  {
                    label: 'Perfect days (14d)',
                    value: String(adherence14.perfectDays),
                  },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="rounded-lg border p-3 text-center"
                  >
                    <p className="text-xl font-bold tabular-nums">{t.value}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.label}
                    </p>
                  </div>
                ))}
              </div>
              <div className="relative h-24 w-24 shrink-0">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    className="stroke-muted"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    strokeDasharray={`${adherence14.pct}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">
                    {adherence14.pct}%
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    14-day
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

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
        <div className="space-y-6">
          {/* KPI tiles (real counts only — no cost) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: 'Active scripts',
                value: meds.filter((m) => m.is_active).length,
                Icon: Pill,
                color: 'text-primary',
              },
              {
                label: 'GLP-1 meds',
                value: meds.filter((m) => m.is_glp1).length,
                Icon: Syringe,
                color: 'text-blue-500',
              },
              {
                label: 'Scheduled today',
                value: dueDoses.length,
                Icon: Clock,
                color: 'text-amber-500',
              },
              {
                label: 'Total meds',
                value: meds.length,
                Icon: Activity,
                color: 'text-muted-foreground',
              },
            ].map((tile) => (
              <Card key={tile.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <tile.Icon className={`h-5 w-5 ${tile.color}`} />
                  <div>
                    <p className="text-xl font-bold tabular-nums">
                      {tile.value}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tile.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

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
                              <span className="truncate">{med.prescriber}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {med.is_glp1 && <Badge variant="secondary">GLP-1</Badge>}
                      {med.schedules && med.schedules.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] flex items-center gap-1"
                        >
                          <Clock className="h-2.5 w-2.5" />{' '}
                          {med.schedules.length}
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
                        <p className="font-medium text-foreground mb-1">
                          Notes
                        </p>
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
        <div className="space-y-6">
          {/* Main layout grid for symptoms dashboard */}
          <div className="grid gap-6 md:grid-cols-[400px_1fr]">
            {/* Left Column: Log Form & Custom Manager */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Activity className="h-5 w-5 text-red-500" /> Log Symptom
                  </CardTitle>
                  <CardDescription>
                    Log severity and physical context of your side effects
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Select Symptom */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Symptom</Label>
                      <Dialog
                        open={symptomCustomOpen}
                        onOpenChange={setSymptomCustomOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-primary flex items-center gap-0.5"
                          >
                            <Plus className="h-3 w-3" /> Custom
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Custom Symptom</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="space-y-2">
                              <Label htmlFor="custom-sym-name">
                                Symptom Name (internal)
                              </Label>
                              <Input
                                id="custom-sym-name"
                                value={customSymptomInput}
                                onChange={(e) =>
                                  setCustomSymptomInput(e.target.value)
                                }
                                placeholder="e.g. skin_rash"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="custom-sym-disp">
                                Display Label
                              </Label>
                              <Input
                                id="custom-sym-disp"
                                value={customSymptomDisplayName}
                                onChange={(e) =>
                                  setCustomSymptomDisplayName(e.target.value)
                                }
                                placeholder="e.g. Skin Rash"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleCreateCustomSymptom}
                              disabled={createCustomSymptomMutation.isPending}
                            >
                              Save Custom Symptom
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {allSymptomOptions.map((opt) => {
                        const active = symptomName === opt.name;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSymptomName(opt.name)}
                            className={`relative flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                              active
                                ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                : 'border-border hover:bg-muted'
                            }`}
                          >
                            <span className="text-xl leading-none">
                              {SYMPTOM_EMOJI[opt.name] ?? '📝'}
                            </span>
                            <span className="text-[11px] font-medium leading-tight">
                              {opt.displayName}
                            </span>
                            {opt.isGlp1 && (
                              <span
                                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500"
                                title="Common on GLP-1"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Severity Slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label>Severity</Label>
                      <span className="text-sm font-semibold tabular-nums text-red-500">
                        {severity[0]} / 10
                      </span>
                    </div>
                    <Slider
                      value={severity}
                      onValueChange={setSeverity}
                      min={1}
                      max={10}
                      step={1}
                      className="py-1"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
                      <span>Mild (1-3)</span>
                      <span>Moderate (4-6)</span>
                      <span>Severe (7-10)</span>
                    </div>
                  </div>

                  {/* Body Location Pin */}
                  <div className="space-y-2">
                    <Label>Primary Location</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'general',
                        'head',
                        'abdomen',
                        'chest',
                        'back',
                        'muscles',
                        'joints',
                      ].map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setBodyLocation(loc)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            bodyLocation === loc
                              ? 'bg-red-500/10 text-red-600 border-red-500/30 font-medium'
                              : 'bg-background hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {loc.charAt(0).toUpperCase() + loc.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bristol Stool Scale (Only if constipation/diarrhea selected) */}
                  {['constipation', 'diarrhea'].includes(symptomName) && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />{' '}
                        Bowel Log (Bristol Stool Scale)
                      </Label>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Select the stool type that best describes the event:
                      </p>
                      <div className="grid grid-cols-7 gap-1">
                        {[1, 2, 3, 4, 5, 6, 7].map((type) => {
                          const typeDef = BRISTOL_TYPES.find(
                            (b) => b.type === type
                          );
                          const isSelected = bristolType === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setBristolType(type)}
                              title={typeDef?.desc}
                              className={`h-9 border rounded flex flex-col items-center justify-center text-xs font-bold transition ${
                                isSelected
                                  ? 'bg-red-500/20 text-red-700 border-red-500'
                                  : 'bg-background hover:bg-muted text-muted-foreground'
                              }`}
                            >
                              T{type}
                            </button>
                          );
                        })}
                      </div>
                      {bristolType && (
                        <p className="text-[10px] mt-1.5 text-red-600 font-medium bg-red-50/50 p-1 border border-red-100 rounded text-center">
                          {
                            BRISTOL_TYPES.find((b) => b.type === bristolType)
                              ?.desc
                          }
                        </p>
                      )}
                    </div>
                  )}

                  {/* Optional Linked Medication */}
                  <div className="space-y-2">
                    <Label htmlFor="linked-med">
                      Link to Medication (Optional)
                    </Label>
                    <Select
                      value={linkedMedId || 'none'}
                      onValueChange={(val) =>
                        setLinkedMedId(val === 'none' ? null : val)
                      }
                    >
                      <SelectTrigger id="linked-med">
                        <SelectValue placeholder="No medication linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No medication linked
                        </SelectItem>
                        {meds.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.display_name || m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Context Text */}
                  <div className="space-y-2">
                    <Label htmlFor="symptom-notes">Context / Notes</Label>
                    <Textarea
                      id="symptom-notes"
                      placeholder="e.g. Occurred 4 hours after taking my dinner dose."
                      value={contextText}
                      onChange={(e) => setContextText(e.target.value)}
                      className="resize-none h-16 text-xs"
                    />
                  </div>

                  <Button
                    onClick={handleLogSymptom}
                    disabled={createSymptomEntryMutation.isPending}
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    {createSymptomEntryMutation.isPending
                      ? 'Logging…'
                      : 'Log Symptom'}
                  </Button>
                </CardContent>
              </Card>

              {/* Manage Custom Symptoms deletion */}
              {customSymptoms.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-semibold">
                      Custom Symptoms Cabinet
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 max-h-40 overflow-y-auto">
                    {customSymptoms.map((sym) => (
                      <div
                        key={sym.id}
                        className="flex justify-between items-center py-1 text-xs border-b last:border-0"
                      >
                        <span className="font-medium text-foreground">
                          {sym.display_name || sym.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            deleteCustomSymptomMutation.mutate(sym.id)
                          }
                          disabled={deleteCustomSymptomMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Calendar, Pattern Hints, and Logs */}
            <div className="space-y-6">
              {/* GI sub-tracker (real rates over the last 30 days) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    GI sub-tracker
                  </CardTitle>
                  <CardDescription>
                    Per-week rates over the last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Nausea / wk', value: giStats.nausea },
                      { label: 'Vomiting / wk', value: giStats.vomiting },
                      { label: 'Reflux / wk', value: giStats.reflux },
                      { label: 'Avg Bristol', value: giStats.avgBristol },
                    ].map((t) => (
                      <div
                        key={t.label}
                        className="rounded-lg border p-3 text-center"
                      >
                        <p className="text-xl font-bold tabular-nums">
                          {t.value}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Pattern Hints Card */}
              {patternHints.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShieldAlert className="h-4.5 w-4.5 text-amber-500 animate-pulse" />{' '}
                      Side-Effect Insights & Hints
                    </CardTitle>
                    <CardDescription>
                      Pharmacokinetic correlations overlaying recent dose
                      timings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {patternHints.map((hint, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-sm flex gap-3 ${
                          hint.severityLevel === 'high'
                            ? 'bg-red-50/30 border-red-200 text-red-800'
                            : 'bg-amber-50/40 border-amber-200 text-amber-900'
                        }`}
                      >
                        <AlertCircle
                          className={`h-5 w-5 shrink-0 ${hint.severityLevel === 'high' ? 'text-red-500' : 'text-amber-500'}`}
                        />
                        <div>
                          <p className="font-semibold text-xs leading-none capitalize mb-1">
                            {hint.symptomName.replace(/_/g, ' ')} Correlation
                          </p>
                          <p className="text-xs leading-relaxed">
                            {hint.message}
                          </p>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 mt-1">
                      <Info className="h-3 w-3" /> Insights are calculated over
                      a rolling 30-day window. These are educational
                      estimations, not clinical advice.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Symptom History Calendar */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    Symptom Activity Calendar
                  </CardTitle>
                  <CardDescription>
                    Symptom logging frequency and severity over the past 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-10 gap-2">
                    {calendarDays.map((day) => {
                      let colorClass = 'bg-muted/30 border-muted';
                      if (day.logs.length > 0) {
                        const sev = day.maxSeverity;
                        if (sev <= 3)
                          colorClass =
                            'bg-green-500/20 border-green-400 text-green-700';
                        else if (sev <= 6)
                          colorClass =
                            'bg-amber-500/20 border-amber-400 text-amber-700';
                        else
                          colorClass =
                            'bg-red-500/20 border-red-400 text-red-700 font-bold';
                      }

                      return (
                        <div
                          key={day.dateString}
                          title={`${day.dateString}: ${day.logs.length} logged, max severity ${day.maxSeverity}`}
                          className={`aspect-square rounded border flex flex-col items-center justify-center text-xs transition-all relative group cursor-pointer ${colorClass}`}
                        >
                          <span>{day.dayLabel}</span>
                          {day.logs.length > 0 && (
                            <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-foreground/45"></span>
                          )}
                          {/* Tooltip on hover */}
                          <div className="absolute z-10 hidden group-hover:block bg-popover border text-popover-foreground text-[10px] p-2 rounded shadow-md -top-16 left-1/2 -translate-x-1/2 w-32 text-center">
                            <p className="font-semibold">{day.dateString}</p>
                            <p>
                              {day.logs.length} logged symptom
                              {day.logs.length === 1 ? '' : 's'}
                            </p>
                            {day.maxSeverity > 0 && (
                              <p>Max severity: {day.maxSeverity}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 justify-center mt-4 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded bg-muted/40 border"></span>{' '}
                      Clear
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded bg-green-500/20 border border-green-400"></span>{' '}
                      Mild (1-3)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded bg-amber-500/20 border border-amber-400"></span>{' '}
                      Moderate (4-6)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded bg-red-500/20 border border-red-400"></span>{' '}
                      Severe (7-10)
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Symptom Log Entries List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Logged Symptom Logs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingSymptoms && (
                    <p className="text-sm text-muted-foreground">
                      Loading logs…
                    </p>
                  )}
                  {!loadingSymptoms && symptomLogs.length === 0 && (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      No symptom entries logged in the past 30 days. Use the log
                      form to record symptoms.
                    </div>
                  )}
                  {symptomLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start justify-between p-3 rounded-lg border bg-muted/10 text-sm hover:shadow-xs transition"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground capitalize">
                            {log.symptom_name_snapshot.replace(/_/g, ' ')}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] border-none font-semibold ${
                              log.severity <= 3
                                ? 'bg-green-100 text-green-800'
                                : log.severity <= 6
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            Severity: {log.severity}
                          </Badge>
                          {log.bristol_type && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-brown-600 border-brown-200"
                            >
                              Bristol Type {log.bristol_type}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {log.entry_date} at {formatEntryTime(log.logged_at)}
                          </span>
                          {log.body_location && (
                            <>
                              <span>•</span>
                              <span className="capitalize">
                                {log.body_location}
                              </span>
                            </>
                          )}
                        </div>
                        {log.context_text && (
                          <p className="text-xs text-muted-foreground bg-background p-1.5 rounded border border-muted mt-1 leading-relaxed italic">
                            "{log.context_text}"
                          </p>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          deleteSymptomEntryMutation.mutate(log.id)
                        }
                        disabled={deleteSymptomEntryMutation.isPending}
                        aria-label="Remove symptom log"
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
    </div>
  );
}
