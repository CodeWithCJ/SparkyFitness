import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import { FooterSaveBar } from '../components/FormScreenChrome';
import StatusView from '../components/StatusView';
import {
  useCreateCustomCategory,
  useCustomCategories,
  useUpdateCustomCategory,
} from '../hooks/useCustomMeasurements';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type {
  CustomCategory,
  CustomCategoryDataType,
  CustomCategoryFrequency,
} from '../types/customMeasurements';
import type { RootStackScreenProps } from '../types/navigation';

type CustomCategoryEditScreenProps = RootStackScreenProps<'CustomCategoryEdit'>;

const NAME_MAX = 50;
const DISPLAY_NAME_MAX = 100;
const UNIT_MAX = 50;

// Same quick-pick units as the web category manager; standard units let the
// charts pick sensible precision.
const COMMON_UNITS = [
  'kcal',
  'mmHg',
  'bpm',
  'g',
  'km',
  'miles',
  '%',
  '°C',
  '°F',
];

interface FormState {
  name: string;
  displayName: string;
  unit: string;
  frequency: CustomCategoryFrequency;
  dataType: CustomCategoryDataType;
}

const EMPTY_FORM: FormState = {
  name: '',
  displayName: '',
  unit: '',
  frequency: 'Daily',
  dataType: 'numeric',
};

function toFrequency(value: string): CustomCategoryFrequency {
  return value === 'All' || value === 'Hourly' ? value : 'Daily';
}

function formStateFromCategory(
  category: CustomCategory | undefined
): FormState {
  if (!category) return EMPTY_FORM;
  return {
    name: category.name,
    displayName: category.display_name ?? '',
    unit: category.measurement_type,
    frequency: toFrequency(category.frequency),
    dataType: category.data_type === 'text' ? 'text' : 'numeric',
  };
}

