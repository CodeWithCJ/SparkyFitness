import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  COACH_CYCLE_PHASES,
  COACH_DIRECTIONS,
  COACH_SIGNALS,
  COACH_SIGNAL_KEYS,
  MAX_COACH_CONDITIONS,
  MAX_COACH_RULES,
  type ChatToolCategorySlug,
  type CoachCondition,
  type CoachRule,
  type CoachSignalKey,
  type CoachView,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/NumericInput';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { CHAT_TOOL_CATEGORY_LABELS } from '@/constants/chatToolCategoryLabels';
import {
  useCoachSettings,
  useCreateCustomCoach,
  usePreviewCoachDraft,
  useUpdateCustomCoach,
} from '@/hooks/Coaches/useCoaches';
import {
  becauseText,
  opLabel,
  signalLabel,
  signalUnit,
} from '@/utils/coachLabels';

type Mode = 'rules' | 'ai_judge';
const OPS: CoachCondition['op'][] = ['lt', 'lte', 'gt', 'gte', 'eq'];
// A custom rule fires at a check-in, or right after a workout.
const WHEN_OPTIONS: CoachRule['when'][] = [
  'morning',
  'evening',
  'any',
  'after_workout',
];
// Data a coach can look at: not the assistant's own coaching tools or vision.
const DATA_ACCESS = CHAT_TOOL_CATEGORY_SLUGS.filter(
  (slug) => slug !== 'coaching' && slug !== 'vision'
);

