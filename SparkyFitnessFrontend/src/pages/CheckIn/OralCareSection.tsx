import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  CircleEllipsis,
  Clock3,
  Flame,
  GlassWater,
  Heart,
  ListChecks,
  Pencil,
  Settings2,
  Sparkles,
  Spool,
  Timer,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import Tooth from '@/components/icons/Tooth';
import { BrushingTimerDialog } from './BrushingTimerDialog';
import {
  addDays,
  instantHourMinute,
  instantToDay,
  isSparkyOralCareProvider,
  localDateTimeToUtc,
  ORAL_CARE_TYPES,
  todayInZone,
  type OralCareSessionResponse,
  type OralCareSettings,
  type OralCareType,
} from '@workspace/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/ui/TimeInput';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useCreateOralCareSessionMutation,
  useDeleteOralCareSessionMutation,
  useOralCareDaySummary,
  useOralCareHistory,
  useSaveOralCareSettingsMutation,
  useUpdateOralCareSessionMutation,
} from '@/hooks/CheckIn/useOralCare';

interface OralCareSectionProps {
  selectedDate: string;
}

const DAILY_TARGET_OPTIONS = [1, 2, 3, 4, 5, 6];

/** Each type's icon and colours, used on its button and its session rows. */
const TYPE_STYLE: Record<OralCareType, { icon: LucideIcon; chip: string }> = {
  brushing: {
    icon: Tooth,
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  flossing: {
    icon: Spool,
    chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  mouthwash: {
    icon: GlassWater,
    chip: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  tongue_cleaning: {
    icon: Sparkles,
    chip: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  },
  other: {
    icon: CircleEllipsis,
    chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  },
};

const StatLabel = ({
  icon: Icon,
  chip,
  children,
}: {
  icon: LucideIcon;
  chip: string;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${chip}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
    {children}
  </div>
);
const TARGET_SECONDS_OPTIONS = [60, 90, 120, 150, 180, 240, 300];

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface FormState {
  careType: OralCareType;
  customLabel: string;
  time: string;
  minutes: string;
  seconds: string;
  notes: string;
}

export const OralCareSection = ({ selectedDate }: OralCareSectionProps) => {
  const { t } = useTranslation();
  const { timezone, formatTime } = usePreferences();
  const { isActingOnBehalf } = useActiveUser();

  const {
    data: summary,
    isLoading,
    isError,
    refetch,
  } = useOralCareDaySummary(selectedDate);
  const { data: history } = useOralCareHistory(
    addDays(selectedDate, -29),
    selectedDate
  );
  const createSession = useCreateOralCareSessionMutation();
  const updateSession = useUpdateOralCareSessionMutation();
  const deleteSession = useDeleteOralCareSessionMutation();
  const saveSettings = useSaveOralCareSettingsMutation();

  const [editing, setEditing] = useState<OralCareSessionResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState<OralCareSettings | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);

  // A timer brush belongs to the day it started, whatever day is selected.
  const saveTimerBrush = (startedAt: Date, durationSeconds: number) => {
    const cappedDuration = Math.min(durationSeconds, 3600);
    return createSession.mutateAsync({
      entry_date: instantToDay(startedAt, timezone),
      start_time: startedAt.toISOString(),
      end_time: new Date(
        startedAt.getTime() + cappedDuration * 1000
      ).toISOString(),
      duration_seconds: cappedDuration,
      care_type: 'brushing',
      provider: 'timer',
    });
  };

  const typeLabel = (type: OralCareType) =>
    t(`oralCare.types.${type}`, {
      defaultValue: {
        brushing: 'Brushing',
        flossing: 'Flossing',
        mouthwash: 'Mouthwash',
        tongue_cleaning: 'Tongue cleaning',
        other: 'Other',
      }[type],
    });

  const sessionLabel = (session: OralCareSessionResponse) =>
    session.care_type === 'other' && session.custom_label
      ? session.custom_label
      : typeLabel(session.care_type);

  const nowTime = () => {
    if (selectedDate !== todayInZone(timezone)) return '12:00';
    const { hour, minute } = instantHourMinute(new Date(), timezone);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const openCreate = (careType: OralCareType) => {
    setEditing(null);
    setForm({
      careType,
      customLabel: '',
      time: nowTime(),
      minutes: '',
      seconds: '',
      notes: '',
    });
  };

  const openEdit = (session: OralCareSessionResponse) => {
    let time = '12:00';
    if (session.start_time) {
      const { hour, minute } = instantHourMinute(session.start_time, timezone);
      time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    const duration = session.duration_seconds ?? 0;
    setEditing(session);
    setForm({
      careType: session.care_type,
      customLabel: session.custom_label ?? '',
      time,
      minutes: duration ? String(Math.floor(duration / 60)) : '',
      seconds: duration ? String(duration % 60) : '',
      notes: session.notes ?? '',
    });
  };

  const closeForm = () => {
    setForm(null);
    setEditing(null);
  };

  const formDuration = (state: FormState): number | null => {
    const total =
      (Number(state.minutes) || 0) * 60 + (Number(state.seconds) || 0);
    return total > 0 ? Math.round(total) : null;
  };

  const formInvalid =
    !form ||
    (form.careType === 'other' && form.customLabel.trim() === '') ||
    (formDuration(form) ?? 0) > 3600;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || formInvalid) return;
    const durationSeconds = formDuration(form);
    const start = localDateTimeToUtc(`${selectedDate}T${form.time}`, timezone);
    const body = {
      entry_date: selectedDate,
      start_time: start.toISOString(),
      end_time: durationSeconds
        ? new Date(start.getTime() + durationSeconds * 1000).toISOString()
        : null,
      duration_seconds: durationSeconds,
      care_type: form.careType,
      custom_label: form.careType === 'other' ? form.customLabel.trim() : null,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await updateSession.mutateAsync({ id: editing.id, data: body });
    } else {
      await createSession.mutateAsync({ ...body, provider: 'manual' });
    }
    closeForm();
  };

  const settings = summary?.settings;
  const brushingCount = summary?.brushing_count ?? 0;
  const otherCounts = useMemo(
    () =>
      summary
        ? ORAL_CARE_TYPES.filter(
            (type) => type !== 'brushing' && summary.counts_by_type[type] > 0
          ).map((type) => ({ type, count: summary.counts_by_type[type] }))
        : [],
    [summary]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Tooth className="w-5 h-5 text-sky-500" />
              {t('oralCare.title', 'Oral care')}
            </CardTitle>
            <CardDescription>
              {settings
                ? t(
                    'oralCare.goal.description',
                    'Goal: brush {{count}} times a day for {{time}} each',
                    {
                      count: settings.daily_target,
                      time: formatClock(settings.target_seconds),
                    }
                  )
                : t('oralCare.loading', 'Loading oral care...')}
            </CardDescription>
          </div>
          {!isActingOnBehalf && settings && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => setGoalDraft(settings)}
            >
              <Settings2 className="w-4 h-4" />
              {t('oralCare.goal.edit', 'Goal')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3">
              <StatLabel
                icon={Tooth}
                chip="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              >
                {t('oralCare.stats.brushed', 'Brushed')}
              </StatLabel>
              <div className="text-2xl font-semibold mt-2">
                {t('oralCare.stats.ofTarget', '{{count}} of {{target}}', {
                  count: brushingCount,
                  target: settings?.daily_target ?? 2,
                })}
              </div>
              {summary?.goal_met && (
                <Badge variant="secondary" className="mt-1">
                  {t('oralCare.stats.goalMet', 'Goal met')}
                </Badge>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <StatLabel
                icon={Clock3}
                chip="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
              >
                {t('oralCare.stats.time', 'Time brushing')}
              </StatLabel>
              <div className="text-2xl font-semibold mt-2">
                {formatClock(summary?.brushing_seconds ?? 0)}
              </div>
              {settings && brushingCount > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t('oralCare.stats.atTarget', '{{count}} reached {{time}}', {
                    count: summary?.brushes_at_target ?? 0,
                    time: formatClock(settings.target_seconds),
                  })}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <StatLabel
                icon={Flame}
                chip="bg-orange-500/10 text-orange-600 dark:text-orange-400"
              >
                {t('oralCare.stats.streak', 'Streak')}
              </StatLabel>
              <div className="text-2xl font-semibold mt-2">
                {t('oralCare.stats.days', '{{count}} days', {
                  count: summary?.streak ?? 0,
                })}
              </div>
              {history && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t('oralCare.stats.best', 'Best: {{count}} days', {
                    count: history.best_streak,
                  })}
                </div>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <StatLabel
                icon={ListChecks}
                chip="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              >
                {t('oralCare.stats.other', 'Other care')}
              </StatLabel>
              {otherCounts.length === 0 ? (
                <div className="text-2xl font-semibold mt-2">0</div>
              ) : (
                <div className="text-sm space-y-0.5 mt-2">
                  {otherCounts.map(({ type, count }) => (
                    <div key={type}>
                      {typeLabel(type)}: {count}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={() => setTimerOpen(true)}
            >
              <Timer className="w-4 h-4" />
              {t('oralCare.timer.startButton', 'Start timer')}
            </Button>
            {ORAL_CARE_TYPES.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={type === 'brushing' ? 'default' : 'outline'}
                className="gap-1"
                onClick={() => openCreate(type)}
              >
                {(() => {
                  const TypeIcon = TYPE_STYLE[type].icon;
                  return <TypeIcon className="w-4 h-4" />;
                })()}
                {typeLabel(type)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {t('oralCare.history.title', 'Sessions')}
          </CardTitle>
          <CardDescription>
            {t(
              'oralCare.history.subtitle',
              'Logged here or synced from Apple Health'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('oralCare.loading', 'Loading oral care...')}
            </div>
          ) : isError ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-destructive">
                {t(
                  'oralCare.loadError',
                  'Failed to load oral care for this day.'
                )}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          ) : !summary || summary.sessions.length === 0 ? (
            <div className="py-10 text-center border border-dashed rounded-xl border-border/60">
              <CalendarCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">
                {t('oralCare.history.empty', 'Nothing logged for this day')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {summary.sessions.map((session) => {
                const fromSparky = isSparkyOralCareProvider(session.provider);
                return (
                  <div
                    key={session.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {(() => {
                        const { icon: TypeIcon, chip } =
                          TYPE_STYLE[session.care_type];
                        return (
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chip}`}
                            aria-hidden
                          >
                            <TypeIcon className="h-4 w-4" />
                          </span>
                        );
                      })()}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">
                            {sessionLabel(session)}
                          </span>
                          {session.provider === 'timer' && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1"
                            >
                              <Timer className="h-3 w-3" />
                              {t('oralCare.source.timer', 'Timer')}
                            </Badge>
                          )}
                          {!fromSparky && (
                            <Badge
                              variant="outline"
                              className="text-[10px] gap-1"
                            >
                              <Heart className="h-3 w-3 text-rose-500" />
                              {t('oralCare.source.health', 'Apple Health')}
                            </Badge>
                          )}
                          {session.covered_by_sync && (
                            <Badge variant="secondary" className="text-[10px]">
                              {t(
                                'oralCare.coveredBySync',
                                'Also recorded by Apple Health · counted once'
                              )}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {session.start_time && (
                            <span>
                              {formatTime(session.start_time, {
                                asInstant: true,
                              })}
                            </span>
                          )}
                          {session.duration_seconds != null && (
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              <Clock3 className="h-3 w-3 text-muted-foreground" />
                              {formatClock(session.duration_seconds)}
                            </span>
                          )}
                          {session.notes && (
                            <span className="italic">{session.notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {fromSparky && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEdit(session)}
                          aria-label={t('oralCare.actions.edit', 'Edit')}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setToDelete(session.id)}
                        aria-label={t('oralCare.actions.delete', 'Delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && closeForm()}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('oralCare.dialog.editTitle', 'Edit session')
                : t('oralCare.dialog.createTitle', 'Log oral care')}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="oral-care-type">
                  {t('oralCare.dialog.type', 'Type')}
                </Label>
                <Select
                  value={form.careType}
                  onValueChange={(value) =>
                    setForm({ ...form, careType: value as OralCareType })
                  }
                >
                  <SelectTrigger id="oral-care-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORAL_CARE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {typeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.careType === 'other' && (
                <div className="space-y-2">
                  <Label htmlFor="oral-care-label">
                    {t('oralCare.dialog.customLabel', 'Name')}
                  </Label>
                  <Input
                    id="oral-care-label"
                    list="oral-care-recent-labels"
                    maxLength={50}
                    placeholder={t(
                      'oralCare.dialog.customLabelPlaceholder',
                      'e.g. Water flosser'
                    )}
                    value={form.customLabel}
                    onChange={(e) =>
                      setForm({ ...form, customLabel: e.target.value })
                    }
                  />
                  <datalist id="oral-care-recent-labels">
                    {(history?.recent_custom_labels ?? []).map((label) => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                </div>
              )}

              <div className="space-y-2">
                <Label id="oral-care-time-label">
                  {t('oralCare.dialog.time', 'Time')}
                </Label>
                <TimeInput
                  aria-labelledby="oral-care-time-label"
                  value={form.time}
                  onChange={(value) => setForm({ ...form, time: value })}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {t('oralCare.dialog.duration', 'Duration (optional)')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    aria-label={t('oralCare.dialog.minutes', 'Minutes')}
                    placeholder={t('oralCare.dialog.minutesShort', 'min')}
                    value={form.minutes}
                    onChange={(e) =>
                      setForm({ ...form, minutes: e.target.value })
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    aria-label={t('oralCare.dialog.seconds', 'Seconds')}
                    placeholder={t('oralCare.dialog.secondsShort', 'sec')}
                    value={form.seconds}
                    onChange={(e) =>
                      setForm({ ...form, seconds: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="oral-care-notes">
                  {t('oralCare.dialog.notes', 'Notes')}
                </Label>
                <Textarea
                  id="oral-care-notes"
                  rows={2}
                  maxLength={2000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForm}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    formInvalid ||
                    createSession.isPending ||
                    updateSession.isPending
                  }
                >
                  {t('common.save', 'Save')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={goalDraft !== null}
        onOpenChange={(open) => !open && setGoalDraft(null)}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>
              {t('oralCare.goal.title', 'Brushing goal')}
            </DialogTitle>
          </DialogHeader>
          {goalDraft && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="oral-care-daily-target">
                  {t('oralCare.goal.dailyTarget', 'Brushes per day')}
                </Label>
                <Select
                  value={String(goalDraft.daily_target)}
                  onValueChange={(value) =>
                    setGoalDraft({ ...goalDraft, daily_target: Number(value) })
                  }
                >
                  <SelectTrigger id="oral-care-daily-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAILY_TARGET_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oral-care-target-seconds">
                  {t('oralCare.goal.targetTime', 'Time per brush')}
                </Label>
                <Select
                  value={String(goalDraft.target_seconds)}
                  onValueChange={(value) =>
                    setGoalDraft({
                      ...goalDraft,
                      target_seconds: Number(value),
                    })
                  }
                >
                  <SelectTrigger id="oral-care-target-seconds">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_SECONDS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {formatClock(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'oralCare.goal.hint',
                  'Dentists usually recommend brushing twice a day for 2 minutes.'
                )}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGoalDraft(null)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  disabled={saveSettings.isPending}
                  onClick={async () => {
                    await saveSettings.mutateAsync(goalDraft);
                    setGoalDraft(null);
                  }}
                >
                  {t('common.save', 'Save')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('oralCare.deleteDialog.title', 'Delete this session?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'oralCare.deleteDialog.description',
                'A session synced from Apple Health comes back on the next sync unless you delete it in the Health app too.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteSession.mutate(toDelete);
                setToDelete(null);
              }}
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BrushingTimerDialog
        open={timerOpen}
        targetSeconds={settings?.target_seconds ?? 120}
        onOpenChange={setTimerOpen}
        onSave={saveTimerBrush}
      />
    </div>
  );
};
