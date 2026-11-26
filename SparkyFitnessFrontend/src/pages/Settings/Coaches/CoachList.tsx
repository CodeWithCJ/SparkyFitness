import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  MAX_CUSTOM_COACHES,
  getBuiltinCoach,
  type CoachCondition,
  type CoachView,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/NumericInput';
import {
  useCoachPreview,
  useDeleteCustomCoach,
  useUpdateBuiltinCoach,
  useUpdateCustomCoach,
} from '@/hooks/Coaches/useCoaches';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useCustomCategories } from '@/hooks/Settings/useCustomCategories';
import { CoachEditorDialog } from './CoachEditorDialog';
import {
  becauseText,
  coachDescription,
  coachName,
  opLabel,
  ruleTitle,
  signalLabel,
  signalUnit,
} from '@/utils/coachLabels';

function ConditionRow({
  condition,
  onChange,
}: {
  condition: CoachCondition;
  onChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const id = `cond-${condition.signal}-${condition.op}`;
  if (typeof condition.value !== 'number') {
    return (
      <p className="text-sm text-muted-foreground">
        {signalLabel(t, condition.signal)} {opLabel(t, condition.op)}{' '}
        {t(`coaches.directions.${condition.value}`, condition.value)}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Label htmlFor={id} className="font-normal">
        {signalLabel(t, condition.signal)} {opLabel(t, condition.op)}
      </Label>
      <div className="w-24">
        <NumericInput
          id={id}
          value={condition.value}
          decimals={1}
          onValueChange={(next) => {
            if (next !== undefined) onChange(next);
          }}
        />
      </div>
      <span className="text-muted-foreground">
        {signalUnit(t, condition.signal)}
      </span>
    </div>
  );
}

function CoachRow({ coach }: { coach: CoachView }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const update = useUpdateBuiltinCoach();
  const preview = useCoachPreview();
  const key = coach.builtin_key ?? '';

  const setRule = (
    ruleId: string,
    patch: { enabled?: boolean; conditions?: CoachCondition[] }
  ) =>
    update.mutate({
      key,
      body: {
        rules: coach.rules.rules.map((rule) =>
          rule.id === ruleId
            ? {
                id: rule.id,
                enabled: patch.enabled ?? rule.enabled,
                conditions: patch.conditions ?? rule.conditions,
              }
            : {
                id: rule.id,
                enabled: rule.enabled,
                conditions: rule.conditions,
              }
        ),
      },
    });

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={`coach-${key}`} className="text-base">
            {coachName(t, coach.builtin_key, coach.name)}
          </Label>
          <p className="text-sm text-muted-foreground">
            {coachDescription(t, coach.builtin_key)}
          </p>
        </div>
        <Switch
          id={`coach-${key}`}
          checked={coach.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) =>
            update.mutate({ key, body: { enabled } })
          }
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="mr-1 h-4 w-4" />
        ) : (
          <ChevronRight className="mr-1 h-4 w-4" />
        )}
        {t('coaches.rulesToggle', 'When it speaks up')}
      </Button>
      <BuiltinSettings coach={coach} />
      {open && (
        <div className="space-y-4">
          {coach.rules.rules.map((rule) => (
            <div key={rule.id} className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {ruleTitle(t, coach.builtin_key, rule.id)}
                  </span>
                  <Badge variant="outline">
                    {t(`coaches.when.${rule.when}`, rule.when)}
                  </Badge>
                  {rule.kind && rule.kind !== 'gap' && (
                    <Badge variant="secondary">
                      {t(`coaches.kind.${rule.kind}`, rule.kind)}
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={rule.enabled}
                  disabled={update.isPending}
                  aria-label={ruleTitle(t, coach.builtin_key, rule.id)}
                  onCheckedChange={(enabled) => setRule(rule.id, { enabled })}
                />
              </div>
              {rule.conditions.map((condition, index) => (
                <ConditionRow
                  key={`${condition.signal}-${index}`}
                  condition={condition}
                  onChange={(value) =>
                    setRule(rule.id, {
                      conditions: rule.conditions.map((item, i) =>
                        i === index ? { ...item, value } : item
                      ),
                    })
                  }
                />
              ))}
            </div>
          ))}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={preview.isPending}
                onClick={() => preview.mutate(key)}
              >
                {t('coaches.preview.button', 'Would it speak right now?')}
              </Button>
              <InfoTooltip
                content={t(
                  'coaches.preview.tooltip',
                  'Simulates this coach against today’s logged food and exercise. Shows if any rule triggers right now, at zero AI token cost.'
                )}
              />
            </div>
            {preview.data && (
              <div
                className="text-sm"
                role="status"
                data-testid={`coach-preview-${key}`}
              >
                {preview.data.would_speak ? (
                  <>
                    <p className="font-medium">
                      {t('coaches.preview.yes', 'Yes, it would speak:')}
                    </p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {preview.data.matches.map((match) => (
                        <li key={match.rule_key}>
                          {ruleTitle(t, coach.builtin_key, match.rule_key)}
                          {': '}
                          {becauseText(t, match.because)}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {t(
                      'coaches.preview.no',
                      'No. Nothing matches right now, so it would stay quiet.'
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const NO_HABIT = 'none';

/** The few settings a built-in coach takes: the day it runs on, the habit it
 * focuses on. */
function BuiltinSettings({ coach }: { coach: CoachView }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const update = useUpdateBuiltinCoach();
  const { data: categories = [] } = useCustomCategories(user?.id);
  const wanted = getBuiltinCoach(coach.builtin_key ?? '')?.settings ?? [];
  if (wanted.length === 0) return null;
  const key = coach.builtin_key ?? '';
  const weekday =
    typeof coach.settings['weekday'] === 'number'
      ? coach.settings['weekday']
      : 0;
  const habit =
    typeof coach.settings['focus_habit_id'] === 'string'
      ? coach.settings['focus_habit_id']
      : NO_HABIT;
  const habits = categories.filter(
    (category) => category.data_type === 'boolean'
  );
  return (
    <div className="flex flex-wrap items-end gap-4">
      {wanted.includes('weekday') && (
        <div className="space-y-1.5">
          <Label htmlFor={`coach-day-${key}`}>
            {t('coaches.settings.weekday', 'Runs on')}
          </Label>
          <Select
            value={String(weekday)}
            onValueChange={(value) =>
              update.mutate({
                key,
                body: { settings: { weekday: Number(value) } },
              })
            }
          >
            <SelectTrigger id={`coach-day-${key}`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {t(`coaches.weekdays.${day}`, String(day))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {wanted.includes('focus_habit_id') && (
        <div className="space-y-1.5">
          <Label htmlFor={`coach-habit-${key}`}>
            {t('coaches.settings.focusHabit', 'Habit to focus on')}
          </Label>
          <Select
            value={habit}
            onValueChange={(value) =>
              update.mutate({
                key,
                body: {
                  settings: {
                    focus_habit_id: value === NO_HABIT ? null : value,
                  },
                },
              })
            }
          >
            <SelectTrigger id={`coach-habit-${key}`} className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_HABIT}>
                {t('coaches.settings.noHabit', 'None yet')}
              </SelectItem>
              {habits.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.display_name || item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function CustomCoachRow({ coach }: { coach: CoachView }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = useUpdateCustomCoach();
  const remove = useDeleteCustomCoach();
  const id = coach.id ?? '';
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={`coach-${id}`} className="text-base">
            {coach.name}
          </Label>
          <p className="text-sm text-muted-foreground">
            {coach.mode === 'ai_judge'
              ? t('coaches.list.aiDecides', 'The AI decides when it speaks.')
              : t('coaches.list.customRules', '{{count}} rules', {
                  count: coach.rules.rules.length,
                })}
          </p>
        </div>
        <Switch
          id={`coach-${id}`}
          checked={coach.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) =>
            update.mutate({ id, body: { enabled } })
          }
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="mr-1 h-4 w-4" />
          {t('common.edit', 'Edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          {t('common.delete', 'Delete')}
        </Button>
      </div>
      {editing && (
        <CoachEditorDialog open onOpenChange={setEditing} coach={coach} />
      )}
      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="destructive"
        title={t('coaches.editor.deleteTitle', 'Delete this coach?')}
        description={t(
          'coaches.editor.deleteBody',
          'Its settings are removed. Messages it already sent stay in your chat.'
        )}
        onConfirm={() => remove.mutate(id)}
      />
    </li>
  );
}

export function CoachList({ coaches }: { coaches: CoachView[] }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const builtins = coaches.filter((coach) => coach.kind === 'builtin');
  const customs = coaches.filter((coach) => coach.kind === 'custom');
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">
        {t('coaches.list.title', 'Your coaches')}
      </h3>
      <ul className="space-y-3">
        {builtins.map((coach) => (
          <CoachRow key={coach.builtin_key ?? coach.id} coach={coach} />
        ))}
        {customs.map((coach) => (
          <CustomCoachRow key={coach.id} coach={coach} />
        ))}
      </ul>
      {customs.length < MAX_CUSTOM_COACHES ? (
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('coaches.list.create', 'Create your own coach')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            'coaches.list.limit',
            'You have reached the limit of {{count}} coaches of your own.',
            {
              count: MAX_CUSTOM_COACHES,
            }
          )}
        </p>
      )}
      {creating && <CoachEditorDialog open onOpenChange={setCreating} />}
      <p className="text-sm text-muted-foreground">
        {t(
          'coaches.list.cost',
          'Coaches use your AI provider only when a rule matches. Without one, you get a short fixed message instead.'
        )}
      </p>
    </section>
  );
}