const newId = () =>
  `r${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

const wordValues = (signal: CoachSignalKey): readonly string[] | null => {
  const kind = COACH_SIGNALS[signal].kind;
  if (kind === 'direction') return COACH_DIRECTIONS;
  if (kind === 'phase') return COACH_CYCLE_PHASES;
  return null;
};

/** Every number a rule watches is zero or more, except sleep against usual. */
const minValue = (signal: CoachSignalKey): number | undefined =>
  COACH_SIGNALS[signal].kind === 'minutes' ? undefined : 0;

function defaultCondition(signal: CoachSignalKey): CoachCondition {
  const words = wordValues(signal);
  return words
    ? { signal, op: 'eq', value: words[0] as CoachCondition['value'] }
    : { signal, op: 'lt', value: 50 };
}

const newRule = (): CoachRule => ({
  id: newId(),
  enabled: true,
  when: 'evening',
  conditions: [defaultCondition('protein_pct_of_goal')],
});

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: CoachRule;
  onChange: (rule: CoachRule) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const setCondition = (index: number, next: CoachCondition) =>
    onChange({
      ...rule,
      conditions: rule.conditions.map((c, i) => (i === index ? next : c)),
    });
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={rule.when}
          onValueChange={(when) =>
            onChange({ ...rule, when: when as CoachRule['when'] })
          }
        >
          <SelectTrigger
            className="w-44"
            aria-label={t('coaches.editor.whenLabel', 'When')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHEN_OPTIONS.map((when) => (
              <SelectItem key={when} value={when}>
                {t(`coaches.when.${when}`, when)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('coaches.editor.removeRule', 'Remove this rule')}
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {rule.conditions.map((condition, index) => {
        const words = wordValues(condition.signal);
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              value={condition.signal}
              onValueChange={(signal) =>
                setCondition(index, defaultCondition(signal as CoachSignalKey))
              }
            >
              <SelectTrigger
                className="w-60"
                aria-label={t('coaches.editor.signalLabel', 'Number to watch')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COACH_SIGNAL_KEYS.map((signal) => (
                  <SelectItem key={signal} value={signal}>
                    {signalLabel(t, signal)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {words ? (
              <Select
                value={String(condition.value)}
                onValueChange={(value) =>
                  setCondition(index, {
                    ...condition,
                    op: 'eq',
                    value: value as CoachCondition['value'],
                  })
                }
              >
                <SelectTrigger
                  className="w-44"
                  aria-label={t('coaches.editor.valueLabel', 'Value')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {words.map((word) => (
                    <SelectItem key={word} value={word}>
                      {t(`coaches.directions.${word}`, word)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Select
                  value={condition.op}
                  onValueChange={(op) =>
                    setCondition(index, {
                      ...condition,
                      op: op as CoachCondition['op'],
                    })
                  }
                >
                  <SelectTrigger
                    className="w-36"
                    aria-label={t('coaches.editor.opLabel', 'Comparison')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {opLabel(t, op)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="w-24">
                  <NumericInput
                    value={
                      typeof condition.value === 'number' ? condition.value : 0
                    }
                    decimals={1}
                    min={minValue(condition.signal)}
                    aria-label={t('coaches.editor.valueLabel', 'Value')}
                    onValueChange={(value) => {
                      if (value !== undefined) {
                        setCondition(index, { ...condition, value });
                      }
                    }}
                  />
                </div>
                <span className="text-sm text-muted-foreground">
                  {signalUnit(t, condition.signal)}
                </span>
              </>
            )}
            {rule.conditions.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(
                  'coaches.editor.removeCondition',
                  'Remove this condition'
                )}
                onClick={() =>
                  onChange({
                    ...rule,
                    conditions: rule.conditions.filter((_, i) => i !== index),
                  })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
      {rule.conditions.length < MAX_COACH_CONDITIONS && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              ...rule,
              conditions: [
                ...rule.conditions,
                defaultCondition('water_pct_of_goal'),
              ],
            })
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('coaches.editor.addCondition', 'and another condition')}
        </Button>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The coach being edited; absent for a new one. */
  coach?: CoachView;
}

/** Create or edit a coach of your own: its name, how it talks, what data it
 * may look at, and when it speaks up (rules, or the AI decides). */
export function CoachEditorDialog({ open, onOpenChange, coach }: Props) {
  const { t } = useTranslation();
  const { data: settings } = useCoachSettings();
  const create = useCreateCustomCoach();
  const update = useUpdateCustomCoach();
  const preview = usePreviewCoachDraft();
  const hasAi = settings?.has_ai_service ?? false;

  const [name, setName] = useState(coach?.name ?? '');
  const [instructions, setInstructions] = useState(coach?.instructions ?? '');
  const [access, setAccess] = useState<ChatToolCategorySlug[]>(
    coach?.tool_categories ?? ['food', 'exercise']
  );
  const [mode, setMode] = useState<Mode>(coach?.mode ?? 'rules');
  const [rules, setRules] = useState<CoachRule[]>(
    coach?.rules.rules.length ? coach.rules.rules : [newRule()]
  );
  const [aiRule, setAiRule] = useState(coach?.ai_rule ?? '');

  const canSave =
    name.trim().length > 0 &&
    access.length > 0 &&
    (mode === 'rules' ? rules.length > 0 : aiRule.trim().length > 0);
  const saving = create.isPending || update.isPending;

  const save = () => {
    const body = {
      name: name.trim(),
      instructions: instructions.trim() || null,
      tool_categories: access,
      mode,
      rules: { version: 1 as const, rules: mode === 'rules' ? rules : [] },
      ai_rule: mode === 'ai_judge' ? aiRule.trim() : null,
      enabled: coach?.enabled ?? true,
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (coach?.id) update.mutate({ id: coach.id, body }, done);
    else create.mutate(body, done);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {coach
              ? t('coaches.editor.editTitle', 'Edit coach')
              : t('coaches.editor.newTitle', 'Create your own coach')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'coaches.editor.description',
              'Choose what it talks about, what it may look at, and when it speaks up.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="coach-name">
              {t('coaches.editor.name', 'Name')}
            </Label>
            <Input
              id="coach-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coach-instructions">
              {t('coaches.editor.instructions', 'How it should talk to me')}
            </Label>
            <Textarea
              id="coach-instructions"
              value={instructions}
              maxLength={1000}
              rows={3}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('coaches.editor.access', 'What it may look at')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {DATA_ACCESS.map((slug) => {
                const [key, fallback] = CHAT_TOOL_CATEGORY_LABELS[slug];
                return (
                  <Toggle
                    key={slug}
                    size="sm"
                    variant="outline"
                    pressed={access.includes(slug)}
                    onPressedChange={(on) =>
                      setAccess(
                        on
                          ? [...access, slug]
                          : access.filter((item) => item !== slug)
                      )
                    }
                    className="h-7 px-2 text-xs"
                  >
                    {t(key, fallback)}
                  </Toggle>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('coaches.editor.when', 'When it should speak up')}</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="rules"
                  id="coach-mode-rules"
                  className="mt-1"
                />
                <Label htmlFor="coach-mode-rules" className="font-normal">
                  <span className="font-medium">
                    {t(
                      'coaches.editor.modeRules',
                      'Only when these rules match'
                    )}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t(
                      'coaches.editor.modeRulesHint',
                      'No AI is used until a rule matches.'
                    )}
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="ai_judge"
                  id="coach-mode-ai"
                  className="mt-1"
                  disabled={!hasAi}
                />
                <Label htmlFor="coach-mode-ai" className="font-normal">
                  <span className="font-medium">
                    {t('coaches.editor.modeAi', 'Let the AI decide')}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {hasAi
                      ? t(
                          'coaches.editor.modeAiHint',
                          'One AI call at each check-in (up to {{count}} a day) to decide whether to speak.',
                          { count: settings?.profile.checkin_times.length ?? 3 }
                        )
                      : t(
                          'coaches.editor.modeAiNeedsProvider',
                          'Needs an AI provider. Add one in Settings first.'
                        )}
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {mode === 'rules' ? (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onChange={(next) =>
                    setRules(
                      rules.map((item) => (item.id === rule.id ? next : item))
                    )
                  }
                  onRemove={() =>
                    setRules(rules.filter((item) => item.id !== rule.id))
                  }
                />
              ))}
              {rules.length < MAX_COACH_RULES && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRules([...rules, newRule()])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t('coaches.editor.addRule', 'Add a rule')}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="coach-ai-rule">
                {t('coaches.editor.aiRule', 'What should it watch for?')}
              </Label>
              <Textarea
                id="coach-ai-rule"
                value={aiRule}
                maxLength={500}
                rows={3}
                placeholder={t(
                  'coaches.editor.aiRulePlaceholder',
                  'Tell me if anything looks off for my half marathon on 14 March.'
                )}
                onChange={(event) => setAiRule(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              disabled={preview.isPending}
              onClick={() =>
                preview.mutate({
                  mode,
                  rules: mode === 'rules' ? { version: 1, rules } : undefined,
                })
              }
            >
              {t('coaches.preview.today', 'Preview today')}
            </Button>
            {preview.data && (
              <p className="text-sm text-muted-foreground" role="status">
                {preview.data.note === 'ai_decides'
                  ? t(
                      'coaches.preview.aiDecides',
                      'The AI decides at each check-in, so there is nothing to check here.'
                    )
                  : preview.data.would_speak
                    ? t('coaches.preview.yes', 'Yes, it would speak:') +
                      ' ' +
                      preview.data.matches
                        .map((match) => becauseText(t, match.because))
                        .join('; ')
                    : t(
                        'coaches.preview.no',
                        'No. Nothing matches right now, so it would stay quiet.'
                      )}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button disabled={!canSave || saving} onClick={save}>
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
