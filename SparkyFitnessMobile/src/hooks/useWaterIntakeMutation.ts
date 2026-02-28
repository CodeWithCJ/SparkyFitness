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

  const { data: containers } = useQuery({
    queryKey: [...waterContainersQueryKey],
    queryFn: fetchWaterContainers,
    staleTime: Infinity,
    enabled,
  });

  const primaryContainer = containers?.find(c => c.is_primary);

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
            water_ml: Math.max(0, (old.waterIntake.water_ml || 0) + changeDrinks * primaryContainer.volume),
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
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
      Alert.alert('Error', 'Failed to update water intake. Please try again.');
    },
  });

  const increment = () => {
    if (!primaryContainer) {
      Alert.alert('Error', 'No primary water container configured on the server.');
      return;
    }
    mutation.mutate(1);
  };

  const decrement = () => {
    if (!primaryContainer) {
      Alert.alert('Error', 'No primary water container configured on the server.');
      return;
    }
    mutation.mutate(-1);
  };

  return {
    increment,
    decrement,
    isReady: !!primaryContainer,
    unit: primaryContainer?.unit,
  };
}
