import { allergenPreferenceKeys } from '@/api/keys/meals';
import { allergenPreferenceService } from '@/api/allergenPreferences';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const useAllergenPreferences = () =>
  useQuery({
    queryKey: allergenPreferenceKeys.all,
    queryFn: () => allergenPreferenceService.getAll(),
    meta: { errorMessage: 'Failed to load allergen preferences.' },
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
      errorMessage: 'Failed to add allergen.',
      successMessage: 'Allergen added.',
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
      errorMessage: 'Failed to remove allergen.',
      successMessage: 'Allergen removed.',
    },
  });
};
