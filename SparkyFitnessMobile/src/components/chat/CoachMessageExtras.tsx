import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuiState } from '@assistant-ui/react-native';
import {
  readChatCoachMessage,
  type ChatCoachMessage,
  type CoachNudgeState,
  type CoachSuggestion,
} from '@workspace/shared';
import Icon from '../Icon';
import {
  useAnswerCoachQuestion,
  useCoachNudgeStates,
  useReactToCoachNudge,
  useResolveCoachSuggestion,
} from '../../hooks/useCoaches';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { energyUnitLabel, formatEnergyNumber } from '../../utils/energyUnit';
import { becauseText, coachName } from '../../utils/coachLabels';

const SCALE = [1, 2, 3, 4, 5] as const;

/** The coach's name above a message it sent, and the numbers behind it. */
export function CoachMessageHeader() {
  const { t } = useTranslation();
  const message = useAuiState((s) => s.message);
  const coach =
    message.role === 'assistant'
      ? readChatCoachMessage(message.metadata)
      : null;
  if (!coach) return null;
  return (
    <View testID="coach-message-header" className="mb-1 ml-1">
      <View className="flex-row items-center gap-1.5">
        <Icon name="sparkles" size={13} color="#888" />
        <Text className="text-text-secondary text-xs font-semibold">
          {coachName(t, coach.builtinKey, coach.name)}
        </Text>
      </View>
      {coach.because.length > 0 && (
        <Text className="text-text-muted text-xs">
          {t('coaches.because', {
            defaultValue: 'Because: {{reason}}',
            reason: becauseText(t, coach.because),
          })}
        </Text>
      )}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
  disabled,
  selected,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={`rounded-lg border px-3 py-1.5 ${
        primary
          ? 'bg-accent-primary border-accent-primary'
          : selected
            ? 'bg-surface border-accent-primary'
            : 'bg-surface border-border-subtle'
      }`}
    >
      <Text
        className={`text-sm font-semibold ${primary ? 'text-white' : 'text-text-primary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function suggestionText(
  t: ReturnType<typeof useTranslation>['t'],
  suggestion: CoachSuggestion,
  energy: { show: (kcal: number) => string; unit: string }
): string {
  switch (suggestion.kind) {
    case 'goal_day_protein':
      return t('coaches.suggestion.goalDayProtein', {
        defaultValue:
          "Raise today's protein goal to {{to}} g (from {{from}} g)? Tomorrow goes back to your usual.",
        to: suggestion.to,
        from: suggestion.from,
      });
    case 'calorie_target':
      return t('coaches.suggestion.calorieTarget', {
        defaultValue:
          'New daily calorie target from today: {{to}} {{unit}} (now {{from}}).',
        to: energy.show(suggestion.to_kcal),
        from: energy.show(suggestion.from_kcal),
        unit: energy.unit,
      });
    case 'plan_changes':
      return t('coaches.suggestion.planChanges', {
        defaultValue:
          'Changes to your workout plan: {{up}} step-ups, {{down}} lighter days.',
        up: suggestion.step_up,
        down: suggestion.lighter,
      });
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
  const energyUnit = useEnergyUnit();
  const { apply, dismiss } = useResolveCoachSuggestion(coachId);
  if (!coach.suggestion) return null;
  const status = state?.suggestion_status ?? 'pending';
  const busy = apply.isPending || dismiss.isPending;
  const settled = {
    applied: t('coaches.suggestion.status.applied', {
      defaultValue: 'Applied.',
    }),
    dismissed: t('coaches.suggestion.status.dismissed', {
      defaultValue: 'Not applied.',
    }),
    expired: t('coaches.suggestion.status.expired', {
      defaultValue: 'This was for another day.',
    }),
  } as const;
  return (
    <View
      testID="coach-suggestion"
      className="mt-2 rounded-xl border border-border-subtle bg-surface p-3"
    >
      <Text className="text-text-primary text-sm">
        {suggestionText(t, coach.suggestion, {
          show: (kcal) => formatEnergyNumber(kcal, energyUnit),
          unit: energyUnitLabel(energyUnit, t),
        })}
      </Text>
      {status === 'pending' ? (
        <View className="mt-2 flex-row gap-2">
          <ActionButton
            primary
            disabled={busy}
            label={t('coaches.suggestion.apply', { defaultValue: 'Apply' })}
            onPress={() => apply.mutate(coach.nudgeId)}
          />
          <ActionButton
            disabled={busy}
            label={t('coaches.suggestion.dismiss', {
              defaultValue: 'No thanks',
            })}
            onPress={() => dismiss.mutate(coach.nudgeId)}
          />
        </View>
      ) : (
        <Text className="text-text-secondary mt-2 text-sm">
          {settled[status]}
        </Text>
      )}
    </View>
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
      <Text className="text-text-secondary mt-2 text-sm">
        {coach.question === 'habit_done'
          ? state?.answer === 'yes'
            ? t('coaches.questions.markedDone', {
                defaultValue: 'Marked done.',
              })
            : t('coaches.questions.notYet', {
                defaultValue: 'Noted. Not yet today.',
              })
          : t('coaches.questions.saved', {
              defaultValue: 'Saved to your check-in.',
            })}
      </Text>
    );
  }
  return (
    <View className="mt-2 flex-row flex-wrap items-center gap-2">
      {coach.question === 'habit_done' ? (
        <>
          <ActionButton
            primary
            disabled={answer.isPending}
            label={t('coaches.questions.yes', { defaultValue: 'Yes' })}
            onPress={() => send('yes')}
          />
          <ActionButton
            disabled={answer.isPending}
            label={t('coaches.questions.notYetButton', {
              defaultValue: 'Not yet',
            })}
            onPress={() => send('not_yet')}
          />
        </>
      ) : (
        SCALE.map((value) => (
          <ActionButton
            key={value}
            disabled={answer.isPending}
            label={String(value)}
            onPress={() => send(value)}
          />
        ))
      )}
    </View>
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
  // A question is not advice to rate.
  if (coach.question) return null;
  const current = state?.reaction ?? null;
  const press = (reaction: 1 | -1) =>
    react.mutate({
      nudgeId: coach.nudgeId,
      reaction: current === reaction ? null : reaction,
    });
  return (
    <View className="mt-1.5 flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('coaches.feedback.helpful', {
          defaultValue: 'This helped',
        })}
        accessibilityState={{ selected: current === 1 }}
        disabled={react.isPending}
        onPress={() => press(1)}
        className={`h-8 w-8 items-center justify-center rounded-full border ${
          current === 1
            ? 'border-accent-primary bg-accent-primary/10'
            : 'border-border-subtle bg-surface'
        }`}
      >
        <Icon
          name={current === 1 ? 'thumbs-up-fill' : 'thumbs-up'}
          size={16}
          color={current === 1 ? '#3b82f6' : '#888'}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('coaches.feedback.notHelpful', {
          defaultValue: 'This did not help',
        })}
        accessibilityState={{ selected: current === -1 }}
        disabled={react.isPending}
        onPress={() => press(-1)}
        className={`h-8 w-8 items-center justify-center rounded-full border ${
          current === -1
            ? 'border-red-500 bg-red-500/10'
            : 'border-border-subtle bg-surface'
        }`}
      >
        <Icon
          name={current === -1 ? 'thumbs-down-fill' : 'thumbs-down'}
          size={16}
          color={current === -1 ? '#ef4444' : '#888'}
        />
      </Pressable>
    </View>
  );
}

/** Under a coach's message: a suggestion to apply, a quick question to answer,
 * and a thumb either way. */
export function CoachMessageFooter() {
  const message = useAuiState((s) => s.message);
  const running = useAuiState((s) => s.message.status?.type === 'running');
  const coach =
    message.role === 'assistant'
      ? readChatCoachMessage(message.metadata)
      : null;
  const coachId = coach?.coachId ?? null;
  const { data: states } = useCoachNudgeStates(coachId);
  if (!coach || !coachId || running) return null;
  const state = states?.find((item) => item.id === coach.nudgeId);
  return (
    <View testID="coach-message-footer" className="ml-1">
      <SuggestionCard coach={coach} state={state} coachId={coachId} />
      <QuestionChips coach={coach} state={state} coachId={coachId} />
      <Thumbs coach={coach} state={state} coachId={coachId} />
    </View>
  );
}
