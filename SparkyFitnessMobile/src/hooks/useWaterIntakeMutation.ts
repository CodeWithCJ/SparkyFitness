import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import {
  fetchWaterContainers,
  changeWaterIntake,
} from '../services/api/measurementsApi';
import { getServingVolume } from '../utils/unitConversions';
import type { DailySummaryRawData } from './useDailySummary';
import { dailySummaryQueryKey, waterContainersQueryKey } from './queryKeys';
import { navigationRef as rootNavigationRef } from '../components/ActiveWorkoutBar';

const SELECTED_CONTAINER_KEY = '@SparkyFitness/selected-water-container';

interface UseWaterIntakeMutationOptions {
  date: string;
  enabled?: boolean;
}

export function useWaterIntakeMutation({
  date,
  enabled = true,
}: UseWaterIntakeMutationOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    null
  );

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_CONTAINER_KEY).then((val) => {
      if (val != null) {
        const id = Number(val);
        if (!isNaN(id)) setSelectedContainerId(id);
      }
    });
  }, []);

  const { data: containers, isSuccess: isContainersLoaded } = useQuery({
    queryKey: [...waterContainersQueryKey],
    queryFn: fetchWaterContainers,
    staleTime: Infinity,
    enabled,
  });

  // Resolve active container: user selection → primary → single fallback
  const activeContainer =
    (selectedContainerId != null
      ? containers?.find((c) => c.id === selectedContainerId)
      : undefined) ??
    containers?.find((c) => c.is_primary) ??
    (containers?.length === 1 ? containers[0] : undefined);

  const selectContainer = (id: number) => {
    setSelectedContainerId(id);
    void AsyncStorage.setItem(SELECTED_CONTAINER_KEY, String(id));
  };

  const mutation = useMutation({
    mutationFn: async (changeDrinks: number) => {
      if (!activeContainer) {
        throw new Error('No water container configured');
      }
      return changeWaterIntake({
        entryDate: date,
        changeDrinks,
        containerId: activeContainer.id,
      });
    },
    onMutate: async (changeDrinks: number) => {
      if (!activeContainer) return;

      // #2115: a linked container's water credit is foodWater(entry) x
      // hydration_factor, not the container volume -- a different number the
      // optimistic patch cannot predict. Skip it and let onSuccess/onSettled
      // apply the server's real total instead of flashing the wrong one.
      if (activeContainer.linked_food_id) return;

      await queryClient.cancelQueries({ queryKey: dailySummaryQueryKey(date) });

      queryClient.setQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            waterIntake: {
              water_ml: Math.max(
                0,
                (old.waterIntake.water_ml || 0) +
                  changeDrinks * getServingVolume(activeContainer)
              ),
            },
          };
        }
      );
    },
    onSuccess: (response) => {
      queryClient.setQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            waterIntake: { water_ml: response.water_ml },
          };
        }
      );
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('waterIntake.updateFailed', { defaultValue: 'Error' }),
        text2: t('waterIntake.updateMessage', {
          defaultValue: 'Failed to update water intake. Please try again.',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
    },
  });

  // #2115: mobile now owns container CRUD, so this no longer sends the user
  // to configure one on the server -- it takes them straight to the mobile
  // WaterContainers screen instead.
  const noContainerAlert = () => {
    const hasMultiple = containers && containers.length > 1;
    Toast.show({
      type: 'info',
      text1: hasMultiple
        ? t('waterIntake.noPrimary', { defaultValue: 'No Primary Container' })
        : t('waterIntake.noContainers', {
            defaultValue: 'No Water Containers',
          }),
      text2: hasMultiple
        ? t('waterIntake.multipleNoPrimaryMobile', {
            defaultValue:
              'You have multiple water containers but none is marked as primary. Tap to choose one.',
          })
        : t('waterIntake.configureMobile', {
            defaultValue: 'Add a water container to start tracking hydration.',
          }),
      visibilityTime: 4000,
    });
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('WaterContainers');
    }
  };

  const increment = () => {
    if (!activeContainer) {
      noContainerAlert();
      return;
    }
    mutation.mutate(1);
  };

  const decrement = () => {
    if (!activeContainer) {
      noContainerAlert();
      return;
    }
    mutation.mutate(-1);
  };

  return {
    increment,
    decrement,
    isReady: !!activeContainer,
    isContainersLoaded,
    unit: activeContainer?.unit,
    servingVolume: activeContainer
      ? getServingVolume(activeContainer)
      : undefined,
    containers,
    activeContainer,
    selectContainer,
  };
}
