import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { TagInput } from '../components/TagInput';
import {
  useCustomNutrients,
  type UserCustomNutrient,
} from '../hooks/useCustomNutrients';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  customNutrientsQueryKey,
  dailySummaryRootQueryKey,
  foodsQueryKey,
  nutrientDisplayPreferencesQueryKey,
  nutrientGoalPreferencesQueryKey,
} from '../hooks/queryKeys';
import {
  createCustomNutrient,
  deleteCustomNutrient,
  updateCustomNutrient,
} from '../services/api/customNutrientsApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type CustomNutrientFormScreenProps = RootStackScreenProps<'CustomNutrientForm'>;

interface CustomNutrientFormProps {
  navigation: CustomNutrientFormScreenProps['navigation'];
  nutrientId: string | undefined;
  existing: UserCustomNutrient | undefined;
}

const CustomNutrientForm: React.FC<CustomNutrientFormProps> = ({
  navigation,
  nutrientId,
  existing,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const isEditing = nutrientId !== undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [aliases, setAliases] = useState<string[]>(existing?.aliases ?? []);

  // A custom nutrient's name is the key for its goal, display and diary values,
  // so every nutrient-keyed cache has to refresh after a change here.
  const invalidateNutrientCaches = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: customNutrientsQueryKey }),
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: nutrientGoalPreferencesQueryKey,
      }),
      queryClient.invalidateQueries({ queryKey: foodsQueryKey }),
      queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey }),
      queryClient.invalidateQueries({ queryKey: ['goals'] }),
    ]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), unit: unit.trim(), aliases };
      return isEditing
        ? updateCustomNutrient(nutrientId, data)
        : createCustomNutrient(data);
    },
    onSuccess: async () => {
      await invalidateNutrientCaches();
      navigation.goBack();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('customNutrients.saveFailed', {
          defaultValue: 'Failed to save custom nutrient',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteAllHistory: boolean) =>
      deleteCustomNutrient(nutrientId as string, deleteAllHistory),
    onSuccess: async () => {
      await invalidateNutrientCaches();
      navigation.goBack();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: t('customNutrients.deleteFailed', {
          defaultValue: 'Failed to delete custom nutrient',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
  });

  const isSaving = saveMutation.isPending;
  const canSave = name.trim().length > 0 && unit.trim().length > 0;

  const save = () => {
    if (!canSave) {
      Toast.show({
        type: 'error',
        text1: t('customNutrients.required', {
          defaultValue: 'Nutrient name and unit are required.',
        }),
      });
      return;
    }
    saveMutation.mutate();
  };

  // `disabled` only updates after a re-render, so a fast double tap could open
  // two alerts and send two DELETEs. Taken synchronously, released when the
  // alert is dismissed or the request settles.
  const deleteLock = useRef(false);
  const releaseDeleteLock = () => {
    deleteLock.current = false;
  };
  const startDelete = (deleteAllHistory: boolean) =>
    deleteMutation.mutate(deleteAllHistory, { onSettled: releaseDeleteLock });

  const confirmDelete = () => {
    if (deleteLock.current || deleteMutation.isPending) return;
    deleteLock.current = true;
    Alert.alert(
      t('customNutrients.deleteTitle', {
        defaultValue: 'Delete custom nutrient',
      }),
      t('customNutrients.deleteMessage', {
        defaultValue:
          'Delete {{name}}? You can also remove it from past goals and diary entries.',
        name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
          onPress: releaseDeleteLock,
        },
        {
          text: t('customNutrients.deleteKeepHistory', {
            defaultValue: 'Delete, keep history',
          }),
          style: 'destructive',
          onPress: () => startDelete(false),
        },
        {
          text: t('customNutrients.deleteAllHistory', {
            defaultValue: 'Delete and remove history',
          }),
          style: 'destructive',
          onPress: () => startDelete(true),
        },
      ],
      { onDismiss: releaseDeleteLock }
    );
  };

  const header = useScreenHeader({
    title: isEditing
      ? t('customNutrients.editTitle', { defaultValue: 'Edit nutrient' })
      : t('customNutrients.createTitle', { defaultValue: 'Add nutrient' }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving,
      onPress: save,
    },
  });

  const wrapperStyle = usesNativeHeader
    ? undefined
    : { paddingTop: insets.top };

  return (
    <View className="flex-1 bg-background" style={wrapperStyle}>
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : undefined
        }
      >
        <View>
          <Text className="text-sm font-medium text-text-secondary mb-1">
            {t('customNutrients.name', { defaultValue: 'Nutrient name' })}
          </Text>
          <FormInput
            value={name}
            onChangeText={setName}
            placeholder={t('customNutrients.namePlaceholder', {
              defaultValue: 'e.g., Magnesium',
            })}
            autoCapitalize="words"
            maxLength={100}
            testID="custom-nutrient-name"
          />
        </View>
        <View>
          <Text className="text-sm font-medium text-text-secondary mb-1">
            {t('customNutrients.unit', { defaultValue: 'Unit' })}
          </Text>
          <FormInput
            value={unit}
            onChangeText={setUnit}
            placeholder={t('customNutrients.unitPlaceholder', {
              defaultValue: 'e.g., mg, µg, IU',
            })}
            autoCapitalize="none"
            maxLength={20}
            testID="custom-nutrient-unit"
          />
        </View>
        <View>
          <Text className="text-sm font-medium text-text-secondary mb-1">
            {t('customNutrients.aliases', { defaultValue: 'Provider aliases' })}
          </Text>
          <TagInput
            value={aliases}
            onChange={setAliases}
            placeholder={t('customNutrients.aliasPlaceholder', {
              defaultValue: 'Type a name, then press return',
            })}
          />
          <Text className="text-xs text-text-muted mt-2">
            {t('customNutrients.aliasesHelp', {
              defaultValue:
                'Names online food databases use for this nutrient. When you import a food, matching provider fields fill this nutrient.',
            })}
          </Text>
        </View>

        {isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('customNutrients.delete', {
              defaultValue: 'Delete nutrient',
            })}
            onPress={confirmDelete}
            disabled={deleteMutation.isPending || isSaving}
            className="flex-row items-center justify-center mt-8 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Icon name="trash" size={18} color="#dc2626" />
            <Text className="text-icon-danger text-base font-semibold ml-2">
              {t('customNutrients.delete', { defaultValue: 'Delete nutrient' })}
            </Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>

      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={save}
          busy={isSaving}
          disabled={isSaving || deleteMutation.isPending}
        />
      ) : null}
    </View>
  );
};

const CustomNutrientFormScreen: React.FC<CustomNutrientFormScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const nutrientId = route.params?.nutrientId;
  const { customNutrients, isLoading } = useCustomNutrients();
  const existing = customNutrients.find((n) => n.id === nutrientId);

  // Hold the form back until the nutrient being edited is loaded, so its fields
  // seed from real values rather than empty ones.
  const header = useScreenHeader({
    title: t('customNutrients.editTitle', { defaultValue: 'Edit nutrient' }),
    left: { kind: 'back' },
  });

  if (nutrientId !== undefined && !existing) {
    return (
      <View
        className="flex-1 bg-background"
        style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
      >
        {header}
        {isLoading ? (
          <StatusView
            loading
            title={t('customNutrients.loading', {
              defaultValue: 'Loading custom nutrients...',
            })}
          />
        ) : (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={t('customNutrients.notFound', {
              defaultValue: 'Custom nutrient not found',
            })}
          />
        )}
      </View>
    );
  }

  return (
    <CustomNutrientForm
      navigation={navigation}
      nutrientId={nutrientId}
      existing={existing}
    />
  );
};

export default CustomNutrientFormScreen;
