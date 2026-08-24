import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  type AccessibilityActionEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { toHourMinute } from '@workspace/shared';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { mealTypesQueryKey } from '../hooks/queryKeys';
import {
  fetchMealTypes,
  createMealType,
  updateMealType,
  deleteMealType,
} from '../services/api/mealTypesApi';
import { addLog } from '../services/LogService';
import Icon from '../components/Icon';
import Switch from '../components/ui/Switch';
import MealTypeFormSheet, { type MealTypeFormSheetRef } from '../components/MealTypeFormSheet';
import MealTypeTimePickerSheet, {
  type MealTypeTimePickerSheetRef,
} from '../components/MealTypeTimePickerSheet';
import { MEAL_CONFIG } from '../constants/meals';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import { computeReorderTargetIndex, computeReorderPreviewShift } from '../components/WorkoutReorderList';
import type { IconName } from '../components/Icon';
import type { MealType } from '../types/mealTypes';
import type { RootStackScreenProps } from '../types/navigation';
import {
  assignCustomTypesToGaps,
  buildUnifiedList,
  deriveGapsFromUnified,
  DEFAULT_CREATE_GAP,
  MAX_CUSTOM_PER_GAP,
  GAP_USER_LABEL,
  GAP_SLOT_RANGE,
  slotsForGap,
  type MealGapKey,
} from '../utils/mealTypeSlots';

type MealTypeSettingsScreenProps = RootStackScreenProps<'MealTypeSettings'>;

/** Fixed row height for the drag geometry (all rows share the same density). */
// The final settings mockup is a CONTINUOUS list of rows (border-b separators,
// no margin between them), so the drag geometry uses the real rendered stride:
// exactly ROW_HEIGHT. WorkoutReorderList's 8px gap does not apply here.
const ROW_HEIGHT = 64;
const ROW_GAP = 0;
const LONG_PRESS_MS = 150;

/** Canonical FILLED system icon for a system meal-type name (MEAL_CONFIG). */
function getSystemMealTypeIcon(name: string): IconName {
  const lower = name.toLowerCase();
  const key = lower === 'snack' ? 'snacks' : lower;
  return (MEAL_CONFIG[key]?.icon as IconName | undefined) ?? 'meal-snack';
}

/**
 * Module-scope CUSTOM meal-type row (stable component identity; gesture-driven).
 * System rows are rendered by the module-scope SystemMealTypeRow below — both
 * share useMealTypeRowDragPreviewStyle so the WHOLE unified list opens a real
 * live gap preview during a drag (active row floats, every other row springs
 * one stride toward the origin as the finger crosses it).
 */

/**
 * Shared drag-preview animated style for BOTH row kinds (system + custom):
 * - the ACTIVE row floats (follows the finger, slight scale, lift shadow);
 * - every OTHER row — custom siblings AND system anchors — springs exactly
 *   one row stride toward the drag origin while it sits between the active
 *   row and the LIVE target index, so the list closes the old gap and opens
 *   the new one naturally (no stationary hole at the source position).
 *
 * System rows therefore PARTICIPATE in the transient visual preview as
 * passive siblings, but stay non-draggable and their persisted anchors are
 * never rewritten — only custom sort_order is ever persisted (see
 * moveCustomType / doPersist). Spring values match WorkoutReorderList so the
 * interaction feels like the app's existing reorder UI.
 *
 * During the commit handoff the active row keeps its FINAL translate
 * (`committingTranslate`) so the drop preview hands off to the reordered
 * render with no snap-back; the screen's post-render effect clears the shared
 * values only after the new unified order has rendered.
 */
export function useMealTypeRowDragPreviewStyle(
  rowIndex: number,
  activeDragIndex: SharedValue<number>,
  panY: SharedValue<number>,
  committingTranslate: SharedValue<number>,
  targetIndex: SharedValue<number>,
  strides: number[],
) {
  return useAnimatedStyle(() => {
    const active = activeDragIndex.value;
    if (active === rowIndex) {
      const ty =
        committingTranslate.value !== 0
          ? committingTranslate.value
          : panY.value;
      return {
        transform: [{ translateY: ty }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 8,
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };
    }
    // Reanimated applies animated styles as diffs — keys omitted from a later
    // update keep their last value — so the lift shadow must be zeroed
    // explicitly in every non-dragged branch.
    if (active < 0) {
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        elevation: 0,
        shadowOpacity: 0,
      };
    }
    const shift = computeReorderPreviewShift(
      rowIndex,
      active,
      targetIndex.value,
      strides[active],
    );
    return {
      transform: [
        { translateY: withSpring(shift, { damping: 44, stiffness: 960 }) },
        { scale: 1 },
      ],
      zIndex: 0,
      elevation: 0,
      shadowOpacity: 0,
    };
  });
}

/**
 * Releases a frozen drag preview (active row float + sibling shifts) back to
 * idle. Called by the REJECTED-drop path (e.g. a full-gap drop): the gesture
 * already froze the preview in onEnd, so a rejection must clear the shared
 * values or the rows stay stuck translated. An ACCEPTED move resets through
 * the post-render effect instead (pendingDragResetRef), so the preview hands
 * off to the reordered render with no snap-back.
 */
