import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFoodVariant, type CreateFoodVariantPayload, fetchFoodVariants } from '../services/api/foodsApi';
import { foodSearchQueryKey, foodsLibraryQueryKey, foodsQueryKey, foodVariantsQueryKey } from './queryKeys';

export function useFoodVariants(foodId: string, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: foodVariantsQueryKey(foodId),
    queryFn: () => fetchFoodVariants(foodId),
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    variants: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCreateFoodVariant() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: CreateFoodVariantPayload) => createFoodVariant(payload),
    onSuccess: (_variant, payload) => {
      void queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(payload.food_id), refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
      void queryClient.invalidateQueries({ queryKey: foodSearchQueryKey(''), refetchType: 'inactive' });
      void queryClient.invalidateQueries({ queryKey: foodsLibraryQueryKey(''), refetchType: 'inactive' });
    },
  });

  return {
    createVariant: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
