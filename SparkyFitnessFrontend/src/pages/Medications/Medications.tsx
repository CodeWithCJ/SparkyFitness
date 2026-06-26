import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useSearchParams } from 'react-router-dom';
import DayNavigator from '@/components/DayNavigator';
import {
  Pill,
  Syringe,
  Tablets,
  FlaskConical,
  Bandage,
  SprayCan,
  Pipette,
  Droplets,
  Package,
  Plus,
  Trash2,
  Pencil,
  Calendar,
  X,
  Clock,
  Activity,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Info,
  ShieldAlert,
  type LucideIcon,
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
  useUpdateMedicationMutation,
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
  useCustomLocations,
  useCreateCustomLocationMutation,
  useDeleteCustomLocationMutation,
  useSymptomEntries,
  useCreateSymptomEntryMutation,
  useDeleteSymptomEntryMutation,
} from '@/hooks/useSymptoms';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication, MedicationSchedule } from '@/types/medications';
import Glp1Coach from './Glp1Coach';
import GlpDailyCheckIn from './GlpDailyCheckIn';

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
  'suppository',
  'other',
];

// Icon + color per medication form/type — used in the type dropdown and on med cards.
const MED_TYPE_ICONS: Record<string, LucideIcon> = {
  pill: Pill,
  tablet: Tablets,
  capsule: Pill,
  liquid: FlaskConical,
  injection: Syringe,
  patch: Bandage,
  inhaler: SprayCan,
  drops: Pipette,
  cream: Droplets,
  suppository: Pill,
  other: Package,
};

const MED_TYPE_COLORS: Record<string, string> = {
  pill: 'text-rose-500',
  tablet: 'text-amber-500',
  capsule: 'text-orange-500',
  liquid: 'text-cyan-500',
  injection: 'text-blue-500',
  patch: 'text-violet-500',
  inhaler: 'text-teal-500',
  drops: 'text-sky-500',
  cream: 'text-pink-500',
  suppository: 'text-fuchsia-500',
  other: 'text-slate-500',
};

function MedTypeIcon({
  typeId,
  isGlp1,
  className,
}: {
  typeId?: string | null;
  isGlp1?: boolean;
  className?: string;
}) {
  // The actual form/type wins (a liquid is a flask even if flagged GLP-1, e.g. oral semaglutide
  // is a pill); fall back to an injection only when no type is set but it's a GLP-1 med.
  const key = typeId ?? (isGlp1 ? 'injection' : 'other');
  const Icon = MED_TYPE_ICONS[key] ?? Pill;
  const color = MED_TYPE_COLORS[key] ?? 'text-muted-foreground';
  return <Icon className={`${color} ${className ?? ''}`} />;
}

type MedicationDetail = Medication & { schedules: MedicationSchedule[] };

