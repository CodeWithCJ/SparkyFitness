import { customNutrientsKeys } from '@/api/keys/meals';
import { customNutrientService } from '@/api/Foods/customNutrients';
import type { UserCustomNutrient } from '@/types/customNutrient';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useCustomNutrients = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: customNutrientsKeys.all,
    queryFn: () => customNutrientService.getCustomNutrients(),
    meta: {
      errorMessage: t(
        'customNutrients.failedToLoadNutrients',
        'Failed to load custom Nutrients.'
      ),
    },
  });
};
export const useCreateCustomNutrientMutation = ({
  silentSuccess = false,
}: { silentSuccess?: boolean } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      unit,
      aliases,
      forSupplement,
    }: {
      name: string;
      unit: string;
      aliases?: string[];
      forSupplement?: boolean;
    }) =>
      customNutrientService.createCustomNutrient({
        name,
        unit,
        aliases,
        forSupplement,
      }),
    // Seed the cache synchronously with the row the server just returned, so callers that
    // render from it (the supplement picker) can show the new nutrient immediately. The
    // invalidations then refresh in the background — awaiting them instead would hold the
    // mutation pending for a whole extra roundtrip.
    onSuccess: (newNutrient) => {
      queryClient.setQueryData(
        customNutrientsKeys.all,
        (current: UserCustomNutrient[] | undefined) =>
          current ? [...current, newNutrient] : [newNutrient]
      );
      queryClient.invalidateQueries({
        queryKey: ['preferences', 'nutrients'],
      });
      queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
    meta: {
      errorMessage: 'Failed to add custom nutrient.',
      // The supplement editor creates one nutrient per free-text row on save, so a
      // per-nutrient toast would stack N of them in front of the one toast the user
      // is waiting on. That caller opts out and reports the save itself.
      successMessage: silentSuccess
        ? undefined
        : 'Custom nutrient added successfully.',
    },
  });
};

// Find-or-create custom nutrients from the canonical micronutrient catalog. Used by
// the supplement nutrient picker so that picking "Vitamin D" materializes a nutrient
// with the right unit, aliases and Daily Value. Idempotent, so repeated picks are safe.
export const useEnsureCatalogNutrientsMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (catalogIds: string[]) =>
      customNutrientService.ensureCatalogNutrients(catalogIds),
    // The response already carries the user's full post-seed nutrient list, so seed the
    // cache from it synchronously — the picker renders rows straight from that cache and
    // would otherwise miss the freshly-seeded ones. Invalidations refresh in the
    // background rather than holding the mutation pending for another roundtrip.
    onSuccess: (result) => {
      if (result.created.length === 0) return;
      queryClient.setQueryData(customNutrientsKeys.all, result.nutrients);
      queryClient.invalidateQueries({
        queryKey: ['preferences', 'nutrients'],
      });
      queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
    meta: {
      errorMessage: t(
        'customNutrients.failedToAddNutrient',
        'Failed to add nutrient.'
      ),
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
      aliases,
    }: {
      nutrientId: string;
      name: string;
      unit: string;
      aliases?: string[];
    }) =>
      customNutrientService.updateCustomNutrient(nutrientId, {
        name,
        unit,
        aliases,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preferences', 'nutrients'],
      });
      queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
    meta: {
      errorMessage: 'Failed to update custom nutrient.',
      successMessage: 'Custom nutrient updated successfully.',
    },
  });
};

// Delete Mutation
export const useDeleteCustomNutrientMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteAllHistory = false,
    }: {
      id: string;
      deleteAllHistory?: boolean;
    }) => customNutrientService.deleteCustomNutrient(id, deleteAllHistory),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['preferences', 'nutrients'],
      });
      queryClient.invalidateQueries({
        queryKey: customNutrientsKeys.all,
      });
    },
    meta: {
      errorMessage: 'Failed to delete custom nutrient.',
      successMessage: 'Custom nutrient deleted successfully.',
    },
  });
};
