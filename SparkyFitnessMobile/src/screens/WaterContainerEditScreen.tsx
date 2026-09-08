import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Switch from '../components/ui/Switch';
import {
  useWaterContainersQuery,
  useCreateWaterContainerMutation,
  useUpdateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useMealTypes,
} from '../hooks';
import { useFoodVariants } from '../hooks/useFoodVariants';
import {
  linkedHydrationExample,
  plainHydrationExample,
} from '@workspace/shared';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { consumePendingContainerLinkSelection } from '../services/waterContainerLinkSelection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type { WaterContainer } from '../types/measurements';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import { parseDecimalInput } from '../utils/numericInput';
import { volumeFromMl } from '../utils/unitConversions';

type WaterContainerEditScreenProps = RootStackScreenProps<'WaterContainerEdit'>;

// The two kinds of container are measured differently -- one by its own
// volume, one by the food it holds -- so the form asks for one set of fields
// or the other, never both.
type ContainerMode = 'water' | 'food';

interface FormState {
  name: string;
  volume: string;
  unit: 'ml' | 'oz' | 'liter';
  servingsPerContainer: string;
  isPrimary: boolean;
  hydrationFactor: string;
  linkedFoodId: string | null;
  linkedVariantId: string | null;
  linkedFoodName: string | null;
  linkedMealTypeId: string | null;
  /** In the linked variant's own unit, exactly as the diary asks for it. */
  linkedQuantity: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  volume: '',
  unit: 'ml',
  servingsPerContainer: '1',
  isPrimary: false,
  hydrationFactor: '1',
  linkedFoodId: null,
  linkedVariantId: null,
  linkedFoodName: null,
  linkedMealTypeId: null,
  linkedQuantity: '1',
};

function formStateFromContainer(
  container: WaterContainer | undefined
): FormState {
  if (!container) return EMPTY_FORM;
  const unit = (container.unit as FormState['unit']) || 'ml';
  return {
    name: container.name,
    // Volumes are persisted in millilitres. The field is labelled with the
    // container's own unit and is sent back under that unit, where the server
    // converts to millilitres again -- seeding raw millilitres turned a 20 oz
    // container into ~17.5 L on the first save.
    volume: String(
      Number(
        volumeFromMl(container.volume, unit).toFixed(unit === 'ml' ? 0 : 2)
      )
    ),
    unit,
    servingsPerContainer: String(container.servings_per_container ?? 1),
    isPrimary: container.is_primary,
    hydrationFactor: String(container.hydration_factor ?? 1),
    linkedFoodId: container.linked_food_id ?? null,
    linkedVariantId: container.linked_variant_id ?? null,
    linkedFoodName: container.linked_food_name ?? null,
    linkedMealTypeId: container.linked_meal_type_id ?? null,
    linkedQuantity: String(container.linked_quantity ?? 1),
  };
}

