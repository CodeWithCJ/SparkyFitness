import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  CoachNudgeState,
  CreateCustomCoachBody,
  PreviewCoachDraftBody,
  UpdateCustomCoachBody,
  UpdateBuiltinCoachBody,
  UpdateCoachProfileBody,
} from '@workspace/shared';
import {
  answerCoachNudge,
  checkInNow,
  resetTodayCheckin,
  applyCoachSuggestion,
  createCustomCoach,
  deleteCustomCoach,
  dismissCoachSuggestion,
  getCoachKnowledge,
  getCoachNudgeStates,
  previewCoachDraft,
  reactToCoachNudge,
  updateCustomCoach,
  getCoachSettings,
  getCoachUnread,
  markCoachThreadRead,
  previewBuiltinCoach,
  updateBuiltinCoach,
  updateCoachProfile,
} from '@/api/Coaches/coachesApi';
import { coachKeys } from '@/api/keys/coaches';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useAuth } from '@/hooks/useAuth';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import { moodKeys } from '@/api/keys/checkin';

const UNREAD_REFETCH_MS = 5 * 60_000;

/**
 * Whether coaches are on for this website. They belong to the account owner,
 * so someone acting for the owner never sees them, whatever the owner chose.
 */
export function useCoachesAvailable(): boolean {
  const { isActingOnBehalf } = useActiveUser();
  const { isEnabled } = useWebFeatures();
  return !isActingOnBehalf && isEnabled('aiCoaches');
}

export function useCoachSettings() {
  const { user } = useAuth();
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachKeys.settings(),
    queryFn: getCoachSettings,
    enabled: !!user && available,
  });
}

export function useCoachUnread() {
  const { user } = useAuth();
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachKeys.unread(),
    queryFn: getCoachUnread,
    enabled: !!user && available,
    refetchInterval: UNREAD_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateCoachProfile() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body: UpdateCoachProfileBody) => updateCoachProfile(body),
    onSuccess: (profile) => {
      queryClient.setQueryData(
        coachKeys.settings(),
        (current: Awaited<ReturnType<typeof getCoachSettings>> | undefined) =>
          current ? { ...current, profile } : current
      );
    },
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
      successMessage: t('coaches.saved', 'Saved.'),
    },
  });
}

export function useUpdateBuiltinCoach() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      key,
      body,
    }: {
      key: string;
      body: UpdateBuiltinCoachBody;
    }) => updateBuiltinCoach(key, body),
    onSuccess: (coach) => {
      queryClient.setQueryData(
        coachKeys.settings(),
        (current: Awaited<ReturnType<typeof getCoachSettings>> | undefined) =>
          current
            ? {
                ...current,
                coaches: current.coaches.map((item) =>
                  item.builtin_key === coach.builtin_key
                    ? { ...coach, unread: item.unread }
                    : item
                ),
              }
            : current
      );
      // The thread picker lists enabled coaches by id.
      void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
    },
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
    },
  });
}

export function useCoachPreview() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (key: string) => previewBuiltinCoach(key),
    meta: {
      errorMessage: t('coaches.previewFailed', 'Could not check this coach.'),
    },
  });
}

/** Marks a coach's thread read once the person opens it. */
export function useMarkCoachThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coachId: string) => markCoachThreadRead(coachId),
    onSuccess: (unread) => {
      queryClient.setQueryData(coachKeys.unread(), unread);
      void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
    },
  });
}

function useRefreshCoaches() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
    void queryClient.invalidateQueries({ queryKey: coachKeys.knowledge() });
  };
}

export function useCreateCustomCoach() {
  const refresh = useRefreshCoaches();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body: CreateCustomCoachBody) => createCustomCoach(body),
    onSuccess: refresh,
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
      successMessage: t('coaches.editor.created', 'Coach created.'),
    },
  });
}

export function useUpdateCustomCoach() {
  const refresh = useRefreshCoaches();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomCoachBody }) =>
      updateCustomCoach(id, body),
    onSuccess: refresh,
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
    },
  });
}

export function useDeleteCustomCoach() {
  const refresh = useRefreshCoaches();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: string) => deleteCustomCoach(id),
    onSuccess: refresh,
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
      successMessage: t('coaches.editor.deleted', 'Coach deleted.'),
    },
  });
}

export function usePreviewCoachDraft() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body: PreviewCoachDraftBody) => previewCoachDraft(body),
    meta: {
      errorMessage: t('coaches.previewFailed', 'Could not check this coach.'),
    },
  });
}

