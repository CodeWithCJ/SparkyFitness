import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ACTION_TAG_LABEL_MAX,
  createActionTagBodySchema,
  type TagAction,
  type TagMealChoice,
} from '@workspace/shared';
import { Alert, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import NfcWaitingCard from '../components/NfcWaitingCard';
import StatusView from '../components/StatusView';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import {
  useCreateActionTagMutation,
  useDeleteActionTagMutation,
  useActionTagsQuery,
  useUpdateActionTagMutation,
} from '../hooks/useActionTags';
import { useCancelNfcOnBlur } from '../hooks/useCancelNfcOnBlur';
import { useNfcSupport } from '../hooks/useNfcSupport';
import { useWaterContainersQuery } from '../hooks';
import { useFood } from '../hooks/useFoods';
import { useMeal } from '../hooks/useMeals';
import { useMealTypes } from '../hooks/useMealTypes';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { ApiError, getApiErrorMessage } from '../services/api/errors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  cancelNfcRequest,
  generateTagCode,
  writeTag,
} from '../services/nfc/nfcService';
import { tagActionTypeLabel, tagMealChoiceLabel } from '../services/tagActions';
import { useCSSVariable } from 'uniwind';
import { consumePendingActionTagSelection } from '../services/actionTagSelection';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import type { RootStackScreenProps } from '../types/navigation';
import { parseDecimalInput } from '../utils/numericInput';

type ActionTagFormScreenProps = RootStackScreenProps<'ActionTagForm'>;

const MAX_DRINKS = 20;
const AUTO_MEAL = 'auto';

/** The picker value for a meal choice: `auto` or the fixed meal type's id. */
function mealChoiceValue(choice: TagMealChoice | undefined): string {
  return choice?.mode === 'fixed' ? choice.meal_type_id : AUTO_MEAL;
}

function mealChoiceFromValue(value: string): TagMealChoice {
  return value === AUTO_MEAL
    ? { mode: 'auto' }
    : { mode: 'fixed', meal_type_id: value };
}

function isPositiveAmount(text: string): boolean {
  const amount = parseDecimalInput(text);
  return Number.isFinite(amount) && amount > 0;
}

/**
 * True when the server refused the action itself, not one of its fields: an
 * older server that only knows water tags answers that way for a food or meal
 * tag. Any other refusal, such as a name that is too long, shows its own text.
 */
function isUnknownActionTypeError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.statusCode !== 400) return false;
  try {
    const body = JSON.parse(error.body ?? '') as {
      details?: {
        action?: { _errors?: unknown[]; type?: { _errors?: unknown[] } };
      };
    };
    // Zod reports a discriminator it does not know under `action.type`.
    const action = body.details?.action;
    return (
      (action?._errors?.length ?? 0) > 0 ||
      (action?.type?._errors?.length ?? 0) > 0
    );
  } catch {
    return false;
  }
}

/**
 * What the form offers: water, or one food-or-meal choice. Food and meal stay
 * separate action types on the server, but people pick either from the same
 * search, as when logging.
 */
type FormKind = 'water' | 'item';

/** The food or saved meal a food-or-meal tag logs. */
type PickedItem =
  | { kind: 'food'; foodId: string; variantId: string; name: string | null }
  | { kind: 'meal'; mealId: string; name: string | null };

function pickedFromAction(
  action: TagAction | undefined,
  name: string | null
): PickedItem | null {
  switch (action?.type) {
    case 'food':
      return {
        kind: 'food',
        foodId: action.food_id,
        variantId: action.variant_id,
        name,
      };
    case 'meal':
      return { kind: 'meal', mealId: action.meal_template_id, name };
    default:
      return null;
  }
}

