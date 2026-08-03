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
import { useTranslation } from 'react-i18next';

type MealTypeSettingsScreenProps = RootStackScreenProps<'MealTypeSettings'>;

const MealTypeSettingsScreen: React.FC<MealTypeSettingsScreenProps> = () => {
  const { t } = useTranslation();
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
  const [newName, setNewName] = useState('');
  const [editingType, setEditingType] = useState<MealType | null>(null);
  const [editName, setEditName] = useState('');

  const { data: mealTypes, isLoading, isError, refetch } = useQuery({
    queryKey: mealTypesQueryKey,
    queryFn: fetchMealTypes,
    staleTime: 0,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: mealTypesQueryKey });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (name: string) => createMealType({ name, sort_order: 99 }),
    onSuccess: () => {
      invalidate();
       Toast.show({ type: 'success', text1: t('foodMealScreens.mealTypeCreated') });
    },
    onError: (err: Error) => {
      addLog(`Failed to create meal type: ${err.message}`, 'ERROR');
       Toast.show({ type: 'error', text1: t('foodMealScreens.failedCreateMealType') });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<MealType, 'id'>> }) =>
      updateMealType(id, data),
    onSuccess: () => invalidate(),
    onError: (err: Error) => {
      addLog(`Failed to update meal type: ${err.message}`, 'ERROR');
       Toast.show({ type: 'error', text1: t('foodMealScreens.failedUpdate') });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMealType(id),
    onSuccess: () => {
      invalidate();
       Toast.show({ type: 'success', text1: t('foodMealScreens.mealTypeDeleted') });
    },
    onError: (err: Error) => {
      addLog(`Failed to delete meal type: ${err.message}`, 'ERROR');
       Toast.show({ type: 'error', text1: t('foodMealScreens.failedDelete') });
    },
  });

  const handleDelete = useCallback(
    (mt: MealType) => {
       Alert.alert(t('foodMealScreens.deleteMealType'), t('foodMealScreens.deleteMealTypeConfirm', { name: mt.name }), [
         { text: t('common.cancel'), style: 'cancel' },
         { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate(mt.id) },
      ]);
    },
    [deleteMutation],
  );

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
    setNewName('');
    setAddModalVisible(false);
  }, [newName, createMutation]);

  const handleEditSave = useCallback(() => {
    if (!editingType) return;
    const name = editName.trim();
    if (!name) return;
    updateMutation.mutate({ id: editingType.id, data: { name } });
    setEditModalVisible(false);
    setEditingType(null);
  }, [editingType, editName, updateMutation]);

  const openEdit = useCallback((mt: MealType) => {
    setEditingType(mt);
    setEditName(mt.name);
    setEditModalVisible(true);
  }, []);

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
     title: t('foodMeals.mealTypes'),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      role: 'primary',
      onPress: () => {
        setNewName('');
        setAddModalVisible(true);
      },
       accessibilityLabel: t('foodMealScreens.addMealType'),
      identifier: 'meal-types-add',
    },
  });

  const renderMealTypeRow = (mt: MealType, isCustom: boolean) => (
    <View
      key={mt.id}
      className="flex-row items-center py-3 px-4 bg-surface border-b border-border/40"
    >
      <TouchableOpacity
        className="flex-1"
        onPress={() => openEdit(mt)}
        activeOpacity={0.6}
      >
        <Text className="text-base text-text-primary font-medium">{mt.name}</Text>
        <Text className="text-xs text-text-muted mt-0.5">
           {isCustom ? t('foodMealScreens.custom') : t('foodMealScreens.system')}
           {mt.sort_order != null ? ` · ${t('foodMealScreens.order', { order: mt.sort_order })}` : ''}
        </Text>
      </TouchableOpacity>
      <View className="flex-row items-center gap-3">
        <View className="items-center">
           <Text className="text-[10px] text-text-muted mb-0.5">{t('foodMealScreens.visible')}</Text>
          <Switch
            value={mt.is_visible}
            onValueChange={(val) =>
              updateMutation.mutate({ id: mt.id, data: { is_visible: val } })
            }
            trackColor={{ false: formDisabled, true: formEnabled }}
            thumbColor="#FFFFFF"
          />
        </View>
        <View className="items-center">
           <Text className="text-[10px] text-text-muted mb-0.5">{t('foodMealScreens.quick')}</Text>
          <Switch
            value={mt.show_in_quick_log}
            onValueChange={(val) =>
              updateMutation.mutate({ id: mt.id, data: { show_in_quick_log: val } })
            }
            trackColor={{ false: formDisabled, true: formEnabled }}
            thumbColor="#FFFFFF"
          />
        </View>
        {isCustom && (
          <TouchableOpacity
            onPress={() => handleDelete(mt)}
            className="p-2"
             accessibilityLabel={t('common.delete')}
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
           <Text className="text-text-muted text-base">{t('foodMealScreens.loadingMealTypes')}</Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center p-8">
           <Text className="text-text-muted text-base text-center">{t('foodMealScreens.failedMealTypes')}</Text>
          <TouchableOpacity onPress={() => void refetch()} className="mt-4">
             <Text className="text-accent-primary text-base font-medium">{t('common.retry')}</Text>
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
                 {t('foodMealScreens.systemTypes')}
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {systemTypes.map((mt) => renderMealTypeRow(mt, false))}
              </View>
            </View>
          )}

          {customTypes.length > 0 && (
            <View className="mb-4">
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                 {t('foodMealScreens.customTypes')}
              </Text>
              <View className="bg-surface rounded-xl mx-4 overflow-hidden shadow-sm">
                {customTypes.map((mt) => renderMealTypeRow(mt, true))}
              </View>
            </View>
          )}

          {!isLoading && systemTypes.length === 0 && customTypes.length === 0 && (
            <View className="items-center justify-center py-16 px-8">
               <Text className="text-text-muted text-lg text-center">{t('foodMealScreens.noMealTypes')}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={addModalVisible} transparent animationType="fade">
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-6"
          onPress={() => setAddModalVisible(false)}
        >
          <Pressable
            className="bg-surface rounded-xl w-full max-w-sm p-6"
            onPress={() => {}}
          >
             <Text className="text-lg font-bold text-text-primary mb-4">{t('foodMealScreens.addMealType')}</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
               placeholder={t('foodMealScreens.mealTypePlaceholder')}
              placeholderTextColor="#9CA3AF"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
              autoFocus
              onSubmitEditing={handleAdd}
              returnKeyType="done"
            />
            <View className="flex-row justify-end gap-3 mt-5">
              <TouchableOpacity
                onPress={() => setAddModalVisible(false)}
                className="px-4 py-2"
              >
                 <Text className="text-text-secondary text-base">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                className="px-4 py-2 bg-accent-primary rounded-lg"
              >
                 <Text className="text-white font-semibold text-base">{t('foodMealScreens.add')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editModalVisible} transparent animationType="fade">
        <Pressable
          className="flex-1 bg-black/50 items-center justify-center px-6"
          onPress={() => setEditModalVisible(false)}
        >
          <Pressable
            className="bg-surface rounded-xl w-full max-w-sm p-6"
            onPress={() => {}}
          >
             <Text className="text-lg font-bold text-text-primary mb-4">{t('foodMealScreens.renameMealType')}</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
               placeholder={t('foodMealScreens.name')}
              placeholderTextColor="#9CA3AF"
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base"
              autoFocus
              onSubmitEditing={handleEditSave}
              returnKeyType="done"
            />
            <View className="flex-row justify-end gap-3 mt-5">
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                className="px-4 py-2"
              >
                 <Text className="text-text-secondary text-base">{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEditSave}
                className="px-4 py-2 bg-accent-primary rounded-lg"
              >
                 <Text className="text-white font-semibold text-base">{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default MealTypeSettingsScreen;