function AddMedicationDialog({
  editMed,
  trigger,
}: {
  editMed?: Medication;
  trigger?: ReactNode;
} = {}) {
  const { t } = useTranslation();
  const isEdit = Boolean(editMed);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editMed?.name ?? '');
  const [typeId, setTypeId] = useState(editMed?.type_id ?? 'pill');
  const [isGlp1, setIsGlp1] = useState(editMed?.is_glp1 ?? false);
  const [glp1Drug, setGlp1Drug] = useState(
    (editMed?.custom_fields?.['glp1_drug'] as string | undefined) ??
      'semaglutide'
  );
  const [strength, setStrength] = useState(
    editMed?.strength_value != null ? String(editMed.strength_value) : ''
  );
  const [strengthUnit, setStrengthUnit] = useState(
    editMed?.strength_unit ?? 'mg'
  );
  const [prescriber, setPrescriber] = useState(editMed?.prescriber ?? '');
  const [pharmacy, setPharmacy] = useState(editMed?.pharmacy ?? '');
  const [rxNumber, setRxNumber] = useState(editMed?.rx_number ?? '');
  const [reason, setReason] = useState(editMed?.reason_text ?? '');

  const createMutation = useCreateMedicationMutation();
  const updateMutation = useUpdateMedicationMutation();
  const mutation = isEdit ? updateMutation : createMutation;

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
    if (isEdit && editMed) {
      updateMutation.mutate(
        { id: editMed.id, body },
        { onSuccess: () => setOpen(false) }
      );
      return;
    }
    createMutation.mutate(body, {
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
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />{' '}
            {t('medications.cabinet.addMed', 'Add medication')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('medications.cabinet.editMed', 'Edit medication')
              : t('medications.cabinet.addMed', 'Add medication')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="med-name">
              {t('medications.cabinet.name', 'Name')}
            </Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                'medications.cabinet.namePlaceholder',
                'e.g. Wegovy'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('medications.cabinet.type', 'Type')}</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MED_TYPES.map((typeOption) => (
                    <SelectItem key={typeOption} value={typeOption}>
                      <span className="flex items-center gap-2 capitalize">
                        <MedTypeIcon typeId={typeOption} className="h-4 w-4" />
                        {t('medications.types.' + typeOption, typeOption)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('medications.cabinet.strength', 'Strength')}</Label>
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
              <Label className="text-sm font-medium">
                {t('medications.cabinet.glp1Med', 'GLP-1 medication')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'medications.cabinet.glp1Hint',
                  'Unlocks the injection coach, PK curve & site rotation.'
                )}
              </p>
            </div>
            <Switch checked={isGlp1} onCheckedChange={setIsGlp1} />
          </div>
          {isGlp1 && (
            <div className="space-y-2">
              <Label>
                {t(
                  'medications.cabinet.glp1Drug',
                  'GLP-1 drug (for the PK model)'
                )}
              </Label>
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
            <Label htmlFor="med-reason">
              {t('medications.cabinet.reason', 'Reason / condition (optional)')}
            </Label>
            <Input
              id="med-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'medications.cabinet.reasonPlaceholder',
                'e.g. Weight management, Type 2 diabetes'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="med-prescriber">
                {t('medications.cabinet.prescriber', 'Prescriber (optional)')}
              </Label>
              <Input
                id="med-prescriber"
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                placeholder={t(
                  'medications.cabinet.prescriberPlaceholder',
                  'Dr. Chen'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="med-pharmacy">
                {t('medications.cabinet.pharmacy', 'Pharmacy (optional)')}
              </Label>
              <Input
                id="med-pharmacy"
                value={pharmacy}
                onChange={(e) => setPharmacy(e.target.value)}
                placeholder={t(
                  'medications.cabinet.pharmacyPlaceholder',
                  'CVS #4421'
                )}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-rx">
              {t('medications.cabinet.rxNumber', 'Rx number (optional)')}
            </Label>
            <Input
              id="med-rx"
              value={rxNumber}
              onChange={(e) => setRxNumber(e.target.value)}
              placeholder={t(
                'medications.cabinet.rxPlaceholder',
                'Rx-482-93221'
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending
              ? t('medications.common.saving', 'Saving…')
              : t('medications.common.save', 'Save')}
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
  // Outside a React component, so use the i18n instance directly. English fallbacks preserved.
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

function ScheduleManager({ med }: { med: MedicationDetail }) {
  const { t } = useTranslation();
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
            {t('medications.schedule.heading', 'Schedules & Reminders')}
          </CardTitle>
          <CardDescription>
            {t(
              'medications.schedule.subheading',
              'Configure reminders and intake rules'
            )}
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" />{' '}
              {t('medications.schedule.addRule', 'Add Rule')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('medications.schedule.title', 'Add Schedule Rule')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t('medications.schedule.type', 'Schedule Type')}</Label>
                <Select
                  value={scheduleTypeId}
                  onValueChange={setScheduleTypeId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">
                      {t('medications.schedule.daily', 'Every day')}
                    </SelectItem>
                    <SelectItem value="weekly">
                      {t(
                        'medications.schedule.weekly',
                        'Specific days of week'
                      )}
                    </SelectItem>
                    <SelectItem value="every_n_days">
                      {t('medications.schedule.everyNDays', 'Every N days')}
                    </SelectItem>
                    <SelectItem value="cyclic">
                      {t('medications.schedule.cyclic', 'Cyclic (on/off)')}
                    </SelectItem>
                    <SelectItem value="monthly">
                      {t('medications.schedule.monthly', 'Monthly')}
                    </SelectItem>
                    <SelectItem value="prn">
                      {t('medications.schedule.prn', 'As needed (PRN)')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleTypeId !== 'prn' && (
                <div className="space-y-2">
                  <Label htmlFor="time-of-day">
                    {t('medications.schedule.timeOfDay', 'Time of Day')}
                  </Label>
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
                  <Label>
                    {t('medications.schedule.daysOfWeek', 'Days of Week')}
                  </Label>
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
                  <Label htmlFor="interval-days">
                    {t('medications.schedule.interval', 'Interval (Days)')}
                  </Label>
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
                  <Label htmlFor="day-of-month">
                    {t(
                      'medications.schedule.dayOfMonth',
                      'Day of Month (1-31)'
                    )}
                  </Label>
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
                    <Label htmlFor="cycle-on">
                      {t('medications.schedule.daysOn', 'Days On')}
                    </Label>
                    <Input
                      id="cycle-on"
                      type="number"
                      min="1"
                      value={cycleOnDays}
                      onChange={(e) => setCycleOnDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cycle-off">
                      {t('medications.schedule.daysOff', 'Days Off')}
                    </Label>
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
                    <Label htmlFor="prn-reason">
                      {t('medications.schedule.prnReason', 'Reason (Optional)')}
                    </Label>
                    <Input
                      id="prn-reason"
                      placeholder={t(
                        'medications.schedule.prnReasonPlaceholder',
                        'e.g. Pain'
                      )}
                      value={prnReason}
                      onChange={(e) => setPrnReason(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prn-max">
                      {t('medications.schedule.prnMax', 'Max Doses / Day')}
                    </Label>
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
                  <Label htmlFor="dose-override">
                    {t(
                      'medications.schedule.doseOverride',
                      'Dose Amount (Optional)'
                    )}
                  </Label>
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
                  <Label>
                    {t('medications.schedule.withMeal', 'With Meal')}
                  </Label>
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
                      <SelectItem value="none">
                        {t('medications.schedule.anyTime', 'Any time')}
                      </SelectItem>
                      <SelectItem value="before">
                        {t('medications.schedule.beforeMeal', 'Before meal')}
                      </SelectItem>
                      <SelectItem value="with">
                        {t('medications.schedule.withMealOpt', 'With meal')}
                      </SelectItem>
                      <SelectItem value="after">
                        {t('medications.schedule.afterMeal', 'After meal')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">
                    {t(
                      'medications.schedule.startDate',
                      'Start Date (Optional)'
                    )}
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">
                    {t('medications.schedule.endDate', 'End Date (Optional)')}
                  </Label>
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
                {addMutation.isPending
                  ? t('medications.common.saving', 'Saving…')
                  : t('medications.schedule.addRule', 'Add Rule')}
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

const SYMPTOM_LOCATIONS = [
  'general',
  'head',
  'abdomen',
  'chest',
  'back',
  'muscles',
  'joints',
];

// Locations that make sense for each built-in symptom (first = the one we preselect).
// Symptoms not listed here (e.g. custom ones) treat every location as applicable.
const SYMPTOM_LOCATION_MAP: Record<string, string[]> = {
  nausea: ['abdomen', 'general'],
  vomiting: ['abdomen', 'chest'],
  constipation: ['abdomen'],
  diarrhea: ['abdomen'],
  acid_reflux: ['chest', 'abdomen'],
  stomach_pain: ['abdomen'],
  headache: ['head'],
  dizziness: ['head'],
  fatigue: ['general'],
};

const LOCATION_EMOJI: Record<string, string> = {
  general: '🧍',
  head: '🧠',
  abdomen: '🫃',
  chest: '🫁',
  back: '🔙',
  muscles: '💪',
  joints: '🦴',
};
const locationLabel = (loc: string) =>
  loc.charAt(0).toUpperCase() + loc.slice(1);

// Map a logged symptom's snapshot name (a display name) to its emoji, for the calendar.
const SNAPSHOT_EMOJI: Record<string, string> = Object.fromEntries(
  BUILT_IN_SYMPTOMS.map((s) => [
    s.displayName.toLowerCase(),
    SYMPTOM_EMOJI[s.name] ?? '📝',
  ])
);
const emojiForSnapshot = (snap: string): string =>
  SNAPSHOT_EMOJI[snap.toLowerCase()] ?? '📝';

// Direction of a small weekly series (recent half vs earlier half).
function trendOf(arr: number[]): 'up' | 'down' | 'flat' {
  if (arr.length < 2) return 'flat';
  const half = Math.floor(arr.length / 2);
  const earlier = arr.slice(0, half).reduce((a, b) => a + b, 0);
  const recent = arr.slice(arr.length - half).reduce((a, b) => a + b, 0);
  if (recent > earlier * 1.05) return 'up';
  if (recent < earlier * 0.95) return 'down';
  return 'flat';
}

// Tiny inline sparkline (inherits color via currentColor).
function Sparkline({ data }: { data: number[] }) {
  const w = 60;
  const h = 16;
  const max = Math.max(1, ...data);
  const pts = data.map(
    (v, i) =>
      [(i / Math.max(1, data.length - 1)) * w, h - (v / max) * h] as [
        number,
        number,
      ]
  );
  const line = pts.map((p) => p.join(',')).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="block">
      <polyline
        points={`0,${h} ${line} ${w},${h}`}
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={last[0]} cy={last[1]} r={1.7} fill="currentColor" />}
    </svg>
  );
}

// Animated count-up for the GI stat numbers (eases in on mount / value change).
function CountUp({
  value,
  decimals = 1,
}: {
  value: number;
  decimals?: number;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toFixed(decimals)}</>;
}

export default function Medications() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'today' | 'cabinet' | 'symptoms'>(
    'today'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Symptoms tracking state
  const [symptomName, setSymptomName] = useState('nausea');
  const [customSymptomInput, setCustomSymptomInput] = useState('');
  const [severity, setSeverity] = useState([5]);
  const [bodyLocation, setBodyLocation] = useState('general');
  // Custom locations are user-defined body locations, stored in the DB (synced across devices).
  const { data: customLocations = [] } = useCustomLocations();
  const createLocationMutation = useCreateCustomLocationMutation();
  const deleteLocationMutation = useDeleteCustomLocationMutation();
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');
  const addCustomLocation = () => {
    const v = newLocation.trim();
    if (!v) return;
    createLocationMutation.mutate(v, {
      onSuccess: () => {
        setBodyLocation(v);
        setNewLocation('');
        setShowAddLocation(false);
      },
    });
  };
  const removeCustomLocation = (loc: { id: string; name: string }) => {
    deleteLocationMutation.mutate(loc.id, {
      onSuccess: () => {
        if (bodyLocation === loc.name) setBodyLocation('general');
      },
    });
  };
  const [contextText, setContextText] = useState('');
  const [bristolType, setBristolType] = useState<number | null>(null);
  const [linkedMedId, setLinkedMedId] = useState<string | null>(null);
  const [symptomCustomOpen, setSymptomCustomOpen] = useState(false);
  const [customSymptomDisplayName, setCustomSymptomDisplayName] = useState('');

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

  const { data: customSymptoms = [] } = useCustomSymptoms();
  const { data: symptomLogs = [], isLoading: loadingSymptoms } =
    useSymptomEntries({
      fromDate: thirtyDaysAgo,
      toDate: selectedDate,
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
    return getDueDosesForDate(meds, selectedDate);
  }, [meds, selectedDate, loadingMeds]);

  const prnMeds = useMemo(() => {
    return meds.filter((m) => {
      if (!m.is_active) return false;
      // Exclude if it's currently due today to prevent showing it twice
      if (dueDoses.some((d) => d.medication.id === m.id)) return false;
      if (!m.schedules || m.schedules.length === 0) return true;
      return m.schedules.some(
        (s: MedicationSchedule) => s.schedule_type_id === 'prn'
      );
    });
  }, [meds, dueDoses]);

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
    const days: { date: string; due: number; taken: number; pct: number }[] =
      [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(selectedDate, -i);
      const dayDue = getDueDosesForDate(meds, d);
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
      days.push({
        date: d,
        due: dayDue.length,
        taken: dayTaken,
        pct:
          dayDue.length > 0 ? Math.round((dayTaken / dayDue.length) * 100) : -1,
      });
      if (dayDue.length === 0) continue;
      due += dayDue.length;
      taken += dayTaken;
      if (dayTaken === dayDue.length) perfectDays++;
    }
    // Current streak of perfect days (walk back from newest; days with no doses are skipped).
    let streak = 0;
    for (let k = days.length - 1; k >= 0; k--) {
      const day = days[k];
      if (!day || day.due === 0) continue;
      if (day.taken === day.due) streak++;
      else break;
    }
    return {
      due,
      taken,
      perfectDays,
      days,
      streak,
      pct: due > 0 ? Math.round((taken / due) * 100) : 100,
    };
  }, [meds, selectedDate, recentEntries]);

  // The next GLP-1 dose due today (if any), for the next-injection banner.
  const nextGlpDue = useMemo(() => {
    return (
      dueDoses.find((d) => {
        if (!d.medication.is_glp1) return false;
        // Check if already logged on the selected date to hide the due banner once taken/skipped
        const isLogged = entries.some(
          (e) =>
            e.schedule_id === d.schedule.id &&
            (e.status === 'taken' || e.status === 'skipped')
        );
        return !isLogged;
      }) ?? null
    );
  }, [dueDoses, entries]);

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
      isCustom: false,
    }));
    customSymptoms.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name,
        displayName: s.display_name || s.name,
        isGlp1: s.is_glp1_flagged,
        isCustom: true,
      });
    });
    return list;
  }, [customSymptoms]);

  // Calendar rendering helper: build the 30 days ending on the selected date,
  // so the calendar tracks the date filter (same window as the symptom query).
  const calendarDays = useMemo(() => {
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const dStr = addDays(selectedDate, -i);
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
  }, [selectedDate, symptomLogs]);

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

  // Weekly buckets (oldest→newest) over the same 30-day window, for the GI sparklines + trends.
  const giSeries = useMemo(() => {
    const B = 5;
    const per = Math.ceil(Math.max(1, calendarDays.length) / B);
    const bucketOf = new Map(
      calendarDays.map((d, i) => [
        d.dateString,
        Math.min(B - 1, Math.floor(i / per)),
      ])
    );
    const blank = () => Array(B).fill(0) as number[];
    const nausea = blank();
    const vomiting = blank();
    const reflux = blank();
    const bSum = blank();
    const bCnt = blank();
    for (const l of symptomLogs) {
      const b = bucketOf.get(l.entry_date);
      if (b == null) continue;
      const s = l.symptom_name_snapshot.toLowerCase();
      if (s.includes('nausea')) nausea[b] = (nausea[b] ?? 0) + 1;
      if (s.includes('vomit')) vomiting[b] = (vomiting[b] ?? 0) + 1;
      if (s.includes('reflux')) reflux[b] = (reflux[b] ?? 0) + 1;
      if (l.bristol_type != null) {
        bSum[b] = (bSum[b] ?? 0) + l.bristol_type;
        bCnt[b] = (bCnt[b] ?? 0) + 1;
      }
    }
    const bristol = bSum.map((sum, i) => {
      const c = bCnt[i] ?? 0;
      return c ? sum / c : 0;
    });
    return { nausea, vomiting, reflux, bristol };
  }, [calendarDays, symptomLogs]);

  const handleLogScheduled = (
    due: (typeof dueDoses)[0],
    status: 'taken' | 'skipped' | 'snoozed'
  ) => {
    let scheduledFor = null;
    if (due.schedule.time_of_day) {
      try {
        const { start } = dayToUtcRange(selectedDate, timezone);
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
      taken_at:
        selectedDate === today
          ? new Date().toISOString()
          : `${selectedDate}T12:00:00.000Z`,
      scheduled_for: scheduledFor,
      entry_date: selectedDate,
    });
  };

  const handleLogPrn = (med: MedicationDetail) => {
    const prnSched = med.schedules?.find((s) => s.schedule_type_id === 'prn');
    createEntryMutation.mutate({
      medication_id: med.id,
      schedule_id: prnSched?.id || null,
      status: 'prn_taken',
      taken_at:
        selectedDate === today
          ? new Date().toISOString()
          : `${selectedDate}T12:00:00.000Z`,
      entry_date: selectedDate,
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
        entry_date: selectedDate,
        logged_at:
          selectedDate === today
            ? new Date().toISOString()
            : `${selectedDate}T12:00:00.000Z`,
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
                      injection —{' '}
                      {selectedDate === today ? 'due today' : 'scheduled'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {nextGlpDue.schedule.time_of_day
                        ? `Scheduled ${nextGlpDue.schedule.time_of_day.substring(0, 5)}`
                        : selectedDate === today
                          ? 'Any time today'
                          : 'Any time'}
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
          {(() => {
            const ringColor =
              adherence14.pct >= 90
                ? '#22c55e'
                : adherence14.pct >= 70
                  ? '#f59e0b'
                  : '#ef4444';
            const tiles = [
              {
                label:
                  selectedDate === today
                    ? t('medications.today.dosesToday', 'Doses today')
                    : t('medications.today.doses', 'Doses'),
                value: `${completedDosesCount}/${dueDoses.length}`,
                emoji: '💊',
                grad: 'from-emerald-50 to-white dark:from-emerald-950/40 dark:to-transparent',
                chip: 'bg-emerald-100 dark:bg-emerald-900/50',
                num: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                label: t('medications.today.adherence14', '14-day adherence'),
                value: `${adherence14.pct}%`,
                emoji: '✅',
                grad: 'from-blue-50 to-white dark:from-blue-950/40 dark:to-transparent',
                chip: 'bg-blue-100 dark:bg-blue-900/50',
                num: 'text-blue-600 dark:text-blue-400',
              },
              {
                label: t('medications.today.perfectDays', 'Perfect days (14d)'),
                value: String(adherence14.perfectDays),
                emoji: '🏆',
                grad: 'from-amber-50 to-white dark:from-amber-950/40 dark:to-transparent',
                chip: 'bg-amber-100 dark:bg-amber-900/50',
                num: 'text-amber-600 dark:text-amber-400',
              },
            ];
            return (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
                    <div className="grid w-full grid-cols-3 gap-3">
                      {tiles.map((t) => (
                        <div
                          key={t.label}
                          className={`rounded-xl border bg-gradient-to-br ${t.grad} p-3`}
                        >
                          <div
                            className={`mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${t.chip} text-base`}
                          >
                            {t.emoji}
                          </div>
                          <p
                            className={`text-2xl font-bold leading-none tabular-nums ${t.num}`}
                          >
                            {t.value}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
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
                          stroke={ringColor}
                          strokeWidth="3"
                          strokeDasharray={`${adherence14.pct}, 100`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dasharray 0.6s ease' }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className="text-lg font-bold tabular-nums"
                          style={{ color: ringColor }}
                        >
                          {adherence14.pct}%
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          14-day
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 14-day adherence strip + streak */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {t('medications.today.last14', 'Last 14 days')}
                      </span>
                      {adherence14.streak > 0 && (
                        <span className="flex items-center gap-1 font-semibold text-orange-500">
                          🔥{' '}
                          {t(
                            'medications.today.streak',
                            '{{count}}-day streak',
                            {
                              count: adherence14.streak,
                            }
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex h-10 items-end gap-1">
                      {adherence14.days.map((d, i) => {
                        const none = d.due === 0;
                        const color = none
                          ? 'bg-muted'
                          : d.pct === 100
                            ? 'bg-green-500'
                            : d.pct >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500';
                        return (
                          <div
                            key={i}
                            title={`${d.date}: ${none ? 'no doses' : `${d.taken}/${d.due} taken`}`}
                            className={`flex-1 rounded-sm transition-all hover:opacity-80 ${color} ${none ? 'opacity-40' : ''}`}
                            style={{
                              height: `${none ? 18 : Math.max(14, d.pct)}%`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Progress Banner */}
          <Card className="bg-gradient-to-r from-blue-500/10 to-teal-500/10 border border-blue-500/20 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-500" />{' '}
                  {selectedDate === today
                    ? t('medications.today.checklistToday', "Today's Checklist")
                    : t(
                        'medications.today.checklistMed',
                        'Medication Checklist'
                      )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {dueDoses.length === 0
                    ? `No scheduled doses for ${selectedDate === today ? 'today' : 'this day'}.`
                    : `${completedDosesCount} of ${dueDoses.length} doses logged ${selectedDate === today ? 'today' : 'for this day'}.`}
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

          {meds.some((m) => m.is_glp1) && (
            <GlpDailyCheckIn selectedDate={selectedDate} />
          )}

          <div className="grid gap-6 md:grid-cols-[1fr_350px]">
            {/* Scheduled & PRN Column */}
            <div className="space-y-6">
              {/* Today's Medications */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                      <Pill className="h-3.5 w-3.5 text-blue-500" />
                    </span>
                    Today's medications
                  </CardTitle>
                  <CardDescription>
                    Track scheduled doses and log as-needed medications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Due Today Group */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                      <Clock className="h-3.5 w-3.5" /> Due today
                    </h3>

                    {loadingMeds && (
                      <p className="text-sm text-muted-foreground">
                        Loading checklist…
                      </p>
                    )}
                    {!loadingMeds && dueDoses.length === 0 && (
                      <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-dashed text-center">
                        No scheduled doses today — log any medication as-needed
                        below.
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
                                ) : (
                                  <MedTypeIcon
                                    typeId={due.medication.type_id}
                                    isGlp1={due.medication.is_glp1}
                                    className="h-5 w-5"
                                  />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p
                                    className={`font-semibold text-sm ${isLogged ? 'line-through' : ''}`}
                                  >
                                    {due.medication.display_name ||
                                      due.medication.name}
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 border-blue-200 text-blue-700 bg-blue-50/50 dark:border-blue-900 dark:text-blue-300 dark:bg-blue-950/30"
                                  >
                                    {t(
                                      'medications.today.scheduled',
                                      'Scheduled'
                                    )}
                                  </Badge>
                                </div>
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
                                      : t(
                                          'medications.schedule.anyTime',
                                          'Any time'
                                        )}
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
                                  <RotateCcw className="h-3.5 w-3.5" />{' '}
                                  {t('medications.today.undo', 'Undo')}
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
                                    {isSnoozed
                                      ? t(
                                          'medications.today.snoozed',
                                          'Snoozed'
                                        )
                                      : t('medications.today.snooze', 'Snooze')}
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
                                    {t('medications.today.skip', 'Skip')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() =>
                                      handleLogScheduled(due, 'taken')
                                    }
                                    disabled={createEntryMutation.isPending}
                                  >
                                    {t('medications.today.take', 'Take')}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* As Needed Group */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                        <Pill className="h-3.5 w-3.5" /> As needed
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Tap to log a dose now (no fixed schedule or not due
                        today).
                      </p>
                    </div>

                    {loadingMeds && (
                      <p className="text-sm text-muted-foreground">
                        Loading active medications…
                      </p>
                    )}
                    {!loadingMeds && prnMeds.length === 0 && (
                      <p className="text-sm text-muted-foreground py-2 text-center bg-muted/10 rounded-lg border border-dashed">
                        No as-needed or non-scheduled medications configured.
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      {prnMeds.map((med) => (
                        <Button
                          key={med.id}
                          variant="outline"
                          className="justify-between h-12 flex items-center gap-3 px-3 hover:bg-accent/50 w-full"
                          onClick={() => handleLogPrn(med as MedicationDetail)}
                          disabled={createEntryMutation.isPending}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <MedTypeIcon
                              typeId={med.type_id}
                              isGlp1={med.is_glp1}
                              className="h-4.5 w-4.5 shrink-0"
                            />
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
                          </div>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-950 shrink-0"
                          >
                            PRN
                          </Badge>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Today Activity Log Column */}
            <div>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    </span>
                    Logged today
                  </CardTitle>
                  <CardDescription>
                    Everything you've taken or skipped on this date.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loadingEntries && (
                    <p className="text-sm text-muted-foreground">
                      Loading history…
                    </p>
                  )}
                  {!loadingEntries && entries.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      {t(
                        'medications.today.noIntake',
                        'No entries logged yet today.'
                      )}
                    </div>
                  )}
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/10 text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MedTypeIcon
                          typeId={
                            meds.find((m) => m.id === entry.medication_id)
                              ?.type_id
                          }
                          isGlp1={
                            meds.find((m) => m.id === entry.medication_id)
                              ?.is_glp1
                          }
                          className="h-4 w-4 shrink-0"
                        />
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
                label: t('medications.cabinet.activeScripts', 'Active scripts'),
                value: meds.filter((m) => m.is_active).length,
                Icon: Pill,
                color: 'text-primary',
              },
              {
                label: t('medications.cabinet.glp1Meds', 'GLP-1 meds'),
                value: meds.filter((m) => m.is_glp1).length,
                Icon: Syringe,
                color: 'text-blue-500',
              },
              {
                label: t(
                  'medications.cabinet.scheduledToday',
                  'Scheduled today'
                ),
                value: dueDoses.length,
                Icon: Clock,
                color: 'text-amber-500',
              },
              {
                label: t('medications.cabinet.totalMeds', 'Total meds'),
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
                      <div className="flex items-center gap-1">
                        <AddMedicationDialog
                          key={selected.id}
                          editMed={selected}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit medication"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteMed(selected.id)}
                          disabled={removeMedMutation.isPending}
                          aria-label="Delete medication"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
                    <Activity className="h-5 w-5 text-red-500" />{' '}
                    {t('medications.symptoms.logTitle', 'Log Symptom')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'medications.symptoms.subtitle',
                      'Log severity and physical context of your side effects'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Select Symptom */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>
                        {t('medications.symptoms.symptom', 'Symptom')}
                      </Label>
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
                            <Plus className="h-3 w-3" />{' '}
                            {t('medications.common.custom', 'Custom')}
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {t(
                                'medications.symptoms.addCustom',
                                'Add Custom Symptom'
                              )}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="space-y-2">
                              <Label htmlFor="custom-sym-name">
                                {t(
                                  'medications.symptoms.customName',
                                  'Symptom Name (internal)'
                                )}
                              </Label>
                              <Input
                                id="custom-sym-name"
                                value={customSymptomInput}
                                onChange={(e) =>
                                  setCustomSymptomInput(e.target.value)
                                }
                                placeholder={t(
                                  'medications.symptoms.customNamePlaceholder',
                                  'e.g. skin_rash'
                                )}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="custom-sym-disp">
                                {t(
                                  'medications.symptoms.displayLabel',
                                  'Display Label'
                                )}
                              </Label>
                              <Input
                                id="custom-sym-disp"
                                value={customSymptomDisplayName}
                                onChange={(e) =>
                                  setCustomSymptomDisplayName(e.target.value)
                                }
                                placeholder={t(
                                  'medications.symptoms.displayLabelPlaceholder',
                                  'e.g. Skin Rash'
                                )}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              onClick={handleCreateCustomSymptom}
                              disabled={createCustomSymptomMutation.isPending}
                            >
                              {t(
                                'medications.symptoms.saveCustom',
                                'Save Custom Symptom'
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {allSymptomOptions.map((opt) => {
                        const active = symptomName === opt.name;
                        return (
                          <div key={opt.id} className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setSymptomName(opt.name);
                                // Preselect the most relevant location for this symptom.
                                setBodyLocation(
                                  SYMPTOM_LOCATION_MAP[opt.name]?.[0] ??
                                    'general'
                                );
                              }}
                              className={`flex w-full flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                                active
                                  ? 'border-red-500 bg-red-50 dark:bg-red-950'
                                  : 'border-border hover:bg-muted'
                              }`}
                            >
                              <span className="text-xl leading-none">
                                {SYMPTOM_EMOJI[opt.name] ?? '📝'}
                              </span>
                              <span className="text-[11px] font-medium leading-tight">
                                {opt.isCustom
                                  ? opt.displayName
                                  : t(
                                      'medications.symptomNames.' + opt.name,
                                      opt.displayName
                                    )}
                              </span>
                            </button>
                            {opt.isGlp1 && !opt.isCustom && (
                              <span
                                className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500"
                                title="Common on GLP-1"
                              />
                            )}
                            {opt.isCustom && (
                              <button
                                type="button"
                                onClick={() =>
                                  deleteCustomSymptomMutation.mutate(opt.id)
                                }
                                disabled={deleteCustomSymptomMutation.isPending}
                                aria-label={`Remove ${opt.displayName}`}
                                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-muted-foreground opacity-60 transition hover:text-destructive hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Severity Slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label>
                        {t('medications.symptoms.severity', 'Severity')}
                      </Label>
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
                      <span>
                        {t('medications.symptoms.mild', 'Mild (1-3)')}
                      </span>
                      <span>
                        {t('medications.symptoms.moderate', 'Moderate (4-6)')}
                      </span>
                      <span>
                        {t('medications.symptoms.severe', 'Severe (7-10)')}
                      </span>
                    </div>
                  </div>

                  {/* Body Location Pin */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>
                        {t(
                          'medications.symptoms.primaryLocation',
                          'Primary Location'
                        )}
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowAddLocation((s) => !s)}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />{' '}
                        {t('medications.common.custom', 'Custom')}
                      </button>
                    </div>
                    {showAddLocation && (
                      <div className="flex gap-2">
                        <Input
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addCustomLocation();
                            }
                          }}
                          placeholder={t(
                            'medications.symptoms.customLocationPlaceholder',
                            'e.g. Left shoulder, Jaw…'
                          )}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          onClick={addCustomLocation}
                          disabled={!newLocation.trim()}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {SYMPTOM_LOCATIONS.map((loc) => {
                        const applicable = SYMPTOM_LOCATION_MAP[symptomName];
                        const isApplicable =
                          !applicable || applicable.includes(loc);
                        const selected = bodyLocation === loc;
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setBodyLocation(loc)}
                            title={
                              isApplicable
                                ? undefined
                                : 'Not typical for this symptom — select anyway if it applies to you'
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs transition ${
                              selected
                                ? 'bg-red-500/10 text-red-600 border-red-500/30 font-medium'
                                : isApplicable
                                  ? 'bg-background hover:bg-muted text-muted-foreground'
                                  : 'bg-background hover:bg-muted text-muted-foreground/50 opacity-50'
                            }`}
                          >
                            <span className="mr-1">{LOCATION_EMOJI[loc]}</span>
                            {t(
                              'medications.locations.' + loc,
                              locationLabel(loc)
                            )}
                          </button>
                        );
                      })}
                      {customLocations.map((loc) => {
                        const selected = bodyLocation === loc.name;
                        return (
                          <span
                            key={loc.id}
                            className={`group inline-flex items-center rounded-full border py-1 pl-2.5 pr-1 text-xs transition ${
                              selected
                                ? 'bg-red-500/10 text-red-600 border-red-500/30 font-medium'
                                : 'bg-background hover:bg-muted text-muted-foreground'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setBodyLocation(loc.name)}
                              className="flex items-center gap-1"
                            >
                              <span>📍</span>
                              {loc.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCustomLocation(loc)}
                              aria-label={`Remove ${loc.name}`}
                              className="ml-1 rounded-full p-0.5 opacity-50 transition hover:text-destructive hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bristol Stool Scale (Only if constipation/diarrhea selected) */}
                  {['constipation', 'diarrhea'].includes(symptomName) && (
                    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />{' '}
                        {t(
                          'medications.symptoms.bristol',
                          'Bowel Log (Bristol Stool Scale)'
                        )}
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
                      {t(
                        'medications.symptoms.linkMed',
                        'Link to Medication (Optional)'
                      )}
                    </Label>
                    <Select
                      value={linkedMedId || 'none'}
                      onValueChange={(val) =>
                        setLinkedMedId(val === 'none' ? null : val)
                      }
                    >
                      <SelectTrigger id="linked-med">
                        <SelectValue
                          placeholder={t(
                            'medications.symptoms.noMedLinked',
                            'No medication linked'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t(
                            'medications.symptoms.noMedLinked',
                            'No medication linked'
                          )}
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
                    <Label htmlFor="symptom-notes">
                      {t('medications.symptoms.context', 'Context / Notes')}
                    </Label>
                    <Textarea
                      id="symptom-notes"
                      placeholder={t(
                        'medications.symptoms.contextPlaceholder',
                        'e.g. Occurred 4 hours after taking my dinner dose.'
                      )}
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
                      ? t('medications.common.logging', 'Logging…')
                      : t('medications.symptoms.logTitle', 'Log Symptom')}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: Calendar, Pattern Hints, and Logs */}
            <div className="space-y-6">
              {/* GI sub-tracker (real rates over the last 30 days) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t('medications.gi.title', 'GI sub-tracker')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      'medications.gi.subtitle',
                      'Per-week rates over the last 30 days'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: t('medications.gi.nausea', 'Nausea / wk'),
                        value: giStats.nausea,
                        emoji: '🤢',
                        series: giSeries.nausea,
                        grad: 'from-emerald-50 to-white dark:from-emerald-950/40 dark:to-transparent',
                        chip: 'bg-emerald-100 dark:bg-emerald-900/50',
                        num: 'text-emerald-600 dark:text-emerald-400',
                      },
                      {
                        label: t('medications.gi.vomiting', 'Vomiting / wk'),
                        value: giStats.vomiting,
                        emoji: '🤮',
                        series: giSeries.vomiting,
                        grad: 'from-violet-50 to-white dark:from-violet-950/40 dark:to-transparent',
                        chip: 'bg-violet-100 dark:bg-violet-900/50',
                        num: 'text-violet-600 dark:text-violet-400',
                      },
                      {
                        label: t('medications.gi.reflux', 'Reflux / wk'),
                        value: giStats.reflux,
                        emoji: '🔥',
                        series: giSeries.reflux,
                        grad: 'from-orange-50 to-white dark:from-orange-950/40 dark:to-transparent',
                        chip: 'bg-orange-100 dark:bg-orange-900/50',
                        num: 'text-orange-600 dark:text-orange-400',
                      },
                      {
                        label: t('medications.gi.avgBristol', 'Avg Bristol'),
                        value: giStats.avgBristol,
                        emoji: '💩',
                        series: giSeries.bristol,
                        neutral: true,
                        grad: 'from-sky-50 to-white dark:from-sky-950/40 dark:to-transparent',
                        chip: 'bg-sky-100 dark:bg-sky-900/50',
                        num: 'text-sky-600 dark:text-sky-400',
                      },
                    ].map((t) => {
                      const num = Number(t.value);
                      const isNum = !Number.isNaN(num);
                      const trend = trendOf(t.series);
                      const hasSeries = t.series.some((v) => v > 0);
                      return (
                        <div
                          key={t.label}
                          className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${t.grad} p-3`}
                        >
                          {!t.neutral && trend !== 'flat' && (
                            <span
                              className={`absolute right-2 top-2 text-[11px] font-bold ${trend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}
                              title={
                                trend === 'up'
                                  ? 'Trending up vs earlier this period'
                                  : 'Trending down vs earlier this period'
                              }
                            >
                              {trend === 'up' ? '▲' : '▼'}
                            </span>
                          )}
                          <div
                            className={`mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${t.chip} text-base`}
                          >
                            {t.emoji}
                          </div>
                          <p
                            className={`text-2xl font-bold leading-none tabular-nums ${t.num}`}
                          >
                            {isNum ? (
                              <CountUp value={num} decimals={1} />
                            ) : (
                              t.value
                            )}
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                            {t.label}
                          </p>
                          {hasSeries && (
                            <div className={`mt-1.5 ${t.num}`}>
                              <Sparkline data={t.series} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Pattern Hints Card */}
              {patternHints.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/15">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShieldAlert className="h-4.5 w-4.5 text-amber-500 animate-pulse" />{' '}
                      {t(
                        'medications.insights.title',
                        'Side-Effect Insights & Hints'
                      )}
                    </CardTitle>
                    <CardDescription>
                      {t(
                        'medications.insights.subtitle',
                        'Pharmacokinetic correlations overlaying recent dose timings'
                      )}
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
                      <Info className="h-3 w-3" />{' '}
                      {t(
                        'medications.insights.disclaimer',
                        'Insights are calculated over a rolling 30-day window. These are educational estimations, not clinical advice.'
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Symptom History Calendar */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t(
                      'medications.symptoms.calendarTitle',
                      'Symptom Activity Calendar'
                    )}
                  </CardTitle>
                  <CardDescription>
                    Symptom logging frequency and severity over the past 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-10 gap-2">
                    {calendarDays.map((day) => {
                      const sev = day.maxSeverity;
                      const has = day.logs.length > 0;
                      const isSelected = day.dateString === selectedDate;
                      const dominant = has
                        ? [...day.logs].sort(
                            (a, b) => b.severity - a.severity
                          )[0]
                        : undefined;
                      const dayEmoji = dominant
                        ? emojiForSnapshot(dominant.symptom_name_snapshot)
                        : null;
                      let colorClass =
                        'bg-muted/20 border-transparent text-muted-foreground/60';
                      let badge = 'bg-foreground/10 text-foreground/70';
                      if (has) {
                        if (sev <= 3) {
                          colorClass =
                            'bg-gradient-to-br from-green-400/25 to-green-500/10 border-green-400/60 text-green-700 dark:text-green-300';
                          badge =
                            'bg-green-500 text-white shadow-sm shadow-green-500/40';
                        } else if (sev <= 6) {
                          colorClass =
                            'bg-gradient-to-br from-amber-400/25 to-amber-500/10 border-amber-400/60 text-amber-700 dark:text-amber-300';
                          badge =
                            'bg-amber-500 text-white shadow-sm shadow-amber-500/40';
                        } else {
                          colorClass =
                            'bg-gradient-to-br from-red-400/30 to-red-500/15 border-red-400/70 text-red-700 dark:text-red-300';
                          badge =
                            'bg-red-500 text-white shadow-sm shadow-red-500/40';
                        }
                      }

                      return (
                        <div
                          key={day.dateString}
                          title={`${day.dateString}: ${day.logs.length} logged, max severity ${day.maxSeverity}`}
                          className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition-all hover:scale-[1.06] hover:shadow-sm ${colorClass} ${
                            isSelected
                              ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                              : ''
                          }`}
                        >
                          <span
                            className={`absolute left-1.5 top-1 text-[10px] ${has ? 'font-semibold opacity-80' : 'opacity-60'}`}
                          >
                            {day.dayLabel}
                          </span>
                          {has && (
                            <>
                              <span className="text-base leading-none">
                                {dayEmoji}
                              </span>
                              {day.logs.length > 1 && (
                                <span
                                  className={`absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${badge}`}
                                >
                                  {day.logs.length}
                                </span>
                              )}
                            </>
                          )}
                          {/* Tooltip on hover */}
                          <div className="absolute -top-16 left-1/2 z-10 hidden w-32 -translate-x-1/2 rounded border bg-popover p-2 text-center text-[10px] text-popover-foreground shadow-md group-hover:block">
                            <p className="font-semibold">{day.dateString}</p>
                            <p>
                              {t(
                                'medications.calendar.loggedCount',
                                '{{count}} logged symptom',
                                {
                                  count: day.logs.length,
                                }
                              )}
                            </p>
                            {day.maxSeverity > 0 && (
                              <p>
                                {t(
                                  'medications.calendar.maxSeverity',
                                  'Max severity: {{n}}',
                                  {
                                    n: day.maxSeverity,
                                  }
                                )}
                              </p>
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
                    {t('medications.symptoms.logsTitle', 'Logged Symptom Logs')}
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
                              {t(
                                'medications.symptoms.bristolType',
                                'Bristol Type {{n}}',
                                { n: log.bristol_type }
                              )}
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