const ActionTagFormScreen: React.FC<ActionTagFormScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { tagId, tagCode, presetAction, presetLabel } = route.params ?? {};
  const isEditing = tagId !== undefined;
  // A link opened by a tap already carries its code, so nothing is written.
  const needsWrite = !isEditing && tagCode === undefined;

  const { supported, enabled } = useNfcSupport();
  const { tags, isLoading: isTagsLoading } = useActionTagsQuery({
    enabled: isEditing,
  });
  const existing = useMemo(
    () => tags.find((tag) => tag.id === tagId),
    [tags, tagId]
  );
  const { containers } = useWaterContainersQuery();
  const { mealTypes } = useMealTypes();

  // The code of a new sticker is minted once, so a failed save that is retried
  // writes the same code again instead of orphaning the first sticker.
  const [newCode] = useState(() => tagCode ?? generateTagCode());

  const presetWater = presetAction?.type === 'water' ? presetAction : null;
  const presetItem =
    presetAction?.type === 'food' || presetAction?.type === 'meal'
      ? presetAction
      : null;

  const [kind, setKind] = useState<FormKind>(presetItem ? 'item' : 'water');
  const [label, setLabel] = useState('');
  const [containerId, setContainerId] = useState<number | null>(
    presetWater?.container_id ?? null
  );
  const [drinks, setDrinks] = useState(String(presetWater?.drinks ?? 1));
  // A food-or-meal tag: what it logs and how much, in that item's own unit
  // (the food's serving unit, or servings or grams for a meal), as picked on
  // the same amount screen logging uses.
  const [picked, setPicked] = useState<PickedItem | null>(() =>
    pickedFromAction(presetItem ?? undefined, presetLabel ?? null)
  );
  const [amount, setAmount] = useState(
    presetItem ? String(presetItem.quantity) : ''
  );
  const [unit, setUnit] = useState(presetItem?.unit ?? '');
  const [mealChoice, setMealChoice] = useState(
    mealChoiceValue(presetItem?.meal)
  );
  const [askFirst, setAskFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  // True while the phone is waiting to touch a tag (Android shows no sheet).
  const [waitingForTag, setWaitingForTag] = useState(false);
  useCancelNfcOnBlur(waitingForTag);

  // Seed from the saved tag the first time it arrives (state adjusted during
  // render, as the container form does, so no blank frame is painted).
  const [seededId, setSeededId] = useState<string | null>(null);
  // A tag saved by a newer app with an action type this one does not know:
  // shown as such, never seeded as water and overwritten on save.
  const [unsupported, setUnsupported] = useState(false);
  if (existing && seededId !== existing.id) {
    setSeededId(existing.id);
    setLabel(existing.label);
    setAskFirst(existing.ask_before_running);
    const action = existing.action;
    switch (action.type) {
      case 'water':
        setKind('water');
        setContainerId(action.container_id);
        setDrinks(String(action.drinks));
        break;
      case 'food':
      case 'meal':
        setKind('item');
        // The food's or meal's own name is loaded below from its id.
        setPicked(pickedFromAction(action, null));
        setAmount(String(action.quantity));
        setUnit(action.unit);
        setMealChoice(mealChoiceValue(action.meal));
        break;
      default:
        setUnsupported(true);
    }
  }

  const { meal: pickedMeal } = useMeal(
    picked?.kind === 'meal' ? picked.mealId : undefined,
    { enabled: kind === 'item' && picked?.kind === 'meal' }
  );
  // A food tag stores the food's id, not its name, so an edited tag loads it.
  const { food: pickedFood } = useFood(
    picked?.kind === 'food' && picked.name === null ? picked.foodId : undefined,
    { enabled: kind === 'item' && picked?.kind === 'food' }
  );
  const pickedName =
    picked?.name ??
    (picked?.kind === 'meal' ? pickedMeal?.name : pickedFood?.name) ??
    null;

  // A fixed meal type that was hidden or deleted logs by time of day on the
  // server, so the form shows and saves that rather than a blank choice.
  const effectiveMealChoice =
    mealChoice === AUTO_MEAL ||
    mealTypes.length === 0 ||
    mealTypes.some((type) => type.id === mealChoice)
      ? mealChoice
      : AUTO_MEAL;
  const chevronColor = useCSSVariable('--color-icon-decorative') as string;

  // A food or meal picked through the food search and its amount screen.
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingActionTagSelection();
      if (!selection) return;
      setKind('item');
      setPicked(
        selection.kind === 'food'
          ? {
              kind: 'food',
              foodId: selection.foodId,
              variantId: selection.variantId,
              name: selection.name || null,
            }
          : {
              kind: 'meal',
              mealId: selection.mealId,
              name: selection.name || null,
            }
      );
      setAmount(String(selection.quantity));
      setUnit(selection.unit);
    }, [])
  );

  // A new tag takes its name from what it logs until the person types one.
  const [labelEdited, setLabelEdited] = useState(false);
  const chosenContainer = containers.find((item) => item.id === containerId);
  const targetName = kind === 'water' ? chosenContainer?.name : pickedName;
  // Cut to the server's limit: a meal named by a photo estimate can be a
  // whole sentence.
  const effectiveLabel =
    labelEdited || isEditing
      ? label
      : (targetName ?? label).slice(0, ACTION_TAG_LABEL_MAX);

  const { createActionTagAsync, isPending: isCreating } =
    useCreateActionTagMutation();
  const { updateActionTagAsync, isPending: isUpdating } =
    useUpdateActionTagMutation();
  const { deleteActionTagAsync, isPending: isDeleting } =
    useDeleteActionTagMutation();
  const isSaving = busy || isCreating || isUpdating;

  const showError = (title: string, subtitle?: string) =>
    Toast.show({ type: 'error', text1: title, text2: subtitle });

  const validate = () => {
    if (!effectiveLabel.trim()) {
      return t('actionTags.form.errors.labelRequired', {
        defaultValue: 'Give the tag a name',
      });
    }
    if (kind === 'water') {
      if (containerId === null) {
        return t('actionTags.form.errors.containerRequired', {
          defaultValue: 'Choose a water container',
        });
      }
      const count = parseDecimalInput(drinks);
      if (!Number.isInteger(count) || count < 1 || count > MAX_DRINKS) {
        return t('actionTags.form.errors.drinks', {
          defaultValue:
            'Drinks per tap must be a whole number from 1 to {{max}}',
          max: MAX_DRINKS,
        });
      }
      return null;
    }
    if (!picked || !unit) {
      return t('actionTags.form.errors.itemRequired', {
        defaultValue: 'Choose a food or meal',
      });
    }
    return isPositiveAmount(amount)
      ? null
      : t('actionTags.form.errors.amount', {
          defaultValue: 'Enter an amount greater than zero',
        });
  };

  /** The action the form describes; call only after `validate` passed. */
  const buildAction = (): TagAction | null => {
    if (kind === 'water') {
      return containerId === null
        ? null
        : {
            type: 'water',
            container_id: containerId,
            // The same parser the check above used, so "2,0" stays 2.
            drinks: parseDecimalInput(drinks),
          };
    }
    if (!picked) return null;
    const meal = mealChoiceFromValue(effectiveMealChoice);
    const quantity = parseDecimalInput(amount);
    return picked.kind === 'food'
      ? {
          type: 'food',
          food_id: picked.foodId,
          variant_id: picked.variantId,
          quantity,
          unit,
          meal,
        }
      : {
          type: 'meal',
          meal_template_id: picked.mealId,
          quantity,
          unit,
          meal,
        };
  };

  /** True once the sticker holds the link; asks before replacing other data. */
  const writeSticker = async (
    code: string,
    overwrite = false
  ): Promise<boolean> => {
    setWaitingForTag(true);
    const result = await writeTag(code, {
      alertMessage: t('actionTags.form.holdToWrite', {
        defaultValue: 'Hold your phone to the NFC tag',
      }),
      successMessage: t('actionTags.form.written', {
        defaultValue: 'Tag is ready',
      }),
      overwrite,
    }).finally(() => setWaitingForTag(false));
    switch (result.status) {
      case 'written':
        return true;
      case 'cancelled':
        return false;
      case 'has_data': {
        if (
          result.contents.kind === 'sparky' &&
          result.contents.code === code
        ) {
          return true;
        }
        const replace = await new Promise<boolean>((resolve) =>
          Alert.alert(
            t('actionTags.form.overwriteTitle', {
              defaultValue: 'This tag already has data',
            }),
            result.contents.kind === 'sparky'
              ? t('actionTags.form.overwriteSparky', {
                  defaultValue:
                    'It is already set up as another SparkyFitness tag. Replacing it stops that tag from working.',
                })
              : t('actionTags.form.overwriteOther', {
                  defaultValue:
                    'It holds something else, such as a link or a card. Replace it with this tag?',
                }),
            [
              {
                text: t('common.cancel', { defaultValue: 'Cancel' }),
                style: 'cancel',
                onPress: () => resolve(false),
              },
              {
                text: t('actionTags.form.replace', { defaultValue: 'Replace' }),
                style: 'destructive',
                onPress: () => resolve(true),
              },
            ],
            { cancelable: false }
          )
        );
        return replace ? writeSticker(code, true) : false;
      }
      case 'error':
        showError(
          t('actionTags.form.writeFailed', {
            defaultValue: 'Could not write to the tag',
          }),
          t('actionTags.form.writeFailedHint', {
            defaultValue:
              'Hold the phone steady against the tag. A locked or metal-backed tag cannot be written.',
          })
        );
        return false;
    }
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      showError(problem);
      return;
    }
    const action = buildAction();
    if (!action) return;
    setBusy(true);
    try {
      if (isEditing && tagId) {
        await updateActionTagAsync({
          id: tagId,
          body: {
            label: effectiveLabel.trim(),
            action,
            ask_before_running: askFirst,
          },
        });
      } else {
        const body = {
          tag_code: newCode,
          label: effectiveLabel.trim(),
          action,
          ask_before_running: askFirst,
        };
        // Check against the server's own rules before writing, so a sticker is
        // never written for a tag the server would then refuse.
        if (!createActionTagBodySchema.safeParse(body).success) {
          showError(
            t('actionTags.form.saveFailed', {
              defaultValue: 'Could not save the tag',
            }),
            t('actionTags.form.errors.invalid', {
              defaultValue:
                'Check the amount and the name, then try again. Nothing was written to the tag.',
            })
          );
          return;
        }
        if (needsWrite && !(await writeSticker(newCode))) return;
        await createActionTagAsync(body);
      }
      Toast.show({
        type: 'success',
        text1: t('actionTags.form.saved', { defaultValue: 'Tag saved' }),
      });
      navigation.goBack();
    } catch (error) {
      const serverTooOld =
        action.type !== 'water' && isUnknownActionTypeError(error);
      showError(
        t('actionTags.form.saveFailed', {
          defaultValue: 'Could not save the tag',
        }),
        serverTooOld
          ? t('actionTags.form.serverTooOld', {
              defaultValue:
                'Your server does not support food and meal tags yet. Update the server, then try again.',
            })
          : (getApiErrorMessage(error) ?? undefined)
      );
    } finally {
      setBusy(false);
    }
  };

  const writeAgain = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      if (await writeSticker(existing.tag_code)) {
        Toast.show({
          type: 'success',
          text1: t('actionTags.form.written', { defaultValue: 'Tag is ready' }),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      t('actionTags.form.deleteTitle', { defaultValue: 'Remove this tag?' }),
      t('actionTags.form.deleteMessage', {
        defaultValue:
          'The sticker keeps its link, but tapping it will no longer log anything.',
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
            if (!tagId) return;
            try {
              await deleteActionTagAsync(tagId);
              navigation.goBack();
            } catch {
              showError(
                t('actionTags.form.deleteFailed', {
                  defaultValue: 'Could not remove the tag',
                })
              );
            }
          },
        },
      ]
    );

  const header = useScreenHeader({
    title: isEditing
      ? t('actionTags.form.editTitle', { defaultValue: 'Edit NFC tag' })
      : t('actionTags.form.createTitle', { defaultValue: 'Set up NFC tag' }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving,
      onPress: () => void save(),
    },
  });

  const container = (children: React.ReactNode) => (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      {children}
    </View>
  );

  if (isEditing && isTagsLoading) {
    return container(
      <StatusView
        loading
        title={t('actionTags.form.loading', { defaultValue: 'Loading tag…' })}
      />
    );
  }

  if (unsupported) {
    return container(
      <StatusView
        icon="nfc"
        iconTone="muted"
        title={t('actionTags.action.unsupported', {
          defaultValue: 'Update the app to use this tag',
        })}
      />
    );
  }

  if (needsWrite && !supported) {
    return container(
      <StatusView
        icon="nfc"
        iconTone="muted"
        title={t('actionTags.unsupportedTitle', {
          defaultValue: 'This phone cannot use NFC tags',
        })}
        subtitle={t('actionTags.unsupportedSubtitle', {
          defaultValue: 'NFC tags need a phone with NFC.',
        })}
      />
    );
  }

  if (needsWrite && !enabled) {
    return container(
      <StatusView
        icon="nfc"
        iconTone="muted"
        title={t('actionTags.disabledTitle', {
          defaultValue: 'NFC is turned off',
        })}
        subtitle={t('actionTags.disabledSubtitle', {
          defaultValue: 'Turn on NFC in your phone settings, then come back.',
        })}
      />
    );
  }

  const containerOptions = containers.map((item) => ({
    label: item.name,
    value: String(item.id),
  }));

  return container(
    <>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 96,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm font-semibold text-text-secondary mb-1.5">
          {t('actionTags.form.action', { defaultValue: 'What should it do?' })}
        </Text>
        <BottomSheetPicker<FormKind>
          value={kind}
          options={[
            { label: tagActionTypeLabel(t, 'water'), value: 'water' },
            { label: tagActionTypeLabel(t, 'food'), value: 'item' },
          ]}
          onSelect={setKind}
          title={t('actionTags.form.action', {
            defaultValue: 'What should it do?',
          })}
        />

        {kind === 'water' ? (
          <>
            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
              {t('actionTags.form.container', { defaultValue: 'Container' })}
            </Text>
            <BottomSheetPicker
              value={containerId === null ? '' : String(containerId)}
              options={containerOptions}
              onSelect={(value) => setContainerId(Number(value))}
              title={t('actionTags.form.container', {
                defaultValue: 'Container',
              })}
              placeholder={t('actionTags.form.containerPlaceholder', {
                defaultValue: 'Choose a container',
              })}
            />

            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
              {t('actionTags.form.drinks', { defaultValue: 'Drinks per tap' })}
            </Text>
            <FormInput
              value={drinks}
              keyboardType="number-pad"
              placeholder="1"
              onChangeText={setDrinks}
            />
          </>
        ) : null}

        {kind === 'item' ? (
          <>
            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
              {t('actionTags.form.foodOrMeal', {
                defaultValue: 'Food or meal',
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('FoodSearch', { pickerMode: 'action-tag' })
              }
              // Leaving mid-save would make the save's goBack pop the search.
              disabled={isSaving}
              className="flex-row items-center justify-between bg-surface rounded-xl px-4 py-3 shadow-sm"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <View className="flex-1 flex-row items-center gap-1.5 mr-3">
                <Text
                  className="text-base text-text-primary flex-shrink"
                  numberOfLines={1}
                >
                  {pickedName ??
                    t('actionTags.form.foodOrMealPlaceholder', {
                      defaultValue: 'Choose a food or meal',
                    })}
                </Text>
                {picked?.kind === 'meal' ? (
                  <View className="px-1 py-0.5 rounded border border-border-subtle flex-shrink-0">
                    <Text className="text-text-muted text-xs">
                      {t('foodSearch.labels.meal', { defaultValue: 'Meal' })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Icon name="chevron-forward" size={20} color={chevronColor} />
            </Pressable>

            {picked && unit ? (
              <>
                <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
                  {unit === 'serving'
                    ? t('actionTags.form.servings', {
                        defaultValue: 'Servings per tap',
                      })
                    : t('actionTags.form.amountIn', {
                        defaultValue: 'Amount per tap ({{unit}})',
                        unit,
                      })}
                </Text>
                <FormInput
                  value={amount}
                  keyboardType="decimal-pad"
                  onChangeText={setAmount}
                />
              </>
            ) : null}
          </>
        ) : null}

        {kind === 'item' ? (
          <>
            <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
              {t('actionTags.form.mealType', { defaultValue: 'Log to' })}
            </Text>
            <BottomSheetPicker
              value={effectiveMealChoice}
              options={[
                {
                  label: tagMealChoiceLabel(t, { mode: 'auto' }, mealTypes),
                  value: AUTO_MEAL,
                },
                ...mealTypes.map((type) => ({
                  label: getMealTypeDisplayLabel(type, t),
                  value: type.id,
                })),
              ]}
              onSelect={setMealChoice}
              title={t('actionTags.form.mealType', { defaultValue: 'Log to' })}
            />
            <Text className="text-text-secondary text-sm mt-2">
              {t('actionTags.form.mealTypeHint', {
                defaultValue:
                  'By time of day uses each meal type’s usual time, as quick logging does.',
              })}
            </Text>
          </>
        ) : null}

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
          {t('actionTags.form.name', { defaultValue: 'Name' })}
        </Text>
        <FormInput
          value={effectiveLabel}
          placeholder={t('actionTags.form.namePlaceholder', {
            defaultValue: 'e.g. Desk bottle',
          })}
          maxLength={ACTION_TAG_LABEL_MAX}
          onChangeText={(value) => {
            setLabelEdited(true);
            setLabel(value);
          }}
        />

        <View className="flex-row justify-between items-center mt-6">
          <Text className="text-sm text-text-primary flex-shrink pr-3">
            {t('actionTags.form.askFirst', {
              defaultValue: 'Ask before logging',
            })}
          </Text>
          <Switch
            accessibilityLabel={t('actionTags.form.askFirst', {
              defaultValue: 'Ask before logging',
            })}
            value={askFirst}
            onValueChange={setAskFirst}
          />
        </View>
        <Text className="text-text-secondary text-sm mt-2">
          {t('actionTags.form.askFirstHint', {
            defaultValue:
              'Shows a Log or Cancel prompt on every tap instead of logging at once.',
          })}
        </Text>

        {needsWrite ? (
          <Text className="text-text-secondary text-sm mt-6">
            {t('actionTags.form.writeHint', {
              defaultValue:
                'When you save, hold your phone to the tag to write it. On metal, such as a steel bottle, use an on-metal tag.',
            })}
          </Text>
        ) : null}

        {isEditing && existing ? (
          <View className="mt-8">
            {supported ? (
              <Button
                variant="secondary"
                disabled={isSaving}
                onPress={() => void writeAgain()}
              >
                {t('actionTags.form.writeAgain', {
                  defaultValue: 'Write to a tag again',
                })}
              </Button>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isSaving || isDeleting}
              onPress={confirmDelete}
              className="py-4 items-center"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text className="text-base font-semibold text-red-600">
                {t('actionTags.form.delete', {
                  defaultValue: 'Remove this tag',
                })}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
      <NfcWaitingCard
        visible={waitingForTag}
        onCancel={() => void cancelNfcRequest()}
      />
      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={() => void save()}
          busy={isSaving}
          disabled={isSaving || isDeleting}
        />
      ) : null}
    </>
  );
};

export default ActionTagFormScreen;
