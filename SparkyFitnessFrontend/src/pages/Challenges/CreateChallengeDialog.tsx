import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHALLENGE_DEFAULT_MEMBER_LIMIT,
  CHALLENGE_MAX_LENGTH_DAYS,
  CHALLENGE_MAX_MEMBER_LIMIT,
  CHALLENGE_PRESETS,
  DEFAULT_CHALLENGE_GOAL_TYPE,
  DEFAULT_CHALLENGE_PRESET_ID,
  addDays,
  challengePreset,
  challengeRulesSchema,
  challengeWeekStart,
  todayInZone,
  type ChallengeDetail,
  type ChallengeGoalType,
  type ChallengePresetId,
  type ChallengeRules,
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useChallengeUnits,
  useCreateChallenge,
} from '@/hooks/Challenges/useChallenges';
import ChallengeRulesEditor from './ChallengeRulesEditor';
import GoalTypeSelect from './GoalTypeSelect';
import { presetDescription, presetName } from './challengeCopy';

interface CreateChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The display name the form starts with (never an email). */
  defaultDisplayName: string;
  onCreated: (challenge: ChallengeDetail) => void;
}

/** A preset's end day from the start, or '' when it runs until ended. */
const presetEnd = (id: ChallengePresetId, start: string): string => {
  const { lengthDays } = challengePreset(id);
  return lengthDays === null ? '' : addDays(start, lengthDays - 1);
};

/** Weekly challenges start on a Monday, so the first week is a whole one. */
const presetStart = (id: ChallengePresetId, today: string): string =>
  challengePreset(id).rules.period === 'week'
    ? challengeWeekStart(today)
    : today;

