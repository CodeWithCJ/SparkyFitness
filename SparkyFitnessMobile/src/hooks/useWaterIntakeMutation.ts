import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { fetchWaterContainers } from '../services/api/measurementsApi';
import { getServingVolume } from '../utils/unitConversions';
import type { DailySummaryRawData } from './useDailySummary';
import type { WaterContainer } from '../types/measurements';
import { dailySummaryQueryKey, waterContainersQueryKey } from './queryKeys';
import { invalidateWaterIntakeQueries } from './invalidateWaterIntake';
import { navigationRef as rootNavigationRef } from '../components/ActiveWorkoutBar';
import {
  logDrinkOrQueue,
  removeDrinkOrQueue,
  type DrinkRemoval,
  type DrinkResult,
} from '../offline/logDrink';

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
  const defaultContainer = useMemo(
    () => ({
      ...DEFAULT_WATER_CONTAINER,
      name: t('waterIntake.defaultContainer', {
        defaultValue: 'Default',
      }),
    }),
    [t]
  );

  // A container is a vessel you press repeatedly; a preset is one drink you
  // log once. Mobile had them in a single selectable row, so tapping Latte
  // only ever selected it and nothing was logged. They are separated here the
  // way web separates them, and the default is offered as a real choice so
  // there is a way back to plain water once a container exists.
  // The default exists so there is something to press before any container is
  // configured. Once real ones exist it is a phantom vessel that appears in no
  // settings list, so it steps aside -- web's carousel behaves the same way.
  const selectableContainers = useMemo(() => {
    if (!isContainersLoaded) return standardContainers;
    return standardContainers.length > 0
      ? standardContainers
      : [defaultContainer];
  }, [standardContainers, defaultContainer, isContainersLoaded]);

  // Resolved against the selectable list, never the raw one. A selection saved
  // while presets were still selectable would otherwise keep a drink as the
  // active vessel -- with no chip left to switch away from it, since presets
  // no longer appear there.
  const activeContainer =
    (selectedContainerId != null
      ? selectableContainers.find((c) => c.id === selectedContainerId)
      : undefined) ??
    standardContainers.find((c) => c.is_primary) ??
    standardContainers[0] ??
    (isContainersLoaded ? defaultContainer : undefined);

  const quickAddPresets = useMemo(
    () => (containers ?? []).filter((c) => c.is_quick_add),
    [containers]
  );

  const selectContainer = (id: number) => {
    setSelectedContainerId(id);
    void AsyncStorage.setItem(SELECTED_CONTAINER_KEY, String(id));
  };

  const showQueuedToast = () => {
    Toast.show({
      type: 'info',
      text1: t('waterIntake.queued', {
        defaultValue: 'Saved on this phone',
      }),
      text2: t('waterIntake.queuedMessage', {
        defaultValue: 'It uploads when your server can be reached.',
      }),
    });
  };

  const mutation = useMutation({
    mutationFn: async (
      changeDrinks: number
    ): Promise<DrinkResult | DrinkRemoval> => {
      if (!activeContainer) {
        throw new Error('No water container configured');
      }
      if (changeDrinks === 1) return logDrinkOrQueue(date, activeContainer.id);
      return removeDrinkOrQueue(date, activeContainer.id);
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
    onSuccess: (result) => {
      // A drink taken off on the phone: the day is read again, with the
      // removal applied on top of what the phone has.
      if ('kept' in result) {
        if (result.kept && result.result === 'queued') showQueuedToast();
        return;
      }
      // A drink waiting to upload keeps the amount shown from the press; the
      // server's total does not include it yet.
      if (result.queued) {
        showQueuedToast();
        return;
      }
      queryClient.setQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            waterIntake: { water_ml: result.response.water_ml },
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
    onSettled: (result) => {
      // Refreshing now would replace the shown amount with one that lacks the
      // waiting drink; the upload refreshes the day once it is confirmed.
      if (result && 'queued' in result && result.queued) return;
      invalidateWaterIntakeQueries(queryClient, date);
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

  // A preset logs the drink it names without becoming the selected vessel:
  // one latte should not turn the +/- buttons into a latte dispenser for the
  // rest of the day. No optimistic patch -- a linked container's credit is
  // foodWater x hydration_factor, which the client cannot predict, so the
  // server's total is what lands.
  const logPreset = useMutation({
    mutationFn: (containerId: number) => logDrinkOrQueue(date, containerId),
    onSuccess: (result) => {
      if (result.queued) {
        showQueuedToast();
        // The day's total counts the waiting drink at once.
        invalidateWaterIntakeQueries(queryClient, date);
        return;
      }
      invalidateWaterIntakeQueries(queryClient, date);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('dashboard.logDrinkFailed', {
          defaultValue: 'Could not log that drink',
        }),
      });
    },
  });

  const decrement = () => {
    if (!activeContainer) {
      noContainerAlert();
      return;
    }
    mutation.mutate(-1);
  };

  return {
    increment,
    logPreset: logPreset.mutate,
    decrement,
    isReady: !!activeContainer,
    isContainersLoaded,
    // A container's unit qualifies its own volume, so it is only meaningful
    // when it has one. The synthetic default has none, and neither does a
    // container linked to a food -- its credit comes from the food, and
    // whatever unit was left in the form when it was created is vestigial.
    // Letting that drive the card put the day's total in oz for a container
    // the user thinks of in ml. Undefined falls back to the display
    // preference.
    unit:
      activeContainer &&
      activeContainer.id !== DEFAULT_WATER_CONTAINER_ID &&
      (!activeContainer.linked_food_id || Number(activeContainer.volume) > 0)
        ? activeContainer.unit
        : undefined,
    servingVolume: activeContainer
      ? getServingVolume(activeContainer)
      : undefined,
    containers: selectableContainers,
    quickAddPresets,
    activeContainer,
    selectContainer,
  };
}
