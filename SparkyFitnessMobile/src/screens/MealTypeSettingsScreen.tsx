import React, {
  useCallback,
  useEffect,
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
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
import type { MealType } from '../types/mealTypes';
import type { RootStackScreenProps } from '../types/navigation';

type MealTypeSettingsScreenProps = RootStackScreenProps<'MealTypeSettings'>;

/** Fixed height of a custom meal-type row while it is draggable. */
const CUSTOM_ROW_HEIGHT = 88;
const CUSTOM_ROW_GAP = 8;
const LONG_PRESS_MS = 150;
/** Custom types get sequential sort_order starting at 100 (web convention). */
const CUSTOM_SORT_BASE = 100;
const CUSTOM_SORT_STEP = 10;

const MealTypeSettingsScreen: React.FC<MealTypeSettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const iconDanger = useCSSVariable('--color-icon-danger') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const textSecondary = useCSSVariable('--color-text-secondary') as string;

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [editingType, setEditingType] = useState<MealType | null>(null);
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

  const createMutation = useMutation({
    mutationFn: (data: { name: string; sort_order: number; default_time: string | null }) =>
      createMealType(data),
    onSuccess: () => {
      invalidate();
      Toast.show({ type: 'success', text1: 'Meal type created' });
    },
    onError: (err: Error) => {
      addLog(`Failed to create meal type: ${err.message}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to create meal type' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<MealType, 'id'>> }) =>
      updateMealType(id, data),
    onSuccess: () => invalidate(),
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

  const handleDelete = useCallback(
    (mt: MealType) => {
      Alert.alert('Delete Meal Type', `Delete '${mt.name}'?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(mt.id) },
      ]);
    },
    [deleteMutation],
  );

  // Local override of the custom-type order while a reorder is being persisted;
  // cleared whenever the server data changes (refetch after updates).
  const [customOrderOverride, setCustomOrderOverride] = useState<string[] | null>(null);
  useEffect(() => {
    setCustomOrderOverride(null);
  }, [mealTypes]);

  const { systemTypes, customTypes } = useMemo(() => {
    const types = mealTypes ?? [];
    return {
      systemTypes: types.filter((mt) => mt.user_id === null),
      customTypes: types.filter((mt) => mt.user_id !== null),
    };
  }, [mealTypes]);

  // Display order for custom types: local override first, then server sort.
  const orderedCustomTypes = useMemo(() => {
    if (!customOrderOverride) return customTypes;
    const byId = new Map(customTypes.map((mt) => [mt.id, mt]));
    return customOrderOverride
      .map((id) => byId.get(id))
      .filter((mt): mt is MealType => mt != null);
  }, [customTypes, customOrderOverride]);

  /**
   * Persists a custom-type reorder: assigns sequential sort_order values
   * (100, 110, 120, … — web convention, always above the locked system
   * 10/20/30/40 range) and only writes the types whose value actually changed.
   */
  const persistCustomOrder = useCallback(
    (orderedIds: string[]) => {
      const byId = new Map(customTypes.map((mt) => [mt.id, mt]));
      const ops: { id: string; data: { sort_order: number } }[] = [];
      orderedIds.forEach((id, index) => {
        const mt = byId.get(id);
        if (!mt) return;
        const nextSort = CUSTOM_SORT_BASE + index * CUSTOM_SORT_STEP;
        if (mt.sort_order !== nextSort) {
          ops.push({ id, data: { sort_order: nextSort } });
        }
      });
      if (ops.length === 0) return;
      // Persist sequentially to avoid server-side ordering races; invalidate at
      // the end so the refetched list reflects the new order.
      for (const op of ops) {
        updateMutation.mutate(op, { onSuccess: invalidate });
      }
    },
    [customTypes, updateMutation, invalidate],
  );

  const moveCustomType = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const current = orderedCustomTypes.map((mt) => mt.id);
      if (fromIndex < 0 || fromIndex >= current.length) return;
      if (toIndex < 0 || toIndex >= current.length) return;
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      setCustomOrderOverride(current);
      persistCustomOrder(current);
    },
    [orderedCustomTypes, persistCustomOrder],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Drag-and-drop state (reuses the WorkoutReorderList pattern) ──────────
  const customIds = orderedCustomTypes.map((mt) => mt.id);
  const strides = customIds.map(() => CUSTOM_ROW_HEIGHT + CUSTOM_ROW_GAP);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const stride of strides) {
      out.push(acc);
      acc += stride;
    }
    return out;
  }, [strides]);
  const activeDragIndex = useSharedValue(-1);
  const panY = useSharedValue(0);

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
        formSheetRef.current?.presentAdd();
      },
      accessibilityLabel: 'Add meal type',
      identifier: 'meal-types-add',
    },
  });

  const handleFormSave = useCallback(
    (values: { name: string; defaultTime: string; isVisible: boolean; showInQuickLog: boolean }) => {
      if (editingType) {
        updateMutation.mutate(
          {
            id: editingType.id,
            data: {
              name: values.name,
              default_time: values.defaultTime || null,
              is_visible: values.isVisible,
              show_in_quick_log: values.showInQuickLog,
            },
          },
          {
            onSuccess: () => {
              formSheetRef.current?.dismiss();
              setEditingType(null);
              invalidate();
            },
          },
        );
        return;
      }
      // Create path: automatically assign the new type to the end of the
      // custom list (no user-visible order number).
      const nextSort =
        customTypes.reduce(
          (max, mt) => Math.max(max, mt.sort_order ?? 0),
          CUSTOM_SORT_BASE - CUSTOM_SORT_STEP,
        ) + CUSTOM_SORT_STEP;
      createMutation.mutate(
        {
          name: values.name,
          sort_order: nextSort,
          default_time: values.defaultTime || null,
        },
        {
          onSuccess: () => {
            formSheetRef.current?.dismiss();
            invalidate();
          },
        },
      );
    },
    [editingType, updateMutation, createMutation, customTypes, invalidate],
  );

  const openEdit = useCallback((mt: MealType) => {
    setEditingType(mt);
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

  const systemIcon = (name: string) => {
    const lower = name.toLowerCase();
    const key = lower === 'snack' ? 'snacks' : lower;
    return MEAL_CONFIG[key]?.icon ?? 'meal-snack';
  };

  const renderSystemRow = (mt: MealType) => (
    <View
      key={mt.id}
      className="flex-row items-center py-3 px-4 bg-surface border-b border-border/40"
    >
      <Icon name={systemIcon(mt.name)} size={20} color={accentColor} />
      <View className="flex-1 ml-3 flex-shrink">
        <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
          {mt.name}
        </Text>
        <Text className="text-xs text-text-muted mt-0.5">System</Text>
      </View>
      <MealTypeTimeCell
        mealType={mt}
        onPress={() => openTimePicker(mt)}
        textSecondary={textSecondary}
      />
    </View>
  );

  const renderCustomRow = (mt: MealType, index: number) => {
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
          moveCustomType(from, to);
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
      // Other rows open a gap for the drag, matching the workout reorder list.
      const target = activeDragIndex.value;
      let shift = 0;
      if (active >= 0 && target >= 0) {
        if (active < index && index <= target) shift = -(CUSTOM_ROW_HEIGHT + CUSTOM_ROW_GAP);
        else if (target <= index && index < active) shift = CUSTOM_ROW_HEIGHT + CUSTOM_ROW_GAP;
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
        moveCustomType(index, Math.min(index + 1, orderedCustomTypes.length - 1));
      } else if (event.nativeEvent.actionName === 'decrement') {
        moveCustomType(index, Math.max(index - 1, 0));
      }
    };

    return (
      <Animated.View
        key={mt.id}
        testID={`meal-type-custom-${mt.id}`}
        className="bg-surface border-b border-border/40"
        style={[animatedStyle]}
      >
        <View
          className="flex-row items-center py-3 px-4"
          style={{ minHeight: CUSTOM_ROW_HEIGHT }}
        >
          <TouchableOpacity
            className="flex-1 flex-shrink"
            onPress={() => openEdit(mt)}
            activeOpacity={0.6}
            accessibilityLabel={`Edit ${mt.name}`}
            testID={`edit-custom-${mt.id}`}
          >
            <Text className="text-base text-text-primary font-medium" numberOfLines={1}>
              {mt.name}
            </Text>
            <Text className="text-xs text-text-muted mt-0.5">Custom</Text>
          </TouchableOpacity>
          <MealTypeTimeCell
            mealType={mt}
            onPress={() => openTimePicker(mt)}
            textSecondary={textSecondary}
          />
          <TouchableOpacity
            onPress={() => handleDelete(mt)}
            className="p-2 ml-1"
            accessibilityLabel={`Delete ${mt.name}`}
            testID={`delete-custom-${mt.id}`}
          >
            <Icon name="trash" size={18} color={iconDanger} />
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center justify-between px-4 pb-2">
          <View className="flex-row items-center gap-3">
            <View className="items-start">
              <Text className="text-xs text-text-muted mb-0.5">Visible</Text>
              <Switch
                value={mt.is_visible}
                onValueChange={(val) =>
                  updateMutation.mutate({ id: mt.id, data: { is_visible: val } })
                }
                accessibilityLabel={`Visible ${mt.name}`}
              />
            </View>
            <View className="items-start">
              <Text className="text-xs text-text-muted mb-0.5">Quick log</Text>
              <Switch
                value={mt.show_in_quick_log}
                onValueChange={(val) =>
                  updateMutation.mutate({ id: mt.id, data: { show_in_quick_log: val } })
                }
                accessibilityLabel={`Quick log ${mt.name}`}
              />
            </View>
          </View>
          <GestureDetector gesture={dragGesture}>
            <View
              testID={`drag-handle-${mt.id}`}
              className="px-3 py-2"
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
        </View>
      </Animated.View>
    );
  };

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
          {systemTypes.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                System Types
              </Text>
              <Text className="text-xs text-text-muted px-4 pb-2">
                System meal types can't be renamed or reordered.
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {systemTypes.map(renderSystemRow)}
              </View>
            </View>
          )}

          {orderedCustomTypes.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                Custom Types
              </Text>
              <Text className="text-xs text-text-muted px-4 pb-2">
                Drag to reorder. Tap a row to edit.
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {orderedCustomTypes.map((mt, index) => renderCustomRow(mt, index))}
              </View>
            </View>
          )}

          {!isLoading && systemTypes.length === 0 && orderedCustomTypes.length === 0 && (
            <View className="items-center justify-center py-16 px-8">
              <Text className="text-text-muted text-lg text-center">No meal types found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <MealTypeFormSheet
        ref={formSheetRef}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onSave={handleFormSave}
      />
      <MealTypeTimePickerSheet ref={timePickerRef} />
    </View>
  );
};

/** Compact time cell shown on each row; opens the shared wheel picker. */
const MealTypeTimeCell: React.FC<{
  mealType: MealType;
  onPress: () => void;
  textSecondary: string;
}> = ({ mealType, onPress, textSecondary }) => {
  const time = toHourMinute(mealType.default_time);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-1 px-2 py-1.5 rounded-lg bg-raised border border-border-subtle"
      accessibilityRole="button"
      accessibilityLabel={`Default time for ${mealType.name}${time ? `, ${time}` : ''}`}
      testID={`time-cell-${mealType.id}`}
    >
      <Icon name="timer" size={14} color={textSecondary} />
      <Text className="text-xs font-medium text-text-primary">{time || '—'}</Text>
    </TouchableOpacity>
  );
};

export default MealTypeSettingsScreen;
