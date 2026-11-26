import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  CoachNudgeState,
  UpdateBuiltinCoachBody,
  UpdateCoachProfileBody,
  UpdateCustomCoachBody,
} from '@workspace/shared';
import {
  answerCoachNudge,
  checkInNow,
  applyCoachSuggestion,
  dismissCoachSuggestion,
  fetchCoachNudgeStates,
  fetchCoachSettings,
  fetchCoachUnread,
  markCoachThreadRead,
  reactToCoachNudge,
  updateBuiltinCoach,
  updateCoachProfile,
  updateCustomCoach,
} from '../services/api/coachesApi';
import {
  coachNudgesQueryKey,
  coachSettingsQueryKey,
  coachUnreadQueryKey,
  customMeasurementsRootQueryKey,
  dailySummaryRootQueryKey,
  moodEntriesRootQueryKey,
  workoutPlansRootQueryKey,
} from './queryKeys';
import { useMobileFeatures } from './useMobileFeatures';

const UNREAD_REFETCH_MS = 5 * 60_000;

/** Whether coaches are on in this app: off until the person turns them on. */
export function useCoachesAvailable(): boolean {
  return useMobileFeatures().isEnabled('aiCoaches');
}

export function useCoachSettings() {
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachSettingsQueryKey,
    queryFn: fetchCoachSettings,
    enabled: available,
  });
}

export function useCoachUnread() {
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachUnreadQueryKey,
    queryFn: fetchCoachUnread,
    enabled: available,
    refetchInterval: UNREAD_REFETCH_MS,
  });
}

function useCoachError() {
  const { t } = useTranslation();
  return () =>
    Toast.show({
      type: 'error',
      text1: t('coaches.saveFailed', {
        defaultValue: 'Could not save your coach settings.',
      }),
    });
}

export function useUpdateCoachProfile() {
  const queryClient = useQueryClient();
  const showError = useCoachError();
  return useMutation({
    mutationFn: (body: UpdateCoachProfileBody) => updateCoachProfile(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey }),
    onError: showError,
  });
}

export function useUpdateBuiltinCoach() {
  const queryClient = useQueryClient();
  const showError = useCoachError();
  return useMutation({
    mutationFn: ({
      key,
      body,
    }: {
      key: string;
      body: UpdateBuiltinCoachBody;
    }) => updateBuiltinCoach(key, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey }),
    onError: showError,
  });
}

export function useUpdateCustomCoach() {
  const queryClient = useQueryClient();
  const showError = useCoachError();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomCoachBody }) =>
      updateCustomCoach(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey }),
    onError: showError,
  });
}

/** Reading a coach's thread marks its messages read. */
export function useMarkCoachThreadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coachId: string) => markCoachThreadRead(coachId),
    onSuccess: (unread) => {
      queryClient.setQueryData(coachUnreadQueryKey, unread);
      void queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey });
    },
  });
}

/** What changed since a message was sent: thumbs, suggestions, answers. */
export function useCoachNudgeStates(coachId: string | null) {
  const available = useCoachesAvailable();
  return useQuery({
    queryKey: coachNudgesQueryKey(coachId ?? ''),
    queryFn: () => fetchCoachNudgeStates(coachId ?? ''),
    enabled: available && !!coachId,
    staleTime: 30_000,
  });
}

export function useReactToCoachNudge(coachId: string | null) {
  const queryClient = useQueryClient();
  const showError = useCoachError();
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
      await queryClient.cancelQueries({
        queryKey: coachNudgesQueryKey(coachId),
      });
      const previous = queryClient.getQueryData<CoachNudgeState[]>(
        coachNudgesQueryKey(coachId)
      );
      queryClient.setQueryData<CoachNudgeState[]>(
        coachNudgesQueryKey(coachId),
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
    onError: (_error, _vars, context) => {
      if (coachId && context?.previous) {
        queryClient.setQueryData(
          coachNudgesQueryKey(coachId),
          context.previous
        );
      }
      showError();
    },
    onSuccess: (result) => {
      if (coachId) {
        void queryClient.invalidateQueries({
          queryKey: coachNudgesQueryKey(coachId),
        });
      }
      if (result.muted_rule) {
        void queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey });
      }
    },
  });
}

export function useAnswerCoachQuestion(coachId: string | null) {
  const queryClient = useQueryClient();
  const showError = useCoachError();
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
          queryKey: coachNudgesQueryKey(coachId),
        });
      }
      // The answer is a mood check-in or a habit log.
      void queryClient.invalidateQueries({ queryKey: moodEntriesRootQueryKey });
      void queryClient.invalidateQueries({
        queryKey: customMeasurementsRootQueryKey,
      });
    },
    onError: showError,
  });
}

/** Apply or turn down what a coach proposed. Applying changes goals or a
 * plan, so everything built on them is refreshed. */
export function useResolveCoachSuggestion(coachId: string | null) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const after = () => {
    if (coachId) {
      void queryClient.invalidateQueries({
        queryKey: coachNudgesQueryKey(coachId),
      });
    }
  };
  const apply = useMutation({
    mutationFn: (nudgeId: string) => applyCoachSuggestion(nudgeId),
    onSuccess: () => {
      after();
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      void queryClient.invalidateQueries({
        queryKey: dailySummaryRootQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: workoutPlansRootQueryKey,
      });
    },
    onError: () => {
      after();
      Toast.show({
        type: 'error',
        text1: t('coaches.suggestion.applyFailed', {
          defaultValue:
            'Could not apply this. It may already be handled or no longer apply.',
        }),
      });
    },
  });
  const dismiss = useMutation({
    mutationFn: (nudgeId: string) => dismissCoachSuggestion(nudgeId),
    onSuccess: after,
    onError: after,
  });
  return { apply, dismiss };
}

export function useCheckInNow() {
  const queryClient = useQueryClient();
  const showError = useCoachError();
  return useMutation({
    mutationFn: checkInNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coachUnreadQueryKey });
      void queryClient.invalidateQueries({ queryKey: coachSettingsQueryKey });
    },
    onError: showError,
  });
}
