import { allergenPreferenceKeys } from '@/api/keys/meals';
import { allergenPreferenceService } from '@/api/allergenPreferences';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import i18n from 'i18next';
export const useAllergenPreferences = () =>
  useQuery({
    queryKey: allergenPreferenceKeys.all,
    queryFn: () => allergenPreferenceService.getAll(),
    meta: {
      errorMessage: i18n.t(
        'hooks.useAllergenPreferences.failedToLoadAllergenPreferences',
        'Failed to load allergen preferences.'
      ),
    },
  });

export const useAddAllergenPreferenceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allergenName: string) =>
      allergenPreferenceService.add(allergenName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allergenPreferenceKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useAllergenPreferences.failedToAddAllergen',
        'Failed to add allergen.'
      ),
      successMessage: i18n.t(
        'hooks.useAllergenPreferences.allergenAdded',
        'Allergen added.'
      ),
    },
  });
};

export const useRemoveAllergenPreferenceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => allergenPreferenceService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: allergenPreferenceKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'hooks.useAllergenPreferences.failedToRemoveAllergen',
        'Failed to remove allergen.'
      ),
      successMessage: i18n.t(
        'hooks.useAllergenPreferences.allergenRemoved',
        'Allergen removed.'
      ),
    },
  });
};
