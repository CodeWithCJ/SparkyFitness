import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { todayInZone } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useAddScheduleMutation,
  useDeleteScheduleMutation,
} from '@/hooks/useMedications';
import { formatScheduleDescription } from './medicationUtils';
import type { MedicationDetail, MedicationSchedule } from '@/types/medications';

export default function ScheduleManager({ med }: { med: MedicationDetail }) {
  const { t } = useTranslation();
  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  const handleTypeChange = (val: string) => {
    setScheduleTypeId(val);
    if ((val === 'every_n_days' || val === 'cyclic') && !startDate) {
      setStartDate(todayInZone(timezone));
    }
  };

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />{' '}
          {t('medications.schedule.title', 'Schedule Rules')}
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {t('medications.schedule.addRule', 'Add Rule')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('medications.schedule.addRule', 'Add Rule')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
              {/* Type selector */}
              <div className="space-y-2">
                <Label>{t('medications.schedule.type', 'Schedule Type')}</Label>
                <Select value={scheduleTypeId} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">
                      {t('medications.scheduleTypes.daily', 'Every day')}
                    </SelectItem>
                    <SelectItem value="weekly">
                      {t(
                        'medications.scheduleTypes.weekly',
                        'Specific days of week'
                      )}
                    </SelectItem>
                    <SelectItem value="every_n_days">
                      {t(
                        'medications.scheduleTypes.everyNDays',
                        'Every N days'
                      )}
                    </SelectItem>
                    <SelectItem value="cyclic">
                      {t('medications.scheduleTypes.cyclic', 'Cyclic (On/Off)')}
                    </SelectItem>
                    <SelectItem value="monthly">
                      {t('medications.scheduleTypes.monthly', 'Monthly')}
                    </SelectItem>
                    <SelectItem value="prn">
                      {t('medications.scheduleTypes.prn', 'As needed (PRN)')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Time of Day (hidden for PRN) */}
              {scheduleTypeId !== 'prn' && (
                <div className="space-y-2">
                  <Label>{t('medications.schedule.time', 'Time of Day')}</Label>
                  <Input
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                  />
                </div>
              )}

              {/* Dose Amount */}
              <div className="space-y-2">
                <Label>
                  {t(
                    'medications.schedule.doseAmount',
                    'Dose Amount (override)'
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={
                      med.dose_amount != null ? String(med.dose_amount) : '1'
                    }
                    value={doseAmount}
                    onChange={(e) => setDoseAmount(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground capitalize">
                    {med.dose_unit ?? med.type_id}
                  </span>
                </div>
              </div>

              {/* Food relation */}
              <div className="space-y-2">
                <Label>
                  {t('medications.schedule.withMeal', 'Food Relation')}
                </Label>
                <Select
                  value={withMeal || 'none'}
                  onValueChange={(v) => setWithMeal(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t(
                        'medications.mealRelation.none',
                        'No specific food relation'
                      )}
                    </SelectItem>
                    <SelectItem value="before">
                      {t('medications.mealRelation.before', 'Before meal')}
                    </SelectItem>
                    <SelectItem value="with">
                      {t('medications.mealRelation.with', 'With meal')}
                    </SelectItem>
                    <SelectItem value="after">
                      {t('medications.mealRelation.after', 'After meal')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Weekly options */}
              {scheduleTypeId === 'weekly' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.weekdays', 'Select Days')}
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => {
                      const active = daysOfWeek.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          className={`h-8 w-8 rounded-full border text-xs font-semibold transition ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {dayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Every N days options */}
              {scheduleTypeId === 'every_n_days' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.interval', 'Interval (Days)')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              )}

              {/* Monthly options */}
              {scheduleTypeId === 'monthly' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.dayOfMonth', 'Day of Month')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </div>
              )}

              {/* Cyclic options */}
              {scheduleTypeId === 'cyclic' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      {t('medications.schedule.cycleOn', 'Days On')}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={cycleOnDays}
                      onChange={(e) => setCycleOnDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t('medications.schedule.cycleOff', 'Days Off')}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={cycleOffDays}
                      onChange={(e) => setCycleOffDays(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* PRN options */}
              {scheduleTypeId === 'prn' && (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sched-prn-reason">
                      {t('medications.schedule.prnReason', 'Reason / Symptom')}
                    </Label>
                    <Input
                      id="sched-prn-reason"
                      placeholder="e.g. For pain, For headache"
                      value={prnReason}
                      onChange={(e) => setPrnReason(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sched-prn-max">
                      {t('medications.schedule.prnMax', 'Max doses per day')}
                    </Label>
                    <Input
                      id="sched-prn-max"
                      type="number"
                      placeholder="e.g. 3"
                      value={prnMaxPerDay}
                      onChange={(e) => setPrnMaxPerDay(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Date limits */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label>
                    {['every_n_days', 'cyclic'].includes(scheduleTypeId) ? (
                      <span className="font-semibold text-primary">
                        {t(
                          'medications.schedule.startDateRequired',
                          'Start Date (Required)'
                        )}
                      </span>
                    ) : (
                      t(
                        'medications.schedule.startDate',
                        'Start Date (Optional)'
                      )
                    )}
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.endDate', 'End Date (Optional)')}
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={
                  addMutation.isPending ||
                  ((scheduleTypeId === 'every_n_days' ||
                    scheduleTypeId === 'cyclic') &&
                    !startDate)
                }
              >
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
