import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { isEntryTimeString, toHourMinute } from '@workspace/shared';

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
import type { MealType } from '../types/mealTypes';
import type { RootStackScreenProps } from '../types/navigation';

type MealTypeSettingsScreenProps = RootStackScreenProps<'MealTypeSettings'>;

interface MealTypeFormState {
  name: string;
  sortOrder: string;
  defaultTime: string;
}

const emptyForm: MealTypeFormState = { name: '', sortOrder: '', defaultTime: '' };

/** Parses a user-entered order into a valid integer, or null when invalid. */
function parseSortOrder(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

interface DefaultTimeInputProps {
  mealType: MealType;
  onSave: (mealType: MealType, raw: string) => void;
}

/**
 * Inline HH:MM editor for a meal type's default time. Defined at module scope
 * (not inside the screen) so its component identity is stable across parent
 * re-renders — a nested definition would remount the input on every render and
 * drop unblurred text when a mutation/refetch re-renders the row.
 */
const DefaultTimeInput: React.FC<DefaultTimeInputProps> = ({ mealType, onSave }) => {
  const [val, setVal] = useState(toHourMinute(mealType.default_time) || '');
  // Keep the field in sync when the server returns a fresh value after a
  // refetch (e.g. after an edit elsewhere clears or changes the time).
  const [prevSaved, setPrevSaved] = useState(toHourMinute(mealType.default_time) || '');
  const effective = toHourMinute(mealType.default_time) || '';
  if (effective !== prevSaved) {
    setPrevSaved(effective);
    setVal(effective);
  }
  return (
    <TextInput
      value={val}
      onChangeText={setVal}
      onBlur={() => {
        if (val.trim() === (toHourMinute(mealType.default_time) || '')) return;
        onSave(mealType, val);
      }}
      placeholder="HH:MM"
      placeholderTextColor="#9CA3AF"
      className="bg-background border border-border text-text-primary text-xs px-2 py-1 rounded w-20 text-center"
      keyboardType="numbers-and-punctuation"
      accessibilityLabel={`Default time for ${mealType.name}`}
    />
  );
};

const MealTypeSettingsScreen: React.FC<MealTypeSettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const formEnabled = useCSSVariable('--color-form-enabled') as string;
  const formDisabled = useCSSVariable('--color-form-disabled') as string;

  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [form, setForm] = useState<MealTypeFormState>(emptyForm);
  const [editingType, setEditingType] = useState<MealType | null>(null);

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

  const handleAdd = useCallback(() => {
    const name = form.name.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }
    const sortOrder = parseSortOrder(form.sortOrder);
    if (sortOrder === null) {
      Toast.show({ type: 'error', text1: 'Invalid order', text2: 'Enter a whole number.' });
      return;
    }
    const defaultTime = form.defaultTime.trim();
    if (defaultTime && !isEntryTimeString(defaultTime)) {
      Toast.show({ type: 'error', text1: 'Invalid time', text2: 'Use 24-hour HH:MM (e.g. 07:30, 17:00).' });
      return;
    }
    createMutation.mutate({
      name,
      sort_order: sortOrder,
      default_time: defaultTime || null,
    });
    setForm(emptyForm);
    setAddModalVisible(false);
  }, [form, createMutation]);

  const handleEditSave = useCallback(() => {
    if (!editingType) return;
    const name = form.name.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }
    const sortOrder = parseSortOrder(form.sortOrder);
    if (sortOrder === null) {
      Toast.show({ type: 'error', text1: 'Invalid order', text2: 'Enter a whole number.' });
      return;
    }
    const defaultTime = form.defaultTime.trim();
    if (defaultTime && !isEntryTimeString(defaultTime)) {
      Toast.show({ type: 'error', text1: 'Invalid time', text2: 'Use 24-hour HH:MM (e.g. 07:30, 17:00).' });
      return;
    }
    updateMutation.mutate({
      id: editingType.id,
      data: {
        name,
        sort_order: sortOrder,
        default_time: defaultTime || null,
      },
    });
    setEditModalVisible(false);
    setEditingType(null);
    setForm(emptyForm);
  }, [editingType, form, updateMutation]);

  const openEdit = useCallback((mt: MealType) => {
    setEditingType(mt);
    setForm({
      name: mt.name,
      sortOrder: String(mt.sort_order ?? ''),
      defaultTime: toHourMinute(mt.default_time) || '',
    });
    setEditModalVisible(true);
  }, []);

  const saveDefaultTime = useCallback(
    (mt: MealType, raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        updateMutation.mutate({ id: mt.id, data: { default_time: null } });
        return;
      }
      if (isEntryTimeString(trimmed)) {
        updateMutation.mutate({ id: mt.id, data: { default_time: trimmed } });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Invalid time',
          text2: 'Use 24-hour HH:MM (e.g. 07:30, 17:00).',
        });
      }
    },
    [updateMutation],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const { systemTypes, customTypes } = useMemo(() => {
    const types = mealTypes ?? [];
    return {
      systemTypes: types.filter((mt) => mt.user_id === null),
      customTypes: types.filter((mt) => mt.user_id !== null),
    };
  }, [mealTypes]);

  const header = useScreenHeader({
    title: 'Meal Types',
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      role: 'primary',
      onPress: () => {
        setForm(emptyForm);
        setAddModalVisible(true);
      },
      accessibilityLabel: 'Add meal type',
      identifier: 'meal-types-add',
    },
  });

  const renderMealTypeRow = (mt: MealType, isCustom: boolean) => (
    <View
      key={mt.id}
      className="flex-row items-center py-3 px-4 bg-surface border-b border-border/40"
    >
      {isCustom ? (
        <TouchableOpacity
          className="flex-1"
          onPress={() => openEdit(mt)}
          activeOpacity={0.6}
          accessibilityLabel={`Edit ${mt.name}`}
        >
          <Text className="text-base text-text-primary font-medium">{mt.name}</Text>
          <Text className="text-xs text-text-muted mt-0.5">
            Custom
            {mt.sort_order != null ? ` · Order: ${mt.sort_order}` : ''}
          </Text>
        </TouchableOpacity>
      ) : (
        <View className="flex-1">
          <Text className="text-base text-text-primary font-medium">{mt.name}</Text>
          <Text className="text-xs text-text-muted mt-0.5">
            System
            {mt.sort_order != null ? ` · Order: ${mt.sort_order}` : ''}
          </Text>
        </View>
      )}
      <DefaultTimeInput mealType={mt} onSave={saveDefaultTime} />
      <View className="flex-row items-center gap-2 ml-2">
        <View className="items-center">
          <Text className="text-[10px] text-text-muted mb-0.5">Visible</Text>
          <Switch
            value={mt.is_visible}
            onValueChange={(val) =>
              updateMutation.mutate({ id: mt.id, data: { is_visible: val } })
            }
            trackColor={{ false: formDisabled, true: formEnabled }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Visible ${mt.name}`}
          />
        </View>
        <View className="items-center">
          <Text className="text-[10px] text-text-muted mb-0.5">Quick</Text>
          <Switch
            value={mt.show_in_quick_log}
            onValueChange={(val) =>
              updateMutation.mutate({ id: mt.id, data: { show_in_quick_log: val } })
            }
            trackColor={{ false: formDisabled, true: formEnabled }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Quick log ${mt.name}`}
          />
        </View>
        {isCustom && (
          <TouchableOpacity
            onPress={() => handleDelete(mt)}
            className="p-2"
            accessibilityLabel={`Delete ${mt.name}`}
          >
            <Icon name="trash" size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
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
          {systemTypes.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                System Types
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {systemTypes.map((mt) => renderMealTypeRow(mt, false))}
              </View>
            </View>
          )}

          {customTypes.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                Custom Types
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {customTypes.map((mt) => renderMealTypeRow(mt, true))}
              </View>
            </View>
          )}

          {!isLoading && systemTypes.length === 0 && customTypes.length === 0 && (
            <View className="items-center justify-center py-16 px-8">
              <Text className="text-text-muted text-lg text-center">No meal types found</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-6"
          onPress={() => setAddModalVisible(false)}
        >
          <Pressable
            className="bg-surface rounded-xl w-full max-w-sm p-6"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-text-primary mb-4">Add Meal Type</Text>
            <Text className="text-xs font-semibold text-text-muted uppercase mb-1">Name</Text>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="e.g. Pre-Workout"
              placeholderTextColor="#9CA3AF"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
              autoFocus
              returnKeyType="done"
            />
            <Text className="text-xs font-semibold text-text-muted uppercase mt-4 mb-1">Order</Text>
            <TextInput
              value={form.sortOrder}
              onChangeText={(sortOrder) => setForm((f) => ({ ...f, sortOrder }))}
              placeholder="e.g. 11"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
            />
            <Text className="text-xs font-semibold text-text-muted uppercase mt-4 mb-1">Default Time</Text>
            <TextInput
              value={form.defaultTime}
              onChangeText={(defaultTime) => setForm((f) => ({ ...f, defaultTime }))}
              placeholder="HH:MM (e.g. 07:30)"
              placeholderTextColor="#9CA3AF"
              keyboardType="numbers-and-punctuation"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
            />
            <View className="flex-row justify-end gap-3 mt-5">
              <TouchableOpacity
                onPress={() => setAddModalVisible(false)}
                className="px-4 py-2"
              >
                <Text className="text-text-secondary text-base">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                className="px-4 py-2 bg-accent-primary rounded-lg"
                accessibilityLabel="Create meal type"
              >
                <Text className="text-white font-semibold text-base">Add</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-6"
          onPress={() => setEditModalVisible(false)}
        >
          <Pressable
            className="bg-surface rounded-xl w-full max-w-sm p-6"
            onPress={() => {}}
          >
            <Text className="text-lg font-bold text-text-primary mb-4">Edit Meal Type</Text>
            <Text className="text-xs font-semibold text-text-muted uppercase mb-1">Name</Text>
            <TextInput
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="Name"
              placeholderTextColor="#9CA3AF"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
              autoFocus
              returnKeyType="done"
            />
            <Text className="text-xs font-semibold text-text-muted uppercase mt-4 mb-1">Order</Text>
            <TextInput
              value={form.sortOrder}
              onChangeText={(sortOrder) => setForm((f) => ({ ...f, sortOrder }))}
              placeholder="e.g. 11"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
            />
            <Text className="text-xs font-semibold text-text-muted uppercase mt-4 mb-1">Default Time</Text>
            <TextInput
              value={form.defaultTime}
              onChangeText={(defaultTime) => setForm((f) => ({ ...f, defaultTime }))}
              placeholder="HH:MM (e.g. 07:30)"
              placeholderTextColor="#9CA3AF"
              keyboardType="numbers-and-punctuation"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
            />
            <View className="flex-row justify-end gap-3 mt-5">
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                className="px-4 py-2"
              >
                <Text className="text-text-secondary text-base">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditSave}
                className="px-4 py-2 bg-accent-primary rounded-lg"
                accessibilityLabel="Save meal type"
              >
                <Text className="text-white font-semibold text-base">Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default MealTypeSettingsScreen;