export function resetMealTypeDragPreview(
  activeDragIndex: SharedValue<number>,
  panY: SharedValue<number>,
  committingTranslate: SharedValue<number>,
): void {
  committingTranslate.value = 0;
  activeDragIndex.value = -1;
  panY.value = 0;
}

const CustomMealTypeRow: React.FC<{
  mt: MealType;
  index: number;
  totalRows: number;
  t: ReturnType<typeof useTranslation>['t'];
  onEdit: (mt: MealType) => void;
  onTime: (mt: MealType) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility: (mt: MealType, value: boolean) => void;
  textMuted: string;
  textSecondary: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
}> = ({
  mt,
  index,
  totalRows,
  t,
  onEdit,
  onTime,
  onMove,
  onToggleVisibility,
  textMuted,
  textSecondary,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      activeDragIndex.value = index;
      panY.value = 0;
    })
    .onUpdate((event) => {
      panY.value = event.translationY;
    })
    .onEnd(() => {
      const from = activeDragIndex.value;
      // Live UI-thread target (same calculation as the sibling preview uses),
      // so the committed destination always matches the gap the user sees.
      const to = targetIndex.value;
      if (from >= 0 && from !== to) {
        // Commit handoff (WorkoutReorderList pattern): keep the active row's
        // final translate while the JS reorder state commits — no snap-back to
        // origin before React re-renders the row at its destination.
        committingTranslate.value = panY.value;
        // Worklet → JS boundary: onMove must run on the JS thread.
        runOnJS(onMove)(from, to);
      } else {
        activeDragIndex.value = -1;
        panY.value = 0;
      }
    });

  const previewStyle = useMealTypeRowDragPreviewStyle(
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    strides,
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      onMove(index, Math.min(index + 1, totalRows - 1));
    } else if (event.nativeEvent.actionName === 'decrement') {
      onMove(index, Math.max(index - 1, 0));
    }
  };

  return (
    <Animated.View
      key={mt.id}
      testID={`meal-type-custom-${mt.id}`}
      className="flex-row items-center bg-surface border-b border-border/40"
      style={[previewStyle, { height: ROW_HEIGHT }]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          testID={`drag-handle-${mt.id}`}
          className="px-4 py-3"
          accessibilityRole="adjustable"
          accessibilityLabel={t('mealTypeSettings.reorder', { defaultValue: 'Reorder {{name}}', name: mt.name })}
          accessibilityActions={[
            { name: 'decrement', label: t('mealTypeSettings.moveUp', { defaultValue: 'Move up' }) },
            { name: 'increment', label: t('mealTypeSettings.moveDown', { defaultValue: 'Move down' }) },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <Icon name="reorder-handle" size={22} color={textMuted} />
        </View>
      </GestureDetector>
      <TouchableOpacity
        className="flex-1 py-3 flex-shrink"
        onPress={() => onEdit(mt)}
        activeOpacity={0.6}
        accessibilityLabel={t('mealTypeSettings.edit', { defaultValue: 'Edit {{name}}', name: mt.name })}
        testID={`edit-custom-${mt.id}`}
      >
        <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
          {mt.name}
        </Text>
      </TouchableOpacity>
      <MealTypeTimeCell mealType={mt} onPress={() => onTime(mt)} textSecondary={textSecondary} t={t} />
      <View className="pr-4 pl-1">
        <Switch
          value={mt.is_visible}
          onValueChange={(val) => onToggleVisibility(mt, val)}
          accessibilityLabel={t('mealTypeSettings.visible', { defaultValue: 'Visible {{name}}', name: mt.name })}
        />
      </View>
    </Animated.View>
  );
};

/**
 * Module-scope SYSTEM meal-type row: an ANIMATED shell (so it can visually
 * shift as a passive sibling during a drag preview) but with NO drag gesture,
 * NO drag handle and NO accessibility reorder actions — system anchors are
 * fixed in data/reorder semantics and can never become active. The shared
 * preview hook only ever yields 0 for it as the active row, and the shift
 * range excludes the active index, so it can never be dragged.
 */
const SystemMealTypeRow: React.FC<{
  mt: MealType;
  index: number;
  onEdit: (mt: MealType) => void;
  onTime: (mt: MealType) => void;
  onToggleVisibility: (mt: MealType, value: boolean) => void;
  accentColor: string;
  textSecondary: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
  t: ReturnType<typeof useTranslation>['t'];
}> = ({
  mt,
  index,
  t,
  onEdit,
  onTime,
  onToggleVisibility,
  accentColor,
  textSecondary,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const previewStyle = useMealTypeRowDragPreviewStyle(
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    strides,
  );

  return (
    <Animated.View
      key={mt.id}
      className="flex-row items-center bg-surface border-b border-border/40"
      style={[previewStyle, { height: ROW_HEIGHT }]}
      testID={`meal-type-system-${mt.id}`}
    >
      <View className="px-4 py-3">
        <Icon name={getSystemMealTypeIcon(mt.name)} size={22} color={accentColor} />
      </View>
      <TouchableOpacity
        className="flex-1 py-3 flex-shrink"
        onPress={() => onEdit(mt)}
        activeOpacity={0.6}
        accessibilityLabel={t('mealTypeSettings.edit', { defaultValue: 'Edit {{name}}', name: getMealTypeDisplayLabel(mt, t) })}
        testID={`edit-system-${mt.id}`}
      >
        <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
          {getMealTypeDisplayLabel(mt, t)}
        </Text>
      </TouchableOpacity>
      <MealTypeTimeCell mealType={mt} onPress={() => onTime(mt)} textSecondary={textSecondary} t={t} />
      <View className="pr-4 pl-1">
        <Switch
          value={mt.is_visible}
          onValueChange={(val) => onToggleVisibility(mt, val)}
          accessibilityLabel={t('mealTypeSettings.visible', { defaultValue: 'Visible {{name}}', name: getMealTypeDisplayLabel(mt, t) })}
        />
      </View>
    </Animated.View>
  );
};

const MealTypeSettingsScreen: React.FC<MealTypeSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const textSecondary = useCSSVariable('--color-text-secondary') as string;

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [editingType, setEditingType] = useState<MealType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const formSheetRef = useRef<MealTypeFormSheetRef>(null);
  const timePickerRef = useRef<MealTypeTimePickerSheetRef>(null);

  const { data: mealTypes, isLoading, isError, refetch } = useQuery({
    queryKey: mealTypesQueryKey,
    queryFn: fetchMealTypes,
    staleTime: 0,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: mealTypesQueryKey });
  }, [queryClient]);

  /**
   * Per-field mutation ownership (CodeRabbit P1) + SERIALIZED network writes
   * with SYNCHRONOUS per-record slot reservation (CodeRabbit P1 5231725071).
   *
   * Three layers, deliberately distinct:
   *
   * 1. Optimistic ownership: every mutation gets a unique token allocated at
   *    the SYNCHRONOUS user-action boundary (before any await), and field
   *    ownership is recorded in `fieldOwnerRef: Map<'<id>:<field>', token>`
   *    at that same boundary. A mutation may roll back/merge a field ONLY
   *    while it still owns that field — a newer user action that took the
   *    field over is never touched by an older completion. The optimistic
   *    cache write after `cancelQueries` is ALSO ownership-guarded, so a
   *    delayed older onMutate cannot overwrite a newer optimistic value.
   *
   * 2. Network execution ordering: `updateRequestQueueRef` reserves a queue
   *    SLOT per record SYNCHRONOUSLY at the user-action boundary (before
   *    `cancelQueries`). The slot is a `done` promise; `mutationFn` waits for
   *    the predecessor slot, performs the PUT, and resolves its own slot in
   *    a `finally`. The newest user intent is therefore always the last
   *    server write regardless of cancellation/network timing. Different
   *    record IDs may still run concurrently.
   */
  interface UpdateReservation {
    predecessor: Promise<void>;
    done: Promise<void>;
    resolveDone: () => void;
  }

  interface GenericUpdateVars {
    id: string;
    data: Partial<Omit<MealType, 'id'>>;
    token: number;
    previousFields: Record<string, unknown>;
    optimisticFields: Record<string, unknown>;
    reservation: UpdateReservation;
  }

  const mutationTokenRef = useRef(0);
  const fieldOwnerRef = useRef<Map<string, number>>(new Map());
  const updateRequestQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  // Per-record count of in-flight generic updates, used to gate the
  // authoritative invalidate until the queue for that record drains.
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map());

  const updateMutation = useMutation<
    MealType,
    Error,
    GenericUpdateVars,
    {
      id: string;
      token: number;
      previousFields: Record<string, unknown>;
      optimisticFields: Record<string, unknown>;
    }
  >({
    mutationFn: ({ id, data, reservation }: GenericUpdateVars) => {
      // Wait for the reserved predecessor slot, then PUT. The slot is
      // released in `finally` so a failed PUT never blocks the next one.
      return reservation.predecessor
        .then(async () => updateMealType(id, data))
        .finally(() => {
          reservation.resolveDone();
        });
    },
    onMutate: ({ id, data, token, previousFields, optimisticFields }: GenericUpdateVars) => {
      // The slot + ownership were already reserved synchronously by
      // `mutateMealType`. Here we only cancel in-flight fetches and then apply
      // the guarded optimistic cache write: a field is written ONLY if this
      // mutation still owns it (a newer mutation may have taken it over while
      // cancelQueries was pending).
      return queryClient.cancelQueries({ queryKey: mealTypesQueryKey }).then(() => {
        queryClient.setQueryData<MealType[]>(mealTypesQueryKey, (old) =>
          (old ?? []).map((mt) => {
            if (mt.id !== id) return mt;
            const next = { ...mt };
            for (const [field, value] of Object.entries(data)) {
              const key = `${id}:${field}`;
              if (fieldOwnerRef.current.get(key) !== token) continue;
              (next as unknown as Record<string, unknown>)[field] = value;
            }
            return next;
          }),
        );
        return { id, token, previousFields, optimisticFields };
      });
    },
    onSuccess: (updated, _vars, ctx) => {
      const context = ctx as {
        id: string;
        token: number;
        optimisticFields: Record<string, unknown>;
      };
      // Apply the server result ONLY for the fields this mutation touched, and
      // only while this mutation still owns each field (a newer mutation that
      // took the field over is never overwritten).
      queryClient.setQueryData<MealType[]>(mealTypesQueryKey, (old) =>
        (old ?? []).map((mt) => {
          if (mt.id !== context.id) return mt;
          const next = { ...mt };
          for (const field of Object.keys(context.optimisticFields)) {
            const key = `${context.id}:${field}`;
            if (fieldOwnerRef.current.get(key) !== context.token) continue;
            (next as unknown as Record<string, unknown>)[field] = (
              updated as unknown as Record<string, unknown>
            )[field];
            // Clear ownership only if we still own it (a newer mutation would
            // have replaced the token and must keep it).
            if (fieldOwnerRef.current.get(key) === context.token) {
              fieldOwnerRef.current.delete(key);
            }
          }
          return next;
        }),
      );
    },
    onError: (err: Error, _vars, context) => {
      if (context) {
        // Roll back ONLY the fields this mutation still owns (token match) and
        // restore their previous values; a newer owner is left untouched.
        queryClient.setQueryData<MealType[]>(mealTypesQueryKey, (old) =>
          (old ?? []).map((mt) => {
            if (mt.id !== context.id) return mt;
            const next = { ...mt };
            for (const field of Object.keys(context.optimisticFields)) {
              const key = `${context.id}:${field}`;
              if (fieldOwnerRef.current.get(key) !== context.token) continue;
              (next as Record<string, unknown>)[field] =
                context.previousFields[field];
              if (fieldOwnerRef.current.get(key) === context.token) {
                fieldOwnerRef.current.delete(key);
              }
            }
            return next;
          }),
        );
      }
      addLog(`Failed to update meal type: ${err.message}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('mealTypeSettings.failedUpdate', { defaultValue: 'Failed to update' }) });
    },
    onSettled: (_data, _err, vars, context) => {
      // Authoritative reconciliation ONLY after this record's update queue
      // drains — never while a newer mutation for the same record is still
      // pending (an intermediate refetch would overwrite its optimistic cache
      // with older server state). The reorder path uses DIRECT updateMealType()
      // calls and never goes through this mutation.
      const id = context?.id ?? vars.id;
      const pending = pendingUpdatesRef.current.get(id) ?? 0;
      if (pending <= 1) {
        pendingUpdatesRef.current.delete(id);
        queryClient.invalidateQueries({ queryKey: mealTypesQueryKey });
      } else {
        pendingUpdatesRef.current.set(id, pending - 1);
      }
      // Release the reserved slot on EVERY settling path (including an
      // onMutate failure where mutationFn never ran) so the per-record queue
      // can never deadlock. Idempotent for the normal mutationFn path.
      vars.reservation.resolveDone();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMealType(id),
    onSuccess: () => {
      invalidate();
      Toast.show({ type: 'success', text1: t('mealTypeSettings.deleted', { defaultValue: 'Meal type deleted' }) });
    },
    onError: (err: Error) => {
      addLog(`Failed to delete meal type: ${err.message}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('mealTypeSettings.failedDelete', { defaultValue: 'Failed to delete' }) });
    },
  });

  /**
   * Single generic-update wrapper — the ONLY entry point for row Visibility,
   * row default time, and Edit Save.
   *
   * At this SYNCHRONOUS user-action boundary (before any await) we:
   *   1. allocate the mutation token (user-intent order);
   *   2. reserve a per-record queue SLOT (B sees A's `done` immediately, so
   *      PUT order equals user-initiation order regardless of cancelQueries /
   *      network timing);
   *   3. increment the per-record pending counter;
   *   4. reserve field ownership for every modified field;
   *   5. capture rollback metadata (previous values) from the CURRENT cache
   *      at reservation time;
   *   6. invoke the TanStack mutation carrying those internal values.
   *
   * The actual PUT does NOT start here — `mutationFn` waits for the reserved
   * predecessor slot and performs the request. Internal metadata never reaches
   * `updateMealType()`.
   */
  const mutateMealType = useCallback(
    (
      id: string,
      data: Partial<Omit<MealType, 'id'>>,
      options?: { onSuccess?: () => void },
    ) => {
      const token = ++mutationTokenRef.current;

      // 2. Reserve the per-record queue slot synchronously.
      const predecessor = updateRequestQueueRef.current.get(id) ?? Promise.resolve();
      let resolveDone!: () => void;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      updateRequestQueueRef.current.set(id, done);
      const reservation: UpdateReservation = { predecessor, done, resolveDone };

      // 3. Pending counter for drain-gated invalidation.
      pendingUpdatesRef.current.set(id, (pendingUpdatesRef.current.get(id) ?? 0) + 1);

      // 4 + 5. Reserve ownership + capture rollback metadata from the CURRENT
      // cache (synchronously, before any async work).
      const previousFields: Record<string, unknown> = {};
      const optimisticFields: Record<string, unknown> = {};
      const current = queryClient.getQueryData<MealType[]>(mealTypesQueryKey);
      for (const field of Object.keys(data)) {
        fieldOwnerRef.current.set(`${id}:${field}`, token);
        optimisticFields[field] = (data as unknown as Record<string, unknown>)[field];
        const existing = current?.find((mt) => mt.id === id);
        previousFields[field] = existing
          ? (existing as unknown as Record<string, unknown>)[field]
          : undefined;
      }

      updateMutation.mutate(
        { id, data, token, previousFields, optimisticFields, reservation },
        options,
      );
    },
    [updateMutation, queryClient],
  );

  const { systemTypes, customTypes } = useMemo(() => {
    const types = mealTypes ?? [];
    return {
      systemTypes: types.filter((mt) => mt.user_id === null),
      customTypes: types.filter((mt) => mt.user_id !== null),
    };
  }, [mealTypes]);

  // Always-current custom types for the persistence worker, so a long-running
  // worker never persists writes built from a STALE closure (CodeRabbit:
  // "no stale closure over old customTypes").
  const customTypesRef = useRef(customTypes);
  customTypesRef.current = customTypes;

  /**
   * Optimistic gap assignment while a reorder is pending (gapKey → ordered ids).
   * null = follow the server sort_order. Cleared when the persisted state is
   * reconciled (success writes cache + clears; failure clears + refetches).
   */
  const [gapOverride, setGapOverride] = useState<Record<MealGapKey, string[]> | null>(null);

  const serverGaps = useMemo(() => assignCustomTypesToGaps(customTypes), [customTypes]);

  const currentGaps = useMemo<Record<MealGapKey, MealType[]>>(() => {
    if (!gapOverride) return serverGaps;
    const byId = new Map(customTypes.map((mt) => [mt.id, mt]));
    const out = {} as Record<MealGapKey, MealType[]>;
    for (const key of Object.keys(serverGaps) as MealGapKey[]) {
      out[key] = (gapOverride[key] ?? [])
        .map((id) => byId.get(id))
        .filter((mt): mt is MealType => mt != null);
    }
    return out;
  }, [serverGaps, gapOverride, customTypes]);

  /** Unified visual rows (anchors fixed, customs per current gaps). */
  const unifiedRows = useMemo(
    () => buildUnifiedList(systemTypes, currentGaps),
    [systemTypes, currentGaps],
  );

  // Drag geometry over the unified rows. Anchors and customs share the same
  // row height, so every row has the same stride (ROW_HEIGHT + ROW_GAP).
  const strides = unifiedRows.map(() => ROW_HEIGHT + ROW_GAP);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const stride of strides) {
      out.push(acc);
      acc += stride;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unifiedRows.length]);
  const activeDragIndex = useSharedValue(-1);
  const panY = useSharedValue(0);
  // Commit handoff: holds the active row's final translate until the new
  // unified order has rendered (see CustomMealTypeRow onEnd).
  const committingTranslate = useSharedValue(0);

  // LIVE UI-thread drop target (WorkoutReorderList pattern): recomputed on
  // every pan frame from the shared values, never via JS state, so each row's
  // preview-shift animation can follow the finger in real time. The same value
  // is read by the gesture's onEnd so the committed destination always matches
  // the gap the preview opened.
  const targetIndex = useDerivedValue(() =>
    activeDragIndex.value < 0
      ? -1
      : computeReorderTargetIndex(strides, offsets, activeDragIndex.value, panY.value),
  );

  /** Generation of the currently displayed optimistic order (incremented on
   * every accepted move). A persisted snapshot carries the generation it was
   * created from; stale completions must never clear a NEWER override. */
  const orderGenerationRef = useRef(0);
  const latestOrderRef = useRef<{
    generation: number;
    order: Record<MealGapKey, string[]>;
  } | null>(null);
  const workerRunningRef = useRef(false);
  // Post-render commit handoff: set by moveCustomType, consumed by an effect
  // AFTER the new unifiedRows have rendered.
  const pendingDragResetRef = useRef(false);

  /** Persists one concrete gap assignment (direct API calls, no generic
   * mutation callbacks). Success writes the cache + one invalidate; failure
   * logs once, shows one reorder error and reconciles. Never retried
   * automatically — a newer user order supersedes it after reconciliation.
   *
   * A stale completion must never erase newer visual state: `gapOverride` is
   * cleared only when the persisted generation is still the CURRENT displayed
   * generation AND no newer desired order exists. On failure the same rule
   * applies — if a newer optimistic order exists it is preserved and then
   * persisted deterministically by the worker. */
  const doPersist = useCallback(
    async (
      gapsToPersist: Record<MealGapKey, MealType[]>,
      generation: number,
    ) => {
      // ABSOLUTE snapshot persistence: every custom type in every gap is
      // written with its canonical slot, independent of the (possibly stale)
      // cached sort_order. This guarantees the newest visual order is fully
      // representable after reconciliation and never depends on stale data.
      const writes: { id: string; sort_order: number }[] = [];
      for (const key of Object.keys(gapsToPersist) as MealGapKey[]) {
        const list = gapsToPersist[key];
        const slots = slotsForGap(key, list.length);
        list.forEach((mt, i) => {
          writes.push({ id: mt.id, sort_order: slots[i] });
        });
      }
      if (writes.length === 0) return;
      try {
        for (const write of writes) {
          await updateMealType(write.id, { sort_order: write.sort_order });
        }
        queryClient.setQueryData<MealType[]>(mealTypesQueryKey, (old) => {
          const byId = new Map(writes.map((w) => [w.id, w.sort_order]));
          return (old ?? []).map((mt) =>
            byId.has(mt.id) ? { ...mt, sort_order: byId.get(mt.id)! } : mt,
          );
        });
        // Clear ONLY if this generation is still displayed and no newer
        // desired order exists.
        if (
          generation === orderGenerationRef.current &&
          latestOrderRef.current === null
        ) {
          setGapOverride(null);
        }
        invalidate();
      } catch (err) {
        addLog(`Failed to persist meal type order: ${(err as Error).message}`, 'ERROR');
        Toast.show({ type: 'error', text1: t('mealTypeSettings.failedReorder', { defaultValue: 'Failed to reorder meal types' }) });
        // Never clear a NEWER optimistic override. If no newer order exists
        // this generation is still displayed, so reconcile it back to the
        // server state.
        if (
          generation === orderGenerationRef.current &&
          latestOrderRef.current === null
        ) {
          setGapOverride(null);
        }
        invalidate();
      }
    },
    [invalidate, queryClient, t],
  );

  /**
   * ONE active persistence worker. `latestOrderRef` holds the newest accepted
   * visual order (with its generation); `workerRunningRef` guarantees only a
   * single worker is alive at a time. Moves while a worker is running simply
   * update the desired order — the running worker drains it in a loop, so the
   * newest order is persisted exactly once (no duplicate persistence of the
   * same logical order, no second worker, no stale closure over old
   * customTypes). An older sequence can never finish after a newer one.
   */
  const persistWorker = useCallback(async () => {
    workerRunningRef.current = true;
    try {
      while (latestOrderRef.current) {
        const { generation, order } = latestOrderRef.current;
        latestOrderRef.current = null; // consume the snapshot
        const byId = new Map(customTypesRef.current.map((mt) => [mt.id, mt]));
        const gaps: Record<MealGapKey, MealType[]> = {
          b_l: [],
          l_d: [],
          d_s: [],
        };
        for (const k of Object.keys(order) as MealGapKey[]) {
          gaps[k] = (order[k] ?? [])
            .map((id) => byId.get(id))
            .filter((mt): mt is MealType => mt != null);
        }
        await doPersist(gaps, generation);
      }
    } finally {
      workerRunningRef.current = false;
      // A move that arrived exactly while we were finishing may have set the
      // ref after the while-condition; drain it if so.
      if (latestOrderRef.current) {
        void persistWorker();
      }
    }
  }, [doPersist]);

  const enqueuePersist = useCallback(() => {
    if (workerRunningRef.current) return; // worker already drains latest order
    void persistWorker();
  }, [persistWorker]);

  const moveCustomType = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || fromIndex >= unifiedRows.length) return;
      if (toIndex < 0 || toIndex >= unifiedRows.length) return;
      const source = unifiedRows[fromIndex];
      if (source.isSystem) return; // anchors never move
      // Custom rows may only sit BETWEEN the anchors: never before the first
      // anchor (Breakfast, index 0) nor after the last anchor (Snacks). The
      // destination index refers to the list AFTER the source is removed, so
      // inserting before the last anchor means toIndex === lastSystemIndex - 1.
      const lastSystemIndex = unifiedRows.reduce(
        (acc, row, idx) => (row.isSystem ? idx : acc),
        -1,
      );
      const clampedTo = Math.min(Math.max(toIndex, 1), Math.max(lastSystemIndex - 1, 1));
      const currentUnified = unifiedRows.map((r) => ({ ...r }));
      const [moved] = currentUnified.splice(fromIndex, 1);
      currentUnified.splice(clampedTo, 0, moved);
      if (!currentUnified[0]?.isSystem || !currentUnified[currentUnified.length - 1]?.isSystem) {
        // Defensive anchor-bound guard: also release a frozen preview.
        resetMealTypeDragPreview(activeDragIndex, panY, committingTranslate);
        return; // defensive: anchors must bound the list
      }
      const nextGaps = deriveGapsFromUnified(currentUnified);
      // Capacity check: every gap may hold at most 9 custom types.
      for (const key of Object.keys(nextGaps) as MealGapKey[]) {
        if (nextGaps[key].length > MAX_CUSTOM_PER_GAP) {
          const movingInto = GAP_USER_LABEL[key];
          Toast.show({
            type: 'error',
            text1: t('mealTypeSettings.capacity', { defaultValue: 'No more meal types can be placed {{gap}}.', gap: movingInto }),
          });
          // Rejected drop: the gesture already froze the preview in onEnd;
          // release it immediately so the dropped row and sibling shifts
          // spring back to their pre-drag positions (CodeRabbit P1 — the
          // post-render reset is only armed for ACCEPTED moves).
          resetMealTypeDragPreview(activeDragIndex, panY, committingTranslate);
          return;
        }
      }
      const override: Record<MealGapKey, string[]> = {
        b_l: nextGaps.b_l.map((mt) => mt.id),
        l_d: nextGaps.l_d.map((mt) => mt.id),
        d_s: nextGaps.d_s.map((mt) => mt.id),
      };
      const generation = ++orderGenerationRef.current;
      latestOrderRef.current = { generation, order: override };
      setGapOverride(override);
      // Commit handoff: do NOT reset the drag shared values here — the new
      // unifiedRows have not rendered yet (setGapOverride only schedules a
      // render). A post-render effect consumes pendingDragResetRef after the
      // new order is on screen, making the reset a visual no-op.
      pendingDragResetRef.current = true;
      enqueuePersist();
    },
    [unifiedRows, enqueuePersist, activeDragIndex, panY, committingTranslate, t],
  );

  // Post-render commit handoff: after the new unifiedRows render (gapOverride
  // applied), release the floating transform — the row's array position has
  // changed, so resetting translate is a visual no-op. This prevents a
  // one-frame snap-back between drop and React re-render.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetMealTypeDragPreview(activeDragIndex, panY, committingTranslate);
  }, [unifiedRows, committingTranslate, activeDragIndex, panY]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const header = useScreenHeader({
    title: t('navigation.mealTypes', { defaultValue: 'Meal Types' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      role: 'primary',
      onPress: () => {
        setEditingType(null);
        setIsCreating(false);
        formSheetRef.current?.presentCreate();
      },
      accessibilityLabel: t('mealTypeSettings.add', { defaultValue: 'Add meal type' }),
      identifier: 'meal-types-add',
    },
  });

  /**
   * Create: ONE logical operation. The initial POST supports name + sort_order
   * + default_time (backend hardcodes is_visible = TRUE and show_in_quick_log
   * defaults true); the requested per-user settings (visibility, quick log)
   * are applied with follow-up updates and the cache is reconciled once.
   */
  const handleCreate = useCallback(
    async (values: {
      name: string;
      defaultTime: string;
      showInQuickLog: boolean;
    }) => {
      setIsCreating(true);
      const current = gapOverride ?? serverGaps;
      const targetGap = DEFAULT_CREATE_GAP;
      if (current[targetGap].length >= MAX_CUSTOM_PER_GAP) {
        setIsCreating(false);
        Toast.show({
          type: 'error',
          text1: t('mealTypeSettings.capacity', { defaultValue: 'No more meal types can be placed {{gap}}.', gap: GAP_USER_LABEL[targetGap] }),
        });
        return;
      }
      const nextSort = GAP_SLOT_RANGE[targetGap][0] + current[targetGap].length;
      try {
        const created = await createMealType({
          name: values.name,
          sort_order: nextSort,
          default_time: values.defaultTime || null,
        });
        const followUps: { id: string; data: Partial<Omit<MealType, 'id'>> }[] = [];
        // Visibility is owned by the main-list Switch (backend defaults TRUE);
        // only the Quick log choice needs a follow-up update.
        if (!values.showInQuickLog) {
          followUps.push({ id: created.id, data: { show_in_quick_log: false } });
        }
        try {
          for (const up of followUps) {
            await updateMealType(up.id, up.data);
          }
        } catch (err) {
          // Partially configured: report accurately and reconcile with server.
          addLog(`Failed to apply meal type settings: ${(err as Error).message}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: t('mealTypeSettings.createdPartial', { defaultValue: 'Created, but some settings failed to save.' }),
          });
          formSheetRef.current?.dismiss();
          setEditingType(null);
          setIsCreating(false);
          invalidate();
          return;
        }
        Toast.show({ type: 'success', text1: t('mealTypeSettings.created', { defaultValue: 'Meal type created' }) });
        formSheetRef.current?.dismiss();
        setEditingType(null);
        setIsCreating(false);
        invalidate();
      } catch (err) {
        addLog(`Failed to create meal type: ${(err as Error).message}`, 'ERROR');
        Toast.show({ type: 'error', text1: t('mealTypeSettings.failedCreate', { defaultValue: 'Failed to create meal type' }) });
        setIsCreating(false);
      }
    },
    [gapOverride, serverGaps, invalidate, t],
  );

  /** Edit: name/default_time/quick log/visibility only — sort_order untouched. */
  const handleEditSave = useCallback(
    (values: {
      name: string;
      defaultTime: string;
      showInQuickLog: boolean;
    }) => {
      if (!editingType) return;
      mutateMealType(
        editingType.id,
        {
          name: editingType.user_id !== null ? values.name : editingType.name,
          default_time: values.defaultTime || null,
          // is_visible intentionally omitted: Visibility is owned by the
          // main-list Switch, so a plain edit never overwrites server state.
          show_in_quick_log: values.showInQuickLog,
        },
        {
          onSuccess: () => {
            formSheetRef.current?.dismiss();
            setEditingType(null);
            setIsCreating(false);
            // No explicit invalidate here — the generic updateMutation's
            // onSettled already reconciles the query once.
          },
        },
      );
    },
    [editingType, mutateMealType],
  );

  const handleDelete = useCallback(
    (mt: MealType) => {
      Alert.alert(t('mealTypeSettings.deleteTitle', { defaultValue: 'Delete Meal Type' }), t('mealTypeSettings.deleteMessage', { defaultValue: "Delete '{{name}}'?", name: mt.name }), [
        { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(mt.id),
        },
      ]);
    },
    [deleteMutation, t],
  );

  const openEdit = useCallback((mt: MealType) => {
    setEditingType(mt);
    setIsCreating(false);
    formSheetRef.current?.presentEdit(mt);
  }, []);

  const openTimePicker = useCallback(
    (mt: MealType) => {
      timePickerRef.current?.present(toHourMinute(mt.default_time) || null, (time) => {
        mutateMealType(mt.id, { default_time: time });
      });
    },
    [mutateMealType],
  );

  /** Row-level Visibility switch (mockup placement: main list owns it). */
  const toggleVisibility = useCallback(
    (mt: MealType, value: boolean) => {
      mutateMealType(mt.id, { is_visible: value });
    },
    [mutateMealType],
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">{t('mealTypeSettings.loading', { defaultValue: 'Loading meal types...' })}</Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-text-muted text-base text-center">{t('mealTypeSettings.loadFailed', { defaultValue: 'Failed to load meal types.' })}</Text>
          <TouchableOpacity onPress={() => void refetch()} className="mt-4">
            <Text className="text-accent-primary text-base font-medium">{t('common.retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
          }}
          contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
          }
        >
          {unifiedRows.length > 0 ? (
            <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
              {unifiedRows.map((row, index) =>
                row.isSystem ? (
                  <SystemMealTypeRow
                    key={row.mt.id}
                    mt={row.mt}
                    index={index}
                    onEdit={openEdit}
                    onTime={openTimePicker}
                    onToggleVisibility={toggleVisibility}
                    accentColor={accentColor}
                    textSecondary={textSecondary}
                    activeDragIndex={activeDragIndex}
                    panY={panY}
                    committingTranslate={committingTranslate}
                    targetIndex={targetIndex}
                    strides={strides}
                    t={t}
                  />
                ) : (
                  <CustomMealTypeRow
                    key={row.mt.id}
                    mt={row.mt}
                    index={index}
                    totalRows={unifiedRows.length}
                    onEdit={openEdit}
                    onTime={openTimePicker}
                    onMove={moveCustomType}
                    onToggleVisibility={toggleVisibility}
                    textMuted={textMuted}
                    textSecondary={textSecondary}
                    activeDragIndex={activeDragIndex}
                    panY={panY}
                    committingTranslate={committingTranslate}
                    targetIndex={targetIndex}
                    strides={strides}
                    t={t}
                  />
                ),
              )}
            </View>
          ) : (
            <View className="items-center justify-center py-16 px-8">
              <Text className="text-text-muted text-lg text-center">{t('mealTypeSettings.empty', { defaultValue: 'No meal types found' })}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <MealTypeFormSheet
        ref={formSheetRef}
        isSystem={editingType != null && editingType.user_id === null}
        isSaving={isCreating || updateMutation.isPending}
        onCreate={handleCreate}
        onEditSave={handleEditSave}
        onDelete={editingType && editingType.user_id !== null ? () => handleDelete(editingType) : undefined}
        timePickerRef={timePickerRef}
      />
      <MealTypeTimePickerSheet ref={timePickerRef} />
    </View>
  );
};

/** Right-side Default time: plain settings-row text with a large invisible hit
 * target (full row height via py-3). No nested card/pill, no timer icon, no
 * chevron — the row stays one clean settings row (mockup). */
const MealTypeTimeCell: React.FC<{
  mealType: MealType;
  onPress: () => void;
  textSecondary: string;
  t: ReturnType<typeof useTranslation>['t'];
}> = ({ mealType, onPress, textSecondary, t }) => {
  const time = toHourMinute(mealType.default_time);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-3 py-3"
      accessibilityRole="button"
      accessibilityLabel={t('mealTypeSettings.defaultTime', { defaultValue: 'Default time for {{name}}{{time}}', name: getMealTypeDisplayLabel(mealType, t), time: time ? `, ${time}` : `, ${t('mealTypeSettings.notSet', { defaultValue: "Not set" })}` })}
      testID={`time-cell-${mealType.id}`}
    >
      <Text className="text-sm text-text-secondary" style={{ minWidth: 44, textAlign: 'right' }}>
        {time || t('mealTypeSettings.notSet', { defaultValue: 'Not set' })}
      </Text>
    </TouchableOpacity>
  );
};

export default MealTypeSettingsScreen;
