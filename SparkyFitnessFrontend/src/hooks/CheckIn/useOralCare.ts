import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  CreateOralCareSessionBody,
  OralCareSettings,
  UpdateOralCareSessionBody,
} from '@workspace/shared';
import {
  createOralCareSession,
  deleteOralCareSession,
  fetchOralCareDaySummary,
  fetchOralCareHistory,
  saveOralCareSettings,
  updateOralCareSession,
} from '@/api/CheckIn/oralCareService';
import { oralCareKeys } from '@/api/keys/checkin';

export const useOralCareDaySummary = (date: string) =>
  useQuery({
    queryKey: oralCareKeys.daySummary(date),
    queryFn: () => fetchOralCareDaySummary(date),
    enabled: Boolean(date),
  });

export const useOralCareHistory = (startDate: string, endDate: string) =>
  useQuery({
    queryKey: oralCareKeys.history(startDate, endDate),
    queryFn: () => fetchOralCareHistory(startDate, endDate),
    enabled: Boolean(startDate && endDate),
  });

// Every write can change the day's counts, the streak and the history, so the
// whole oral care family is refreshed.
const useInvalidateOralCare = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: oralCareKeys.all });
};

export const useCreateOralCareSessionMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateOralCare();
  return useMutation({
    mutationFn: (data: CreateOralCareSessionBody) =>
      createOralCareSession(data),
    onSuccess: invalidate,
    meta: {
      errorMessage: t('oralCare.errors.save', 'Could not save the session.'),
    },
  });
};

export const useUpdateOralCareSessionMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateOralCare();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateOralCareSessionBody;
    }) => updateOralCareSession(id, data),
    onSuccess: invalidate,
    meta: {
      errorMessage: t('oralCare.errors.save', 'Could not save the session.'),
    },
  });
};

export const useDeleteOralCareSessionMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateOralCare();
  return useMutation({
    mutationFn: (id: string) => deleteOralCareSession(id),
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'oralCare.errors.delete',
        'Could not delete the session.'
      ),
    },
  });
};

export const useSaveOralCareSettingsMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateOralCare();
  return useMutation({
    mutationFn: (settings: OralCareSettings) => saveOralCareSettings(settings),
    onSuccess: invalidate,
    meta: {
      errorMessage: t('oralCare.errors.goal', 'Could not save the goal.'),
      successMessage: t('oralCare.goal.saved', 'Brushing goal saved.'),
    },
  });
};
