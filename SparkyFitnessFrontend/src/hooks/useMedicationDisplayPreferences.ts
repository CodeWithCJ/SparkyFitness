import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  getMedicationDisplayPreferences,
  upsertMedicationDisplayPreference,
  deleteMedicationDisplayPreference,
  UserMedicationDisplayPreference,
} from '@/api/Medications/medicationReportService';

const medicationReportKeys = {
  preferences: ['medications', 'display-preferences'] as const,
};

export const useMedicationDisplayPreferences = () => {
  const { t } = useTranslation();

  return useQuery<UserMedicationDisplayPreference[]>({
    queryKey: medicationReportKeys.preferences,
    queryFn: getMedicationDisplayPreferences,
    meta: {
      errorMessage: t(
        'medications.reports.failedToLoadPrefs',
        'Failed to load medication display preferences.'
      ),
    },
  });
};

export const useUpsertMedicationDisplayPreferenceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<
    UserMedicationDisplayPreference,
    Error,
    { viewGroup: string; platform: string; visibleItems: string[] }
  >({
    mutationFn: ({ viewGroup, platform, visibleItems }) =>
      upsertMedicationDisplayPreference(viewGroup, platform, visibleItems),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: medicationReportKeys.preferences,
      });
    },
  });
};

export const useDeleteMedicationDisplayPreferenceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { viewGroup: string; platform: string }>({
    mutationFn: ({ viewGroup, platform }) =>
      deleteMedicationDisplayPreference(viewGroup, platform),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: medicationReportKeys.preferences,
      });
    },
  });
};
