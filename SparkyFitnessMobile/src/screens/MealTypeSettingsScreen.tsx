import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { computeReorderTargetIndex } from '../components/WorkoutReorderList';
import type { IconName } from '../components/Icon';
import type { MealType } from '../types/mealTypes';
import type { RootStackScreenProps } from '../types/navigation';
import {
  assignCustomTypesToGaps,
  buildSortOrderWrites,
  buildUnifiedList,
  deriveGapsFromUnified,
  DEFAULT_CREATE_GAP,
  MAX_CUSTOM_PER_GAP,
  GAP_USER_LABEL,
  type MealGapKey,
} from '../utils/mealTypeSlots';

type MealTypeSettingsScreenProps = RootStackScreenProps<'MealTypeSettings'>;

/** Fixed row height for the drag geometry (all rows share the same density). */
const ROW_HEIGHT = 64;
const ROW_GAP = 8;
const LONG_PRESS_MS = 150;

/** Canonical FILLED system icon for a system meal-type name (MEAL_CONFIG). */
function getSystemMealTypeIcon(name: string): IconName {
  const lower = name.toLowerCase();
  const key = lower === 'snack' ? 'snacks' : lower;
  return (MEAL_CONFIG[key]?.icon as IconName | undefined) ?? 'meal-snack';
}

/**
 * Module-scope CUSTOM meal-type row (stable component identity; gesture-driven).
 * System rows are plain static rows rendered by the screen.
 */
