import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import {
  fetchWaterContainers,
  changeWaterIntake,
} from '../services/api/measurementsApi';
import { getServingVolume } from '../utils/unitConversions';
import type { DailySummaryRawData } from './useDailySummary';
import type { WaterContainer } from '../types/measurements';
import { dailySummaryQueryKey, waterContainersQueryKey } from './queryKeys';
import { navigationRef as rootNavigationRef } from '../components/ActiveWorkoutBar';

/**
 * Stand-in used when the user has no standard container of their own, matching
 * the web client's fallback. 2000 ml over 8 servings is 250 ml a press, the
 * same figure the server uses when it cannot resolve a container id.
 */
export const DEFAULT_WATER_CONTAINER_ID = -1;
const DEFAULT_WATER_CONTAINER = {
  id: DEFAULT_WATER_CONTAINER_ID,
  name: 'Default Container',
  volume: 2000,
  unit: 'ml',
  servings_per_container: 8,
  is_primary: true,
  hydration_factor: 1,
} as WaterContainer;

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

  // Quick-add presets are their own chips; they are drinks, not the container
  // the +/- buttons measure plain water with.
  const standardContainers = useMemo(
    () => (containers ?? []).filter((c) => !c.is_quick_add),
    [containers]
  );

  // Resolve the active container the way the web client does: user selection →
  // primary → the first standard container → a synthetic default. Mobile used
  // to give up whenever there were several containers and none was primary,
  // which left the gauge with nothing to press and no way to fix it.
  //
  // The synthetic container is never sent to the server as a real id: the
  // server does not find id -1 and falls back to its own 2000 ml / 8 default,
  // which is the same amount this describes.
  const activeContainer =
    (selectedContainerId != null
      ? containers?.find((c) => c.id === selectedContainerId)
      : undefined) ??
    standardContainers.find((c) => c.is_primary) ??
    standardContainers[0] ??
    (isContainersLoaded ? DEFAULT_WATER_CONTAINER : undefined);

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
      // optimistic patch cannot predict. getServingVolume returns null for
      // those, so skip and let onSuccess/onSettled apply the server's real
      // total instead of flashing the wrong one.
      const perPressMl = getServingVolume(activeContainer);
      if (perPressMl == null) return;

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
                (old.waterIntake.water_ml || 0) + changeDrinks * perPressMl
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
    // The synthetic default has no unit of its own, so callers fall back to
    // the user's display preference rather than being forced into ml.
    unit:
      activeContainer && activeContainer.id !== DEFAULT_WATER_CONTAINER_ID
        ? activeContainer.unit
        : undefined,
    servingVolume: activeContainer
      ? getServingVolume(activeContainer)
      : undefined,
    containers,
    activeContainer,
    selectContainer,
  };
}