const CustomCategoryEditScreen: React.FC<CustomCategoryEditScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const categoryId = route.params?.categoryId;
  const isEditing = categoryId !== undefined;

  const { data: categories = [], isLoading: isCategoriesLoading } =
    useCustomCategories();
  const existingCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId]
  );

  const [form, setForm] = useState<FormState>(() =>
    formStateFromCategory(existingCategory)
  );
  // The category list may still be loading on first render (deep link, cold
  // start); re-seed once when it arrives, during render so there is no blank
  // frame, as WaterContainerEditScreen does.
  const [seededCategoryId, setSeededCategoryId] = useState<string | null>(
    existingCategory?.id ?? null
  );
  if (existingCategory && seededCategoryId !== existingCategory.id) {
    setSeededCategoryId(existingCategory.id);
    setForm(formStateFromCategory(existingCategory));
  }

  const { mutateAsync: createCategory, isPending: isCreating } =
    useCreateCustomCategory();
  const { mutateAsync: updateCategory, isPending: isUpdating } =
    useUpdateCustomCategory();
  const isSaving = isCreating || isUpdating;

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (isEditing && !existingCategory) {
      Toast.show({
        type: 'error',
        text1: t('customCategoryEdit.saveFailed', {
          defaultValue: 'Failed to save category',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
      return;
    }

    const name = form.name.trim();
    const unit = form.unit.trim();
    if (!name || !unit) {
      Toast.show({
        type: 'error',
        text1: t('customCategoryEdit.errors.title', {
          defaultValue: 'Check the form',
        }),
        text2: t('customCategoryEdit.errors.required', {
          defaultValue: 'Name and measurement type are required.',
        }),
      });
      return;
    }

    const payload = {
      name,
      display_name: form.displayName.trim() || null,
      measurement_type: unit,
      frequency: form.frequency,
      data_type: form.dataType,
    };

    try {
      if (isEditing && categoryId !== undefined) {
        await updateCategory({ id: categoryId, payload });
      } else {
        await createCategory(payload);
      }
      Toast.show({
        type: 'success',
        text1: t('customCategoryEdit.saveSuccess', {
          defaultValue: 'Category saved',
        }),
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('customCategoryEdit.saveFailed', {
          defaultValue: 'Failed to save category',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  };

  const header = useScreenHeader({
    title: isEditing
      ? t('customCategoryEdit.editTitle', { defaultValue: 'Edit category' })
      : t('customCategoryEdit.createTitle', { defaultValue: 'Add category' }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving,
      onPress: () => void save(),
    },
  });

  if (isEditing && isCategoriesLoading) {
    return (
      <View
        className="flex-1 bg-background"
        style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          loading
          title={t('customCategoryEdit.loading', {
            defaultValue: 'Loading category...',
          })}
        />
      </View>
    );
  }

  const dataTypeOptions = [
    {
      label: t('customCategoryEdit.dataTypeNumeric', {
        defaultValue: 'Numeric',
      }),
      value: 'numeric',
    },
    {
      label: t('customCategoryEdit.dataTypeText', { defaultValue: 'Text' }),
      value: 'text',
    },
  ];

  const frequencyOptions = [
    {
      label: t('customCategoryEdit.frequencyAll', {
        defaultValue: 'All (unlimited entries)',
      }),
      value: 'All',
    },
    {
      label: t('customCategoryEdit.frequencyDaily', {
        defaultValue: 'Daily (one per day)',
      }),
      value: 'Daily',
    },
    {
      label: t('customCategoryEdit.frequencyHourly', {
        defaultValue: 'Hourly (one per hour)',
      }),
      value: 'Hourly',
    },
  ];

  return (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 96,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm font-semibold text-text-secondary mb-1.5">
          {t('customCategoryEdit.name', { defaultValue: 'Name' })}
        </Text>
        <FormInput
          value={form.name}
          maxLength={NAME_MAX}
          placeholder={t('customCategoryEdit.namePlaceholder', {
            defaultValue: 'e.g. Blood Sugar',
          })}
          onChangeText={(value) => updateField('name', value)}
        />
        <Text className="text-xs text-text-muted mt-1">
          {t('customCategoryEdit.nameHelp', {
            defaultValue: 'Internal identifier used for syncing',
          })}
        </Text>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('customCategoryEdit.displayName', {
            defaultValue: 'Display name (optional)',
          })}
        </Text>
        <FormInput
          value={form.displayName}
          maxLength={DISPLAY_NAME_MAX}
          placeholder={t('customCategoryEdit.displayNamePlaceholder', {
            defaultValue: 'e.g. Morning Blood Sugar Level',
          })}
          onChangeText={(value) => updateField('displayName', value)}
        />
        <Text className="text-xs text-text-muted mt-1">
          {t('customCategoryEdit.displayNameHelp', {
            defaultValue: 'Optional custom name shown in the app',
          })}
        </Text>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('customCategoryEdit.measurementType', {
            defaultValue: 'Measurement type',
          })}
        </Text>
        <FormInput
          value={form.unit}
          maxLength={UNIT_MAX}
          placeholder={t('customCategoryEdit.measurementTypePlaceholder', {
            defaultValue: 'e.g. mg/dL',
          })}
          onChangeText={(value) => updateField('unit', value)}
        />
        <View className="flex-row flex-wrap gap-2 mt-2">
          {COMMON_UNITS.map((unit) => (
            <Pressable
              key={unit}
              accessibilityRole="button"
              className="bg-surface rounded-full px-3 py-1.5 shadow-sm"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              onPress={() => updateField('unit', unit)}
            >
              <Text className="text-sm text-text-primary">{unit}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-xs text-text-muted mt-2">
          {t('customCategoryEdit.unitPrecisionNote', {
            defaultValue:
              'Using standard units (like kcal, mmHg, bpm) automatically optimizes chart precision.',
          })}
        </Text>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('customCategoryEdit.dataType', { defaultValue: 'Data type' })}
        </Text>
        <BottomSheetPicker
          value={form.dataType}
          options={dataTypeOptions}
          onSelect={(value) =>
            updateField('dataType', value as CustomCategoryDataType)
          }
          title={t('customCategoryEdit.dataType', {
            defaultValue: 'Data type',
          })}
        />

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('customCategoryEdit.frequency', { defaultValue: 'Frequency' })}
        </Text>
        <BottomSheetPicker
          value={form.frequency}
          options={frequencyOptions}
          onSelect={(value) =>
            updateField('frequency', value as CustomCategoryFrequency)
          }
          title={t('customCategoryEdit.frequency', {
            defaultValue: 'Frequency',
          })}
        />
      </KeyboardAwareScrollView>
      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={() => void save()}
          busy={isSaving}
          disabled={isSaving}
        />
      ) : null}
    </View>
  );
};

export default CustomCategoryEditScreen;
