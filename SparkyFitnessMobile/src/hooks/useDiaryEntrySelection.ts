import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { CopyMealSheetRef } from '../components/CopyMealSheet';
import type { FoodRowSelection } from '../components/SwipeableFoodRow';
import { accountGeneration } from '../offline/accountGeneration';
import { isPendingEntryId } from '../offline/foodEntryHandOver';
import { dropSupersededUpdate } from '../offline/foodEntryUpdateHandOver';
import {
  deleteFoodEntry,
  moveDiaryEntries,
} from '../services/api/foodEntriesApi';
import { deleteFoodEntryMeal } from '../services/api/foodEntryMealsApi';
import { getActiveServerConfig } from '../services/storage';
import type { FoodEntry } from '../types/foodEntries';
import { invalidateFoodCache } from './invalidateFoodCache';
import { foodEntryMealDetailQueryKey } from './queryKeys';
import { invalidateMealUsageCaches } from './useMeals';

function selectable(entry: FoodEntry) {
  return (
    !!entry.id &&
    !isPendingEntryId(entry.id) &&
    (!entry.food_entry_meal_id || !isPendingEntryId(entry.food_entry_meal_id))
  );
}

function selectionKey(entry: FoodEntry) {
  return entry.food_entry_meal_id
    ? `meal:${entry.food_entry_meal_id}`
    : entry.id;
}

type Action =
  | {
      kind: 'move';
      entries: readonly FoodEntry[];
      date: string;
      mealTypeId: string;
    }
  | { kind: 'delete'; entries: readonly FoodEntry[] };