export function useCoachKnowledge() {
  const { user } = useAuth();
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachKeys.knowledge(),
    queryFn: getCoachKnowledge,
    enabled: !!user && available,
  });
}

/** What changed since a message was sent (thumbs, suggestions, answers),
 * for the coach thread on screen. */
export function useCoachNudgeStates(coachId: string | null) {
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachKeys.nudges(coachId ?? ''),
    queryFn: () => getCoachNudgeStates(coachId ?? ''),
    enabled: available && !!coachId,
    staleTime: 30_000,
  });
}

export function useReactToCoachNudge(coachId: string | null) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      nudgeId,
      reaction,
    }: {
      nudgeId: string;
      reaction: 1 | -1 | null;
    }) => reactToCoachNudge(nudgeId, reaction),
    onMutate: async ({ nudgeId, reaction }) => {
      if (!coachId) return;
      await queryClient.cancelQueries({ queryKey: coachKeys.nudges(coachId) });
      const previous = queryClient.getQueryData<CoachNudgeState[]>(
        coachKeys.nudges(coachId)
      );
      queryClient.setQueryData<CoachNudgeState[]>(
        coachKeys.nudges(coachId),
        (old = []) => {
          const idx = old.findIndex((item) => item.id === nudgeId);
          if (idx >= 0 && old[idx]) {
            const next = [...old];
            next[idx] = { ...old[idx], reaction };
            return next;
          }
          return [
            ...old,
            {
              id: nudgeId,
              reaction,
              suggestion_status: null,
              question: null,
              answer: null,
            },
          ];
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (coachId && context?.previous) {
        queryClient.setQueryData(coachKeys.nudges(coachId), context.previous);
      }
    },
    onSuccess: (result) => {
      if (coachId) {
        void queryClient.invalidateQueries({
          queryKey: coachKeys.nudges(coachId),
        });
      }
      if (result.muted_rule) {
        void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
        void queryClient.invalidateQueries({ queryKey: coachKeys.knowledge() });
      }
    },
    meta: {
      errorMessage: t(
        'coaches.saveFailed',
        'Could not save your coach settings.'
      ),
    },
  });
}

export function useAnswerCoachQuestion(coachId: string | null) {
  const queryClient = useQueryClient();
  const invalidateDiary = useDiaryInvalidation();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      nudgeId,
      value,
    }: {
      nudgeId: string;
      value: number | 'yes' | 'not_yet';
    }) => answerCoachNudge(nudgeId, value),
    onSuccess: () => {
      if (coachId) {
        void queryClient.invalidateQueries({
          queryKey: coachKeys.nudges(coachId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: moodKeys.all });
      invalidateDiary();
    },
    meta: {
      errorMessage: t('coaches.answerFailed', 'Could not save your answer.'),
    },
  });
}

/** Apply or turn down what a coach proposed. Applying changes goals or a
 * plan, so everything built on them is refreshed. */
export function useResolveCoachSuggestion(coachId: string | null) {
  const queryClient = useQueryClient();
  const invalidateDiary = useDiaryInvalidation();
  const { t } = useTranslation();
  const after = () => {
    if (coachId) {
      void queryClient.invalidateQueries({
        queryKey: coachKeys.nudges(coachId),
      });
    }
  };
  const apply = useMutation({
    mutationFn: (nudgeId: string) => applyCoachSuggestion(nudgeId),
    onSuccess: () => {
      after();
      invalidateDiary();
    },
    onError: after,
    meta: {
      errorMessage: t(
        'coaches.suggestion.applyFailed',
        'Could not apply this. It may already be handled or no longer apply.'
      ),
    },
  });
  const dismiss = useMutation({
    mutationFn: (nudgeId: string) => dismissCoachSuggestion(nudgeId),
    onSuccess: after,
    onError: after,
  });
  return { apply, dismiss };
}

/** Ask the coaches to look at today's data now instead of at the next
 * check-in time. New messages show in the chat. */
export function useCheckInNow() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: checkInNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coachKeys.unread() });
      void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
    },
    meta: {
      errorMessage: t('coaches.checkInNow.failed', 'Could not run a check-in.'),
    },
  });
}

/** Reset today's message count back to zero for manual testing. */
export function useResetTodayCheckin() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: resetTodayCheckin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coachKeys.unread() });
      void queryClient.invalidateQueries({ queryKey: coachKeys.settings() });
    },
    meta: {
      errorMessage: t(
        'coaches.checkInNow.resetFailed',
        'Could not reset today count.'
      ),
    },
  });
}