const CreateChallengeDialog = ({
  open,
  onOpenChange,
  defaultDisplayName,
  onCreated,
}: CreateChallengeDialogProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const units = useChallengeUnits();
  const create = useCreateChallenge();
  const today = todayInZone(timezone);
  const ids = {
    name: useId(),
    emoji: useId(),
    description: useId(),
    start: useId(),
    end: useId(),
    limit: useId(),
    lateJoin: useId(),
    displayName: useId(),
  };

  const [presetId, setPresetId] = useState<ChallengePresetId>(
    DEFAULT_CHALLENGE_PRESET_ID
  );
  const [rules, setRules] = useState<ChallengeRules>(
    challengePreset(DEFAULT_CHALLENGE_PRESET_ID).rules
  );
  const [name, setName] = useState(presetName(t, DEFAULT_CHALLENGE_PRESET_ID));
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() =>
    presetStart(DEFAULT_CHALLENGE_PRESET_ID, today)
  );
  const [endDate, setEndDate] = useState(() =>
    presetEnd(DEFAULT_CHALLENGE_PRESET_ID, startDate)
  );
  const [memberLimit, setMemberLimit] = useState(
    CHALLENGE_DEFAULT_MEMBER_LIMIT
  );
  const [lateJoin, setLateJoin] = useState(true);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [goalType, setGoalType] = useState<ChallengeGoalType>(
    DEFAULT_CHALLENGE_GOAL_TYPE
  );

  const pickPreset = (id: ChallengePresetId) => {
    const start = presetStart(id, today);
    setPresetId(id);
    setRules(challengePreset(id).rules);
    setName(presetName(t, id));
    setStartDate(start);
    setEndDate(presetEnd(id, start));
  };

  const rulesValid = challengeRulesSchema.safeParse(rules).success;
  const needsEnd = rules.period === 'challenge';
  const endProblem =
    endDate && endDate < startDate
      ? t(
          'challenges.create.endBeforeStart',
          'The end cannot be before the start.'
        )
      : endDate && addDays(startDate, CHALLENGE_MAX_LENGTH_DAYS - 1) < endDate
        ? t(
            'challenges.create.tooLong',
            'A challenge lasts at most {{days}} days.',
            {
              days: CHALLENGE_MAX_LENGTH_DAYS,
            }
          )
        : needsEnd && !endDate
          ? t(
              'challenges.create.endNeeded',
              'A challenge scored as one period needs an end date.'
            )
          : null;
  const canSubmit =
    name.trim().length > 0 &&
    displayName.trim().length > 0 &&
    !!startDate &&
    rulesValid &&
    !endProblem &&
    memberLimit >= 2 &&
    memberLimit <= CHALLENGE_MAX_MEMBER_LIMIT &&
    !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        emoji: emoji.trim() || null,
        preset: presetId,
        rules,
        start_date: startDate,
        end_date: endDate || null,
        time_zone: timezone,
        member_limit: memberLimit,
        late_join: lateJoin,
        display_name: displayName.trim(),
        goal_type: goalType,
      },
      {
        onSuccess: (challenge) => {
          onOpenChange(false);
          onCreated(challenge);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('challenges.create.title', 'Start a challenge')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'challenges.create.description',
              'Pick a preset, then change anything you like. Members see your rules and every later change.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              {t('challenges.create.presets', 'Presets')}
            </p>
            <div
              className="grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label={t('challenges.create.presets', 'Presets')}
            >
              {CHALLENGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={presetId === preset.id}
                  onClick={() => pickPreset(preset.id)}
                  className={cn(
                    'rounded-md border p-3 text-left transition-colors hover:bg-accent',
                    presetId === preset.id && 'border-primary bg-accent'
                  )}
                >
                  <span className="block text-sm font-medium">
                    {presetName(t, preset.id)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {presetDescription(t, preset.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <div className="space-y-1">
              <Label htmlFor={ids.name}>
                {t('challenges.create.name', 'Name')}
              </Label>
              <Input
                id={ids.name}
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.emoji}>
                {t('challenges.create.emoji', 'Emoji')}
              </Label>
              <Input
                id={ids.emoji}
                value={emoji}
                maxLength={16}
                placeholder="🏆"
                onChange={(e) => setEmoji(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={ids.description}>
              {t(
                'challenges.create.descriptionLabel',
                'Description (optional)'
              )}
            </Label>
            <Textarea
              id={ids.description}
              value={description}
              maxLength={500}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.start}>
                {t('challenges.create.start', 'Starts')}
              </Label>
              <Input
                id={ids.start}
                type="date"
                value={startDate}
                onChange={(e) => e.target.value && setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={ids.end}>
                {needsEnd
                  ? t('challenges.create.end', 'Ends')
                  : t('challenges.create.endOptional', 'Ends (optional)')}
              </Label>
              <Input
                id={ids.end}
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {endProblem && (
            <p className="text-sm text-destructive" role="alert">
              {endProblem}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              'challenges.create.timeZone',
              'Days end at midnight in {{zone}}.',
              { zone: timezone }
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.limit}>
                {t('challenges.create.memberLimit', 'Most members')}
              </Label>
              <Input
                id={ids.limit}
                type="number"
                min={2}
                max={CHALLENGE_MAX_MEMBER_LIMIT}
                step={1}
                value={memberLimit}
                onChange={(e) =>
                  setMemberLimit(Math.round(Number(e.target.value)))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <Label htmlFor={ids.lateJoin}>
                {t(
                  'challenges.create.lateJoin',
                  'Allow joining after the start'
                )}
              </Label>
              <Switch
                id={ids.lateJoin}
                checked={lateJoin}
                onCheckedChange={setLateJoin}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={ids.displayName}>
                {t(
                  'challenges.join.displayName',
                  'Your name in this challenge'
                )}
              </Label>
              <Input
                id={ids.displayName}
                value={displayName}
                maxLength={40}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            {rules.metric === 'points' && rules.points?.goal && (
              <GoalTypeSelect value={goalType} onChange={setGoalType} />
            )}
          </div>

          <div>
            <p className="text-sm font-medium">
              {t('challenges.create.rules', 'Rules')}
            </p>
            <ChallengeRulesEditor
              rules={rules}
              onChange={setRules}
              units={units}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {t('challenges.create.submit', 'Create challenge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateChallengeDialog;