export function useDiaryEntrySelection({
  date,
  entries,
  enabled,
}: {
  date: string;
  entries: readonly FoodEntry[];
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const generation = accountGeneration();
  const scope = enabled ? `${generation}/${date}` : '';
  const [selection, setSelection] = useState<{
    scope: string;
    keys: Set<string>;
  } | null>(null);
  const [moveSelection, setMoveSelection] = useState<{
    scope: string;
    entries: readonly FoodEntry[];
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [previousScope, setPreviousScope] = useState(scope);
  if (previousScope !== scope) {
    setPreviousScope(scope);
    setSelection(null);
    setMoveSelection(null);
  }
  const busy = useRef(false);
  const moveSheetRef = useRef<CopyMealSheetRef>(null);
  useEffect(() => {
    const sheet = moveSheetRef.current;
    return () => sheet?.dismiss();
  }, [scope]);
  const activeKeys =
    enabled && selection?.scope === scope ? selection.keys : null;
  const moveEntries =
    enabled && moveSelection?.scope === scope ? moveSelection.entries : null;
  const selectedEntries = activeKeys
    ? entries.filter(
        (entry) => selectable(entry) && activeKeys.has(selectionKey(entry))
      )
    : [];

  const dismissMove = useCallback(() => setMoveSelection(null), []);
  const cancelSelection = useCallback(() => {
    setSelection(null);
    moveSheetRef.current?.dismiss();
    dismissMove();
  }, [dismissMove]);

  useEffect(() => {
    if (!activeKeys && !moveEntries) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy.current) {
        if (moveEntries) moveSheetRef.current?.dismiss();
        else cancelSelection();
      }
      return true;
    });
    return () => listener.remove();
  }, [activeKeys, moveEntries, cancelSelection]);

  const rowSelection = (entry: FoodEntry): FoodRowSelection | undefined => {
    if (!enabled || (!selectable(entry) && !activeKeys)) return;
    const key = selectionKey(entry);
    return {
      active: !!activeKeys,
      selected: activeKeys?.has(key) ?? false,
      onToggle:
        selectable(entry) && !isPending
          ? () =>
              setSelection((previous) => {
                const keys = new Set(
                  previous?.scope === scope ? previous.keys : []
                );
                if (keys.has(key)) keys.delete(key);
                else keys.add(key);
                return { scope, keys };
              })
          : undefined,
    };
  };

  const run = async (action: Action) => {
    if (busy.current || generation !== accountGeneration()) return;
    busy.current = true;
    setIsPending(true);
    const uniqueEntries = new Map(
      action.entries.map((entry) => [selectionKey(entry), entry])
    );
    const foodEntryIds: string[] = [];
    const loggedMealIds: string[] = [];
    for (const entry of uniqueEntries.values()) {
      if (entry.food_entry_meal_id)
        loggedMealIds.push(entry.food_entry_meal_id);
      else foodEntryIds.push(entry.id);
    }
    const failed = new Set<string>();
    try {
      const serverConfig = await getActiveServerConfig();
      if (generation !== accountGeneration()) return;
      if (!serverConfig) throw new Error('No active server configuration');

      if (action.kind === 'move') {
        const requestStartedAt = Date.now();
        await moveDiaryEntries(
          {
            sourceDate: date,
            targetDate: action.date,
            targetMealTypeId: action.mealTypeId,
            foodEntryIds,
            loggedMealIds,
          },
          serverConfig
        );
        if (generation !== accountGeneration()) return;
        await Promise.allSettled(
          foodEntryIds.map((id) =>
            dropSupersededUpdate(
              id,
              { entry_date: action.date, meal_type_id: action.mealTypeId },
              requestStartedAt
            )
          )
        );
      } else {
        for (const [key, entry] of uniqueEntries) {
          if (generation !== accountGeneration()) return;
          try {
            if (entry.food_entry_meal_id) {
              await deleteFoodEntryMeal(entry.food_entry_meal_id, serverConfig);
            } else {
              await deleteFoodEntry(entry.id, serverConfig);
            }
          } catch {
            failed.add(key);
          }
        }
      }

      if (generation !== accountGeneration()) return;
      if (failed.size > 0) {
        setSelection({ scope, keys: failed });
        Toast.show({
          type: 'error',
          text1: t('diarySelection.deleteFailed', {
            defaultValue: 'Some entries could not be deleted',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      } else {
        cancelSelection();
      }
    } catch {
      if (generation === accountGeneration()) {
        Toast.show({
          type: 'error',
          text1:
            action.kind === 'move'
              ? t('diarySelection.moveFailed', {
                  defaultValue: 'Could not move entries',
                })
              : t('foodEntryView.errors.deleteFailed', {
                  defaultValue: 'Failed to delete',
                }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      }
    } finally {
      if (generation === accountGeneration()) {
        invalidateFoodCache(queryClient, date);
        if (action.kind === 'move' && action.date !== date) {
          invalidateFoodCache(queryClient, action.date);
        }
        for (const id of loggedMealIds) {
          void queryClient.invalidateQueries({
            queryKey: foodEntryMealDetailQueryKey(id),
          });
        }
        if (loggedMealIds.length) invalidateMealUsageCaches(queryClient);
      }
      busy.current = false;
      setIsPending(false);
    }
  };

  const openMove = (items: readonly FoodEntry[] = selectedEntries) => {
    if (!enabled || isPending || items.length === 0 || !items.every(selectable))
      return;
    const first = items[0];
    const sharedMealType = items.every(
      (item) => item.meal_type_id === first.meal_type_id
    )
      ? (first.meal_type_id ?? null)
      : null;
    setMoveSelection({ scope, entries: items });
    moveSheetRef.current?.present(date, sharedMealType, first.meal_type);
  };

  const confirmDelete = () => {
    if (!selectedEntries.length || isPending) return;
    Alert.alert(
      t('common.delete', { defaultValue: 'Delete' }),
      t('diarySelection.deleteConfirm', {
        count: selectedEntries.length,
        defaultValue: 'Delete {{count}} selected entries?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => void run({ kind: 'delete', entries: selectedEntries }),
        },
      ]
    );
  };

  return {
    isSelecting: !!activeKeys,
    selectedCount: selectedEntries.length,
    isPending,
    rowSelection,
    cancelSelection,
    confirmDelete,
    canMoveMeal: enabled && entries.length > 0 && entries.every(selectable),
    openMove,
    moveSheetRef,
    move: {
      onConfirm: (targetDate: string, mealTypeId: string) => {
        if (moveEntries?.length) {
          void run({
            kind: 'move',
            entries: moveEntries,
            date: targetDate,
            mealTypeId,
          });
        }
      },
      onDismiss: dismissMove,
      isDestinationDisabled: (targetDate: string, mealTypeId: string) =>
        !moveEntries ||
        moveEntries.every(
          (entry) =>
            entry.entry_date === targetDate && entry.meal_type_id === mealTypeId
        ),
    },
  };
}
