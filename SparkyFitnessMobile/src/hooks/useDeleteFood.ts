import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  deleteFood,
  type DeleteFoodResponse,
  type FoodDeleteMode,
  type FoodDeletionImpact,
} from '../services/api/foodsApi';
import {
  dailySummaryRootQueryKey,
  favoritesQueryKey,
  foodVariantsQueryKey,
  foodsQueryKey,
  mealPlansQueryKey,
  mealsQueryKey,
} from './queryKeys';
import { invalidateIntakeKinetics } from './invalidateIntakeKinetics';

interface UseDeleteFoodOptions {
  foodId: string;
  onSuccess?: (result?: DeleteFoodResponse) => void;
}

/** One row of the delete ActionSheet. Mirrors the exercise side. */
export interface FoodDeleteOption {
  mode: FoodDeleteMode;
  label: string;
  description: string;
  destructive: boolean;
  onSelect: () => void;
}

export function useDeleteFood({ foodId, onSuccess }: UseDeleteFoodOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const invalidateCaches = () => {
    queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId) });
    queryClient.invalidateQueries({
      queryKey: foodsQueryKey,
      refetchType: 'all',
    });
    queryClient.invalidateQueries({
      queryKey: ['foodsLibrary'],
      refetchType: 'all',
    });
    queryClient.invalidateQueries({
      queryKey: ['foodSearch'],
      refetchType: 'all',
    });
    // Favorites are a separate query root; a deleted food is cascade-removed
    // server-side, so refetch so it drops out of the Favorites section too.
    queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    queryClient.invalidateQueries({ queryKey: mealsQueryKey });
    queryClient.invalidateQueries({ queryKey: mealPlansQueryKey });
    queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
    void invalidateIntakeKinetics(queryClient);
  };

  const mutation = useMutation({
    mutationFn: (mode: FoodDeleteMode) => deleteFood(foodId, mode),
    onSuccess: (result) => {
      invalidateCaches();
      // The server downgrades a delete to a hide when another user still
      // references the food, so report what actually happened.
      if (result?.status === 'hidden') {
        Toast.show({
          type: 'info',
          text1: t('foodDelete.hidden.title', {
            defaultValue: 'Food hidden',
          }),
          text2: t('foodDelete.hidden.usedByOthers', {
            defaultValue:
              'It is used by other people, so it was hidden instead of deleted. Their history is unaffected.',
          }),
        });
      }
      onSuccess?.(result);
    },
    onError: (error) => {
      const message =
        error instanceof Error && error.message.includes('403')
          ? "You don't have permission to delete this food."
          : 'Please try again.';
      Toast.show({
        type: 'error',
        text1: t('foodDelete.failed', {
          defaultValue: 'Failed to delete food',
        }),
        text2: message,
      });
    },
  });

  /**
   * Second step: `delete_with_history` is the only mode that destroys something
   * the user cannot get back, so it is confirmed separately rather than firing
   * on a single tap.
   */
  const confirmDestructive = () => {
    Alert.alert(
      t('foodDelete.confirmWithHistoryTitle', {
        defaultValue: 'Delete entries too?',
      }),
      t('foodDelete.confirmWithHistoryMessage', {
        defaultValue:
          'This also permanently deletes your logged diary entries for this food. This cannot be undone.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => mutation.mutate('delete_with_history'),
        },
      ]
    );
  };

  /**
   * Builds the Hide / Delete / Delete-including-history choices. `impact`
   * decides which are offered: when anybody else references the food, meals and
   * meal plans would cascade out of THEIR data too, so hiding is the only
   * option that leaves them alone. A null impact (still loading) also offers
   * Hide only — assuming nobody else uses it is the one guess that can damage
   * another person's data.
   */
  const buildDeleteOptions = (
    impact: FoodDeletionImpact | null
  ): FoodDeleteOption[] => {
    const hide: FoodDeleteOption = {
      mode: 'hide',
      label: t('foodDelete.options.hide', {
        defaultValue: 'Hide from search',
      }),
      description: t('foodDelete.options.hideDescription', {
        defaultValue:
          'Keeps everything as it is. The food just stops showing up when you search.',
      }),
      destructive: false,
      onSelect: () => mutation.mutate('hide'),
    };
    if (impact == null || impact.otherUserReferences > 0) return [hide];

    return [
      hide,
      {
        mode: 'delete',
        label: t('foodDelete.options.delete', { defaultValue: 'Delete' }),
        description: t('foodDelete.options.deleteDescription', {
          defaultValue:
            'Removes it from your library, meals and meal plans. Your logged entries are kept.',
        }),
        destructive: false,
        onSelect: () => mutation.mutate('delete'),
      },
      {
        mode: 'delete_with_history',
        label: t('foodDelete.options.deleteWithHistory', {
          defaultValue: 'Delete including history',
        }),
        description: t('foodDelete.options.deleteWithHistoryDescription', {
          defaultValue:
            'Also permanently deletes your logged diary entries for this food.',
        }),
        destructive: true,
        onSelect: confirmDestructive,
      },
    ];
  };

  return {
    buildDeleteOptions,
    invalidateCaches,
    isPending: mutation.isPending,
  };
}
