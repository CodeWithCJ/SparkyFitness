import { customNutrientsKeys } from '@/api/keys/meals';
import { customNutrientService } from '@/api/Foods/customNutrients';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useCustomNutrients = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: customNutrientsKeys.all,
    queryFn: () => customNutrientService.getCustomNutrients(),
    meta: {
      errorTitle: t('common.error', 'Error'),
      errorMessage: t(
        'customNutrients.failedToLoadNutrients',
        'Failed to load custom Nutrients.'
      ),
    },
  });
};
export const useCreateCustomNutrientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, unit }: { name: string; unit: string }) =>
      customNutrientService.createCustomNutrient({ name, unit }),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
  });
};

// Update Mutation
export const useUpdateCustomNutrientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      nutrientId,
      name,
      unit,
    }: {
      nutrientId: string;
      name: string;
      unit: string;
    }) =>
      customNutrientService.updateCustomNutrient(nutrientId, { name, unit }),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
  });
};

// Delete Mutation
export const useDeleteCustomNutrientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customNutrientService.deleteCustomNutrient(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
  });
};