const CustomMealTypeRow: React.FC<{
  mt: MealType;
  index: number;
  totalRows: number;
  onEdit: (mt: MealType) => void;
  onTime: (mt: MealType) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility: (mt: MealType, value: boolean) => void;
  textMuted: string;
  textSecondary: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  strides: number[];
  offsets: number[];
}> = ({
  mt,
  index,
  totalRows,
  onEdit,
  onTime,
  onMove,
  onToggleVisibility,
  textMuted,
  textSecondary,
  activeDragIndex,
  panY,
  strides,
  offsets,
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
      const to = computeReorderTargetIndex(strides, offsets, from, panY.value);
      activeDragIndex.value = -1;
      panY.value = 0;
      if (from >= 0 && from !== to) {
        // Worklet → JS boundary: onMove must run on the JS thread.
        runOnJS(onMove)(from, to);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeDragIndex.value;
    if (active === index) {
      return {
        transform: [{ translateY: panY.value }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 8,
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };
    }
    // Other rows open a gap for the drag; the target derives from the live
    // translation so it tracks the finger. System anchors never shift — the
    // screen only renders CustomMealTypeRow for custom rows, so here all rows
    // are draggable peers within the custom part of the unified list.
    const target =
      active >= 0
        ? computeReorderTargetIndex(strides, offsets, active, panY.value)
        : -1;
    let shift = 0;
    if (active >= 0 && target >= 0) {
      if (active < index && index <= target) shift = -(ROW_HEIGHT + ROW_GAP);
      else if (target <= index && index < active) shift = ROW_HEIGHT + ROW_GAP;
    }
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
      style={[animatedStyle, { minHeight: ROW_HEIGHT }]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          testID={`drag-handle-${mt.id}`}
          className="px-4 py-3"
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${mt.name}`}
          accessibilityActions={[
            { name: 'decrement', label: 'Move up' },
            { name: 'increment', label: 'Move down' },
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
        accessibilityLabel={`Edit ${mt.name}`}
        testID={`edit-custom-${mt.id}`}
      >
        <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
          {mt.name}
        </Text>
      </TouchableOpacity>
      <MealTypeTimeCell mealType={mt} onPress={() => onTime(mt)} textSecondary={textSecondary} />
      <View className="pr-4 pl-1">
        <Switch
          value={mt.is_visible}
          onValueChange={(val) => onToggleVisibility(mt, val)}
          accessibilityLabel={`Visible ${mt.name}`}
        />
      </View>
    </Animated.View>
  );
};

const MealTypeSettingsScreen: React.FC<MealTypeSettingsScreenProps> = () => {
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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<MealType, 'id'>> }) =>
      updateMealType(id, data),
    onError: (err: Error) => {
      addLog(`Failed to update meal type: ${err.message}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to update' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMealType(id),
    onSuccess: () => {
      invalidate();
      Toast.show({ type: 'success', text1: 'Meal type deleted' });
    },
    onError: (err: Error) => {
      addLog(`Failed to delete meal type: ${err.message}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to delete' });
    },
  });

  const { systemTypes, customTypes } = useMemo(() => {
    const types = mealTypes ?? [];
    return {
      systemTypes: types.filter((mt) => mt.user_id === null),
      customTypes: types.filter((mt) => mt.user_id !== null),
    };
  }, [mealTypes]);

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

  // Drag geometry over the unified rows (anchors + customs all share the same
  // row height; only custom rows animate, anchors render statically).
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

  /**
   * Serialized reorder persistence. A promise chain guarantees exactly one
   * persistence sequence at a time; while one runs, a newer drag coalesces as
   * the "newest desired order" and is persisted next. The final server state
   * deterministically equals the newest accepted visual order — an older
   * sequence can never overwrite a newer one.
   */
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestOrderRef = useRef<Record<MealGapKey, string[]> | null>(null);

  const doPersist = useCallback(
    async (gapsToPersist: Record<MealGapKey, MealType[]>) => {
      const writes = buildSortOrderWrites(gapsToPersist);
      if (writes.length === 0) return;
      try {
        for (const write of writes) {
          // Direct API call: no global mutation callbacks run per row.
          await updateMealType(write.id, { sort_order: write.sort_order });
        }
        // Success: write the new sort_orders into the query cache immediately,
        // clear the override, then issue exactly ONE invalidate.
        queryClient.setQueryData<MealType[]>(mealTypesQueryKey, (old) => {
          const byId = new Map(writes.map((w) => [w.id, w.sort_order]));
          return (old ?? []).map((mt) =>
            byId.has(mt.id) ? { ...mt, sort_order: byId.get(mt.id)! } : mt,
          );
        });
        setGapOverride(null);
        invalidate();
      } catch (err) {
        addLog(`Failed to persist meal type order: ${(err as Error).message}`, 'ERROR');
        Toast.show({ type: 'error', text1: 'Failed to reorder meal types' });
        setGapOverride(null);
        invalidate();
      }
    },
    [invalidate, queryClient],
  );

  const enqueuePersist = useCallback(() => {
    const run = async () => {
      let lastPersisted: string | null = null;
      for (;;) {
        const latest = latestOrderRef.current;
        if (!latest) break;
        const key = Object.values(latest)
          .flat()
          .join(',');
        if (key === lastPersisted) break;
        lastPersisted = key;
        const byId = new Map(customTypes.map((mt) => [mt.id, mt]));
        const gaps: Record<MealGapKey, MealType[]> = {
          b_l: [],
          l_d: [],
          d_s: [],
        };
        for (const k of Object.keys(latest) as MealGapKey[]) {
          gaps[k] = (latest[k] ?? [])
            .map((id) => byId.get(id))
            .filter((mt): mt is MealType => mt != null);
        }
        await doPersist(gaps);
      }
    };
    persistChainRef.current = persistChainRef.current.then(run, run);
  }, [customTypes, doPersist]);

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
        return; // defensive: anchors must bound the list
      }
      const nextGaps = deriveGapsFromUnified(currentUnified);
      // Capacity check: every gap may hold at most 9 custom types.
      for (const key of Object.keys(nextGaps) as MealGapKey[]) {
        if (nextGaps[key].length > MAX_CUSTOM_PER_GAP) {
          const movingInto = GAP_USER_LABEL[key];
          Toast.show({
            type: 'error',
            text1: `No more meal types can be placed ${movingInto}.`,
          });
          return;
        }
      }
      const override: Record<MealGapKey, string[]> = {
        b_l: nextGaps.b_l.map((mt) => mt.id),
        l_d: nextGaps.l_d.map((mt) => mt.id),
        d_s: nextGaps.d_s.map((mt) => mt.id),
      };
      latestOrderRef.current = override;
      setGapOverride(override);
      enqueuePersist();
    },
    [unifiedRows, enqueuePersist],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const header = useScreenHeader({
    title: 'Meal Types',
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
      accessibilityLabel: 'Add meal type',
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
          text1: `No more meal types can be placed ${GAP_USER_LABEL[targetGap]}.`,
        });
        setIsCreating(false);
        return;
      }
      const gapFirst: Record<MealGapKey, number> = { b_l: 11, l_d: 21, d_s: 31 };
      const nextSort = gapFirst[targetGap] + current[targetGap].length;
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
            text1: 'Created, but some settings failed to save.',
          });
          formSheetRef.current?.dismiss();
          setEditingType(null);
          setIsCreating(false);
          invalidate();
          return;
        }
        Toast.show({ type: 'success', text1: 'Meal type created' });
        formSheetRef.current?.dismiss();
        setEditingType(null);
        setIsCreating(false);
        invalidate();
      } catch (err) {
        addLog(`Failed to create meal type: ${(err as Error).message}`, 'ERROR');
        Toast.show({ type: 'error', text1: 'Failed to create meal type' });
        setIsCreating(false);
      }
    },
    [gapOverride, serverGaps, invalidate],
  );

  /** Edit: name/default_time/quick log/visibility only — sort_order untouched. */
  const handleEditSave = useCallback(
    (values: {
      name: string;
      defaultTime: string;
      showInQuickLog: boolean;
    }) => {
      if (!editingType) return;
      updateMutation.mutate(
        {
          id: editingType.id,
          data: {
            name: editingType.user_id !== null ? values.name : editingType.name,
            default_time: values.defaultTime || null,
            // is_visible intentionally omitted: Visibility is owned by the
            // main-list Switch, so a plain edit never overwrites server state.
            show_in_quick_log: values.showInQuickLog,
          },
        },
        {
          onSuccess: () => {
            formSheetRef.current?.dismiss();
            setEditingType(null);
            setIsCreating(false);
            invalidate();
          },
        },
      );
    },
    [editingType, updateMutation, invalidate],
  );

  const handleDelete = useCallback(
    (mt: MealType) => {
      Alert.alert('Delete Meal Type', `Delete '${mt.name}'?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(mt.id),
        },
      ]);
    },
    [deleteMutation],
  );

  const openEdit = useCallback((mt: MealType) => {
    setEditingType(mt);
    setIsCreating(false);
    formSheetRef.current?.presentEdit(mt);
  }, []);

  const openTimePicker = useCallback(
    (mt: MealType) => {
      timePickerRef.current?.present(toHourMinute(mt.default_time) || null, (time) => {
        updateMutation.mutate({ id: mt.id, data: { default_time: time } });
      });
    },
    [updateMutation],
  );

  /** Row-level Visibility switch (mockup placement: main list owns it). */
  const toggleVisibility = useCallback(
    (mt: MealType, value: boolean) => {
      updateMutation.mutate({ id: mt.id, data: { is_visible: value } });
    },
    [updateMutation],
  );

  const renderSystemRow = (mt: MealType) => (
    <View
      key={mt.id}
      className="flex-row items-center bg-surface border-b border-border/40"
      style={{ minHeight: ROW_HEIGHT }}
      testID={`meal-type-system-${mt.id}`}
    >
      <View className="px-4 py-3">
        <Icon name={getSystemMealTypeIcon(mt.name)} size={22} color={accentColor} />
      </View>
      <TouchableOpacity
        className="flex-1 py-3 flex-shrink"
        onPress={() => openEdit(mt)}
        activeOpacity={0.6}
        accessibilityLabel={`Edit ${mt.name}`}
        testID={`edit-system-${mt.id}`}
      >
        <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
          {mt.name}
        </Text>
      </TouchableOpacity>
      <MealTypeTimeCell mealType={mt} onPress={() => openTimePicker(mt)} textSecondary={textSecondary} />
      <View className="pr-4 pl-1">
        <Switch
          value={mt.is_visible}
          onValueChange={(val) => toggleVisibility(mt, val)}
          accessibilityLabel={`Visible ${mt.name}`}
        />
      </View>
    </View>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">Loading meal types...</Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-text-muted text-base text-center">Failed to load meal types.</Text>
          <TouchableOpacity onPress={() => void refetch()} className="mt-4">
            <Text className="text-accent-primary text-base font-medium">Retry</Text>
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
                  renderSystemRow(row.mt)
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
                    strides={strides}
                    offsets={offsets}
                  />
                ),
              )}
            </View>
          ) : (
            <View className="items-center justify-center py-16 px-8">
              <Text className="text-text-muted text-lg text-center">No meal types found</Text>
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
}> = ({ mealType, onPress, textSecondary }) => {
  const time = toHourMinute(mealType.default_time);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="px-3 py-3"
      accessibilityRole="button"
      accessibilityLabel={`Default time for ${mealType.name}${time ? `, ${time}` : ', not set'}`}
      testID={`time-cell-${mealType.id}`}
    >
      <Text className="text-sm text-text-secondary" style={{ minWidth: 44, textAlign: 'right' }}>
        {time || 'Not set'}
      </Text>
    </TouchableOpacity>
  );
};

export default MealTypeSettingsScreen;
