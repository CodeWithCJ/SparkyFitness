import { useTranslation } from 'react-i18next';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuiState } from '@assistant-ui/react';
import {
  readChatCoachMessage,
  type ChatCoachMessage,
  type CoachNudgeState,
  type CoachSuggestion,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useAnswerCoachQuestion,
  useCoachNudgeStates,
  useReactToCoachNudge,
  useResolveCoachSuggestion,
} from '@/hooks/Coaches/useCoaches';

const SCALE = [1, 2, 3, 4, 5] as const;
const STATUS_TEXT = {
  applied: 'Applied.',
  dismissed: 'Not applied.',
  expired: 'This was for another day.',
} as const;

function SuggestionText({ suggestion }: { suggestion: CoachSuggestion }) {
  const { t } = useTranslation();
  const { convertEnergy, energyUnit, getEnergyUnitString } = usePreferences();
  switch (suggestion.kind) {
    case 'goal_day_protein':
      return t(
        'coaches.suggestion.goalDayProtein',
        "Raise today's protein goal to {{to}} g (from {{from}} g)? Tomorrow goes back to your usual.",
        { to: suggestion.to, from: suggestion.from }
      );
    case 'calorie_target': {
      const show = (kcal: number) =>
        Math.round(convertEnergy(kcal, 'kcal', energyUnit)).toLocaleString();
      return t(
        'coaches.suggestion.calorieTarget',
        'New daily calorie target from today: {{to}} {{unit}} (now {{from}}).',
        {
          to: show(suggestion.to_kcal),
          from: show(suggestion.from_kcal),
          unit: getEnergyUnitString(energyUnit),
        }
      );
    }
    case 'plan_changes':
      return t(
        'coaches.suggestion.planChanges',
        'Changes to your workout plan: {{up}} step-ups, {{down}} lighter days.',
        { up: suggestion.step_up, down: suggestion.lighter }
      );
  }
}

function SuggestionCard({
  coach,
  state,
  coachId,
}: {
  coach: ChatCoachMessage;
  state: CoachNudgeState | undefined;
  coachId: string;
}) {
  const { t } = useTranslation();
  const { apply, dismiss } = useResolveCoachSuggestion(coachId);
  if (!coach.suggestion) return null;
  const status = state?.suggestion_status ?? 'pending';
  const busy = apply.isPending || dismiss.isPending;
  return (
    <div
      className="mt-2 rounded-md border p-3 text-sm"
      data-testid="coach-suggestion"
    >
      <p>
        <SuggestionText suggestion={coach.suggestion} />
      </p>
      {status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => apply.mutate(coach.nudgeId)}
          >
            {t('coaches.suggestion.apply', 'Apply')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => dismiss.mutate(coach.nudgeId)}
          >
            {t('coaches.suggestion.dismiss', 'No thanks')}
          </Button>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-muted-foreground">
          {status === 'applied' && <Check className="h-4 w-4" aria-hidden />}
          {t(`coaches.suggestion.status.${status}`, STATUS_TEXT[status])}
        </p>
      )}
    </div>
  );
}

function QuestionChips({
  coach,
  state,
  coachId,
}: {
  coach: ChatCoachMessage;
  state: CoachNudgeState | undefined;
  coachId: string;
}) {
  const { t } = useTranslation();
  const answer = useAnswerCoachQuestion(coachId);
  if (!coach.question) return null;
  const answered = state?.answer !== undefined && state?.answer !== null;
  const send = (value: number | 'yes' | 'not_yet') =>
    answer.mutate({ nudgeId: coach.nudgeId, value });
  if (answered) {
    return (
      <p className="mt-2 text-sm text-muted-foreground" role="status">
        {coach.question === 'habit_done'
          ? state?.answer === 'yes'
            ? t('coaches.questions.markedDone', 'Marked done.')
            : t('coaches.questions.notYet', 'Noted. Not yet today.')
          : t('coaches.questions.saved', 'Saved to your check-in.')}
      </p>
    );
  }
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2"
      role="group"
      aria-label={t('coaches.questions.answer', 'Your answer')}
    >
      {coach.question === 'habit_done' ? (
        <>
          <Button
            size="sm"
            disabled={answer.isPending}
            onClick={() => send('yes')}
          >
            {t('coaches.questions.yes', 'Yes')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={answer.isPending}
            onClick={() => send('not_yet')}
          >
            {t('coaches.questions.notYetButton', 'Not yet')}
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">
            {t('coaches.questions.low', 'Low')}
          </span>
          {SCALE.map((value) => (
            <Button
              key={value}
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={answer.isPending}
              onClick={() => send(value)}
            >
              {value}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground">
            {t('coaches.questions.high', 'High')}
          </span>
        </>
      )}
    </div>
  );
}

function Thumbs({
  coach,
  state,
  coachId,
}: {
  coach: ChatCoachMessage;
  state: CoachNudgeState | undefined;
  coachId: string;
}) {
  const { t } = useTranslation();
  const react = useReactToCoachNudge(coachId);
  // Questions are not advice to rate.
  if (coach.question) return null;
  const current = state?.reaction ?? null;
  const press = (reaction: 1 | -1) =>
    react.mutate({
      nudgeId: coach.nudgeId,
      reaction: current === reaction ? null : reaction,
    });
  return (
    <div className="mt-1 flex items-center gap-1">
      {([1, -1] as const).map((value) => (
        <Button
          key={value}
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 transition-colors',
            current === value &&
              (value === 1
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-destructive/10 text-destructive hover:bg-destructive/20')
          )}
          aria-pressed={current === value}
          aria-label={
            value === 1
              ? t('coaches.feedback.helpful', 'This helped')
              : t('coaches.feedback.notHelpful', 'This did not help')
          }
          disabled={react.isPending}
          onClick={() => press(value)}
        >
          {value === 1 ? (
            <ThumbsUp
              className={cn(
                'h-4 w-4 transition-transform',
                current === 1 && 'fill-current text-primary scale-110'
              )}
            />
          ) : (
            <ThumbsDown
              className={cn(
                'h-4 w-4 transition-transform',
                current === -1 && 'fill-current text-destructive scale-110'
              )}
            />
          )}
        </Button>
      ))}
    </div>
  );
}

/** Under a coach's message: a suggestion to apply, a quick question to answer,
 * and a thumb either way. */
export function CoachMessageFooter() {
  const message = useAuiState((s) => s.message);
  const coach =
    message.role === 'assistant'
      ? readChatCoachMessage(message.metadata)
      : null;
  const coachId = coach?.coachId ?? null;
  const { data: states } = useCoachNudgeStates(coachId);
  if (!coach || !coachId || message.status?.type === 'running') return null;
  const state = states?.find((item) => item.id === coach.nudgeId);
  return (
    <div data-testid="coach-message-footer">
      <SuggestionCard coach={coach} state={state} coachId={coachId} />
      <QuestionChips coach={coach} state={state} coachId={coachId} />
      <Thumbs coach={coach} state={state} coachId={coachId} />
    </div>
  );
}
