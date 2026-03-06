import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { fetchWaterContainers, changeWaterIntake } from '../services/api/measurementsApi';
import type { DailySummaryRawData } from './useDailySummary';
import { dailySummaryQueryKey, waterContainersQueryKey } from './queryKeys';

interface UseWaterIntakeMutationOptions {
  date: string;
  enabled?: boolean;
}

export function useWaterIntakeMutation({ date, enabled = true }: UseWaterIntakeMutationOptions) {
  const queryClient = useQueryClient();

  const { data: containers, isSuccess: isContainersLoaded } = useQuery({
    queryKey: [...waterContainersQueryKey],
    queryFn: fetchWaterContainers,
    staleTime: Infinity,
    enabled,
  });

  const primaryContainer = containers?.find(c => c.is_primary)
    ?? (containers?.length === 1 ? containers[0] : undefined);

  const mutation = useMutation({
    mutationFn: async (changeDrinks: number) => {
      if (!primaryContainer) {
        throw new Error('No primary water container configured');
      }
      return changeWaterIntake({
        entryDate: date,
        changeDrinks,
        containerId: primaryContainer.id,
      });
    },
    onMutate: async (changeDrinks: number) => {
      if (!primaryContainer) return;

      await queryClient.cancelQueries({ queryKey: dailySummaryQueryKey(date) });

      queryClient.setQueryData<DailySummaryRawData>(dailySummaryQueryKey(date), (old) => {
        if (!old) return old;
        return {
          ...old,
          waterIntake: {
            water_ml: Math.max(0, (old.waterIntake.water_ml || 0) + changeDrinks * primaryContainer.volume / (primaryContainer.servings_per_container || 1)),
          },
        };
      });
    },
    onSuccess: (response) => {
      queryClient.setQueryData<DailySummaryRawData>(dailySummaryQueryKey(date), (old) => {
        if (!old) return old;
        return {
          ...old,
          waterIntake: { water_ml: response.water_ml },
        };
      });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to update water intake. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    },
  });

  const noContainerAlert = () => {
    const hasMultiple = containers && containers.length > 1;
    Alert.alert(
      hasMultiple ? 'No Primary Container' : 'No Water Containers',
      hasMultiple
        ? 'You have multiple water containers but none is marked as primary. Please set one as primary on the server.'
        : 'Please configure a water container on the server to track hydration.',
    );
  };

  const increment = () => {
    if (!primaryContainer) { noContainerAlert(); return; }
    mutation.mutate(1);
  };

  const decrement = () => {
    if (!primaryContainer) { noContainerAlert(); return; }
    mutation.mutate(-1);
  };

  return {
    increment,
    decrement,
    isReady: !!primaryContainer,
    isContainersLoaded,
    unit: primaryContainer?.unit,
    servingVolume: primaryContainer ? primaryContainer.volume / (primaryContainer.servings_per_container || 1) : undefined,
  };
}