const WaterContainerEditScreen: React.FC<WaterContainerEditScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const containerId = route.params?.containerId;
  const isEditing = containerId !== undefined;

  const { containers, isLoading: isContainersLoading } =
    useWaterContainersQuery();
  const existingContainer = useMemo(
    () => containers.find((c) => c.id === containerId),
    [containers, containerId]
  );

  const { mealTypes } = useMealTypes();

  const [form, setForm] = useState<FormState>(() =>
    formStateFromContainer(existingContainer)
  );

  const [mode, setMode] = useState<ContainerMode>(() =>
    existingContainer?.linked_food_id ? 'food' : 'water'
  );

  // useState initialisers run once, on the first render -- which happens before
  // useWaterContainersQuery has resolved on a cold start or a deep link. The
  // form stayed empty then, and saving it wiped the container. Re-seed the
  // first time the container actually arrives, during render rather than in an
  // effect (React's "adjusting state when a prop changes" pattern) so the form
  // never paints a blank frame over real data.
  const [seededContainerId, setSeededContainerId] = useState<number | null>(
    existingContainer?.id ?? null
  );
  if (existingContainer && seededContainerId !== existingContainer.id) {
    setSeededContainerId(existingContainer.id);
    setForm(formStateFromContainer(existingContainer));
    setMode(existingContainer.linked_food_id ? 'food' : 'water');
  }

  const { variants } = useFoodVariants(form.linkedFoodId ?? '', {
    enabled: !!form.linkedFoodId,
  });

  // Consume a food picked via FoodSearchScreen's 'container-link' mode.
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingContainerLinkSelection();
      if (!selection) return;
      setForm((current) => ({
        ...current,
        linkedFoodId: selection.foodId,
        linkedVariantId: selection.variantId,
        linkedFoodName: selection.foodName,
        linkedQuantity: String(selection.quantity || 1),
      }));
    }, [])
  );

  const { createWaterContainerAsync, isPending: isCreating } =
    useCreateWaterContainerMutation();
  const { updateWaterContainerAsync, isPending: isUpdating } =
    useUpdateWaterContainerMutation();
  const { deleteWaterContainerAsync, isPending: isDeleting } =
    useDeleteWaterContainerMutation();
  const isSaving = isCreating || isUpdating;

  const updateField = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const validate = (): string | null => {
    if (!form.name.trim()) {
      return t('waterContainerEdit.errors.nameRequired', {
        defaultValue: 'Name is required.',
      });
    }
    if (mode === 'food') {
      if (!form.linkedFoodId) {
        return t('waterContainerEdit.errors.foodRequired', {
          defaultValue: 'Pick the food this container holds.',
        });
      }
      const quantity = parseDecimalInput(form.linkedQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return t('waterContainerEdit.errors.quantityInvalid', {
          defaultValue: 'Quantity must be greater than zero.',
        });
      }
    } else {
      const volume = parseDecimalInput(form.volume);
      if (!Number.isFinite(volume) || volume <= 0) {
        return t('waterContainerEdit.errors.volumeInvalid', {
          defaultValue: 'Volume must be greater than zero.',
        });
      }
      const servings = parseInt(form.servingsPerContainer, 10);
      if (!Number.isFinite(servings) || servings < 1) {
        return t('waterContainerEdit.errors.servingsInvalid', {
          defaultValue: 'Servings per container must be at least 1.',
        });
      }
    }
    const factor = parseDecimalInput(form.hydrationFactor);
    if (!Number.isFinite(factor) || factor < 0 || factor > 2) {
      return t('waterContainerEdit.errors.factorInvalid', {
        defaultValue: 'Hydration factor must be between 0 and 2.',
      });
    }
    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) {
      Toast.show({
        type: 'error',
        text1: t('waterContainerEdit.errors.title', {
          defaultValue: 'Check the form',
        }),
        text2: error,
      });
      return;
    }

    const isLinked = mode === 'food';
    const body = {
      name: form.name.trim(),
      // 0 is the server's "no override": a linked container measures the drink
      // by the food it holds rather than repeating a volume here.
      volume: isLinked ? 0 : parseDecimalInput(form.volume),
      unit: form.unit,
      is_primary: form.isPrimary,
      servings_per_container: isLinked
        ? 1
        : parseInt(form.servingsPerContainer, 10),
      hydration_factor: parseDecimalInput(form.hydrationFactor),
      linked_food_id: isLinked ? form.linkedFoodId : null,
      linked_variant_id: isLinked ? form.linkedVariantId : null,
      linked_meal_type_id: isLinked ? form.linkedMealTypeId : null,
      linked_quantity: isLinked ? parseDecimalInput(form.linkedQuantity) : 1,
    };

    try {
      if (isEditing && containerId !== undefined) {
        await updateWaterContainerAsync(containerId, body);
      } else {
        await createWaterContainerAsync(body);
      }
      Toast.show({
        type: 'success',
        text1: t('waterContainerEdit.saveSuccess', {
          defaultValue: 'Water container saved',
        }),
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('waterContainerEdit.saveFailed', {
          defaultValue: 'Failed to save water container',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  };

  const confirmDelete = () => {
    if (containerId === undefined) return;
    Alert.alert(
      t('waterContainers.deleteTitle', { defaultValue: 'Delete container' }),
      t('waterContainers.deleteMessage', {
        defaultValue: 'Delete {{name}}?',
        name: form.name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWaterContainerAsync(containerId);
              Toast.show({
                type: 'success',
                text1: t('waterContainers.deleteSuccess', {
                  defaultValue: 'Container deleted',
                }),
              });
              navigation.goBack();
            } catch {
              Toast.show({
                type: 'error',
                text1: t('waterContainers.deleteFailed', {
                  defaultValue: 'Failed to delete container',
                }),
                text2: t('common.tryAgain', {
                  defaultValue: 'Please try again.',
                }),
              });
            }
          },
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: isEditing
      ? t('waterContainerEdit.editTitle', { defaultValue: 'Edit container' })
      : t('waterContainerEdit.createTitle', {
          defaultValue: 'Add container',
        }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving,
      onPress: () => void save(),
    },
  });

  if (isEditing && isContainersLoading) {
    return (
      <View
        className="flex-1 bg-background"
        style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          loading
          title={t('waterContainerEdit.loading', {
            defaultValue: 'Loading container...',
          })}
        />
      </View>
    );
  }

  const unitOptions = [
    {
      label: t('waterContainerEdit.units.ml', { defaultValue: 'ml' }),
      value: 'ml',
    },
    {
      label: t('waterContainerEdit.units.oz', { defaultValue: 'oz' }),
      value: 'oz',
    },
    {
      label: t('waterContainerEdit.units.liter', { defaultValue: 'liter' }),
      value: 'liter',
    },
  ];

  // "0.9" says nothing about what a press will do, so show the numbers for the
  // container in front of the user; the generic examples stand in only while
  // there is nothing to compute from.
  const factor = parseDecimalInput(form.hydrationFactor);
  const linkedVariant = (variants ?? []).find(
    (variant) => variant.id === form.linkedVariantId
  );
  const hydrationExample =
    mode === 'food'
      ? linkedHydrationExample(factor, {
          waterMl: linkedVariant?.water_ml,
          servingSize: linkedVariant?.serving_size,
          quantity: parseDecimalInput(form.linkedQuantity),
        })
      : plainHydrationExample(factor, {
          volume: parseDecimalInput(form.volume),
          servings: parseInt(form.servingsPerContainer, 10),
          unit: form.unit,
        });

  const variantOptions = (variants ?? []).map((variant) => ({
    label: `${variant.serving_size} ${variant.serving_unit}`,
    value: variant.id,
  }));

  const selectMode = (next: ContainerMode) => {
    setMode(next);
    setForm((current) =>
      next === 'water'
        ? {
            // Leaving the drink tab drops the link, so a container cannot keep
            // a food the visible form no longer shows.
            ...current,
            linkedFoodId: null,
            linkedVariantId: null,
            linkedFoodName: null,
            linkedMealTypeId: null,
            linkedQuantity: '1',
          }
        : // Volume and servings belong to the water tab; a linked container
          // takes both from the food.
          { ...current, volume: '', servingsPerContainer: '1' }
    );
  };

  const mealTypeOptions = [
    {
      label: t('waterContainerEdit.noMealType', {
        defaultValue: 'None (use time of day)',
      }),
      value: '',
    },
    ...mealTypes.map((mealType) => ({
      label: getMealTypeDisplayLabel(mealType, t),
      value: mealType.id,
    })),
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
        <View className="flex-row bg-surface rounded-xl p-1 mb-4">
          {(['water', 'food'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === option }}
              onPress={() => selectMode(option)}
              className={`flex-1 py-2 rounded-lg ${
                mode === option ? 'bg-background' : ''
              }`}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text
                className={`text-center text-sm font-semibold ${
                  mode === option ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {option === 'water'
                  ? t('waterContainerEdit.tabWater', { defaultValue: 'Water' })
                  : t('waterContainerEdit.tabDrink', {
                      defaultValue: 'Drink (linked food)',
                    })}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5">
          {t('waterContainerEdit.name', { defaultValue: 'Name' })}
        </Text>
        <FormInput
          value={form.name}
          placeholder={t('waterContainerEdit.namePlaceholder', {
            defaultValue: 'e.g. My Water Bottle',
          })}
          onChangeText={(value) => updateField('name', value)}
        />

        {mode === 'water' ? (
          <>
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-text-secondary mb-1.5">
                  {t('waterContainerEdit.volume', { defaultValue: 'Volume' })}
                </Text>
                <FormInput
                  value={form.volume}
                  keyboardType="decimal-pad"
                  placeholder="500"
                  onChangeText={(value) => updateField('volume', value)}
                />
              </View>
              <View className="w-24">
                <Text className="text-sm font-semibold text-text-secondary mb-1.5">
                  {t('waterContainerEdit.unit', { defaultValue: 'Unit' })}
                </Text>
                <BottomSheetPicker
                  value={form.unit}
                  options={unitOptions}
                  onSelect={(value) =>
                    updateField('unit', value as FormState['unit'])
                  }
                  title={t('waterContainerEdit.unit', { defaultValue: 'Unit' })}
                />
              </View>
            </View>

            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
              {t('waterContainerEdit.servingsPerContainer', {
                defaultValue: 'Servings per container',
              })}
            </Text>
            <FormInput
              value={form.servingsPerContainer}
              keyboardType="number-pad"
              placeholder="1"
              onChangeText={(value) =>
                updateField('servingsPerContainer', value)
              }
            />
          </>
        ) : null}

        <View className="flex-row items-center justify-between mt-4">
          <Text className="text-sm font-semibold text-text-secondary">
            {t('waterContainerEdit.primary', {
              defaultValue: 'Primary container',
            })}
          </Text>
          <Switch
            value={form.isPrimary}
            onValueChange={(value) => updateField('isPrimary', value)}
          />
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('waterContainerEdit.hydrationFactor', {
            defaultValue: 'Hydration factor',
          })}
        </Text>
        <FormInput
          value={form.hydrationFactor}
          keyboardType="decimal-pad"
          placeholder="1.0"
          onChangeText={(value) => updateField('hydrationFactor', value)}
        />
        <Text className="text-xs text-text-muted mt-1">
          {hydrationExample
            ? t('waterContainerEdit.hydrationFactorExample', {
                defaultValue:
                  'At {{factor}}, one press adds {{credited}} {{unit}} to your water ring out of the drink\u2019s {{total}} {{unit}}. Calories, caffeine and alcohol always count in full.',
                factor,
                credited: hydrationExample.credited,
                total: hydrationExample.total,
                unit: hydrationExample.unit,
              })
            : t('waterContainerEdit.hydrationFactorHint', {
                defaultValue:
                  'Scales the water credit only: 1 for water, about 0.9 for coffee or tea, 0 for a drink that should count as no water at all. Calories, caffeine and alcohol always count in full.',
              })}
        </Text>
        <Text className="text-xs text-text-muted mt-1">
          {t('waterContainerEdit.hydrationFactorApplies', {
            defaultValue:
              'Applies to drinks logged from now on -- past entries keep the factor they were logged with.',
          })}
        </Text>

        {mode === 'food' ? (
          <>
            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
              {t('waterContainerEdit.linkedFood', {
                defaultValue: 'Linked food',
              })}
            </Text>
            <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
              <View className="flex-row items-center justify-between px-4 py-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate('FoodSearch', {
                      pickerMode: 'container-link',
                    })
                  }
                  className="flex-1 mr-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                >
                  <Text className="text-base text-text-primary">
                    {form.linkedFoodName ??
                      t('waterContainerEdit.selectFood', {
                        defaultValue: 'Select a food (optional)',
                      })}
                  </Text>
                </Pressable>
                {form.linkedFoodId ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('waterContainerEdit.unlinkFood', {
                      defaultValue: 'Unlink food',
                    })}
                    onPress={() => {
                      updateField('linkedFoodId', null);
                      updateField('linkedVariantId', null);
                      updateField('linkedFoodName', null);
                    }}
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                  >
                    <Icon name="close" size={20} color="#dc2626" />
                  </Pressable>
                ) : (
                  <Icon name="chevron-forward" size={20} color="#999" />
                )}
              </View>
            </View>

            {form.linkedFoodId ? (
              <>
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text-secondary mb-1.5">
                      {t('waterContainerEdit.quantity', {
                        defaultValue: 'Quantity',
                      })}
                    </Text>
                    <FormInput
                      value={form.linkedQuantity}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      onChangeText={(value) =>
                        updateField('linkedQuantity', value)
                      }
                    />
                  </View>
                  {variantOptions.length > 0 ? (
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-text-secondary mb-1.5">
                        {t('waterContainerEdit.unit', { defaultValue: 'Unit' })}
                      </Text>
                      <BottomSheetPicker
                        value={form.linkedVariantId ?? ''}
                        options={variantOptions}
                        onSelect={(value) => {
                          const picked = (variants ?? []).find(
                            (variant) => variant.id === value
                          );
                          setForm((current) => ({
                            ...current,
                            linkedVariantId: value,
                            // The amount is in the variant's unit, so switching
                            // variants must re-base it or the number silently
                            // changes meaning.
                            linkedQuantity: String(
                              Number(picked?.serving_size) || 1
                            ),
                          }));
                        }}
                        title={t('waterContainerEdit.unit', {
                          defaultValue: 'Unit',
                        })}
                      />
                    </View>
                  ) : null}
                </View>

                <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
                  {t('waterContainerEdit.linkedMealType', {
                    defaultValue: 'Meal type',
                  })}
                </Text>
                <BottomSheetPicker
                  value={form.linkedMealTypeId ?? ''}
                  options={mealTypeOptions}
                  onSelect={(value) =>
                    updateField('linkedMealTypeId', value === '' ? null : value)
                  }
                  title={t('waterContainerEdit.linkedMealType', {
                    defaultValue: 'Meal type',
                  })}
                />
              </>
            ) : null}
          </>
        ) : null}

        {isEditing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('waterContainerEdit.delete', {
              defaultValue: 'Delete container',
            })}
            onPress={confirmDelete}
            disabled={isDeleting}
            className="flex-row items-center justify-center mt-8 py-3"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Icon name="trash" size={18} color="#dc2626" />
            <Text className="text-icon-danger text-base font-semibold ml-2">
              {t('waterContainerEdit.delete', {
                defaultValue: 'Delete container',
              })}
            </Text>
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>

      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={() => void save()}
          busy={isSaving}
          disabled={isSaving || isDeleting}
        />
      ) : null}
    </View>
  );
};

export default WaterContainerEditScreen;
