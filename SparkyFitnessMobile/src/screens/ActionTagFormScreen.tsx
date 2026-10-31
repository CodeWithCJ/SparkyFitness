import React, { useMemo, useState } from 'react';
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
import {
  useCreateActionTagMutation,
  useDeleteActionTagMutation,
  useActionTagsQuery,
  useUpdateActionTagMutation,
} from '../hooks/useActionTags';
import { useCancelNfcOnUnmount } from '../hooks/useCancelNfcOnUnmount';
import { useNfcSupport } from '../hooks/useNfcSupport';
import { useWaterContainersQuery } from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { getApiErrorMessage } from '../services/api/errors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  cancelNfcRequest,
  generateTagCode,
  writeTag,
} from '../services/nfc/nfcService';
import { tagActionTypeLabel } from '../services/tagActions';
import type { RootStackScreenProps } from '../types/navigation';
import { parseDecimalInput } from '../utils/numericInput';

type ActionTagFormScreenProps = RootStackScreenProps<'ActionTagForm'>;

const MAX_DRINKS = 20;

const ActionTagFormScreen: React.FC<ActionTagFormScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { tagId, tagCode, presetAction } = route.params ?? {};
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

  // The code of a new sticker is minted once, so a failed save that is retried
  // writes the same code again instead of orphaning the first sticker.
  const [newCode] = useState(() => tagCode ?? generateTagCode());

  const [label, setLabel] = useState('');
  const [containerId, setContainerId] = useState<number | null>(
    presetAction?.container_id ?? null
  );
  const [drinks, setDrinks] = useState(String(presetAction?.drinks ?? 1));
  const [askFirst, setAskFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  // True while the phone is waiting to touch a tag (Android shows no sheet).
  const [waitingForTag, setWaitingForTag] = useState(false);
  useCancelNfcOnUnmount(waitingForTag);

  // Seed from the saved tag the first time it arrives (state adjusted during
  // render, as the container form does, so no blank frame is painted).
  const [seededId, setSeededId] = useState<string | null>(null);
  if (existing && seededId !== existing.id) {
    setSeededId(existing.id);
    setLabel(existing.label);
    setContainerId(existing.action.container_id);
    setDrinks(String(existing.action.drinks));
    setAskFirst(existing.ask_before_running);
  }

  // A new tag takes its name from the chosen container until the person types one.
  const [labelEdited, setLabelEdited] = useState(false);
  const chosenContainer = containers.find((item) => item.id === containerId);
  const effectiveLabel =
    labelEdited || isEditing ? label : (chosenContainer?.name ?? label);

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
    if (containerId === null) {
      return t('actionTags.form.errors.containerRequired', {
        defaultValue: 'Choose a water container',
      });
    }
    const count = parseDecimalInput(drinks);
    if (!Number.isInteger(count) || count < 1 || count > MAX_DRINKS) {
      return t('actionTags.form.errors.drinks', {
        defaultValue: 'Drinks per tap must be a whole number from 1 to {{max}}',
        max: MAX_DRINKS,
      });
    }
    return null;
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
    if (containerId === null) return;
    const action = {
      type: 'water' as const,
      container_id: containerId,
      drinks: Number(drinks),
    };
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
        if (needsWrite && !(await writeSticker(newCode))) return;
        await createActionTagAsync({
          tag_code: newCode,
          label: effectiveLabel.trim(),
          action,
          ask_before_running: askFirst,
        });
      }
      Toast.show({
        type: 'success',
        text1: t('actionTags.form.saved', { defaultValue: 'Tag saved' }),
      });
      navigation.goBack();
    } catch (error) {
      showError(
        t('actionTags.form.saveFailed', {
          defaultValue: 'Could not save the tag',
        }),
        getApiErrorMessage(error) ?? undefined
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
        <BottomSheetPicker
          value="water"
          options={[{ label: tagActionTypeLabel(t, 'water'), value: 'water' }]}
          onSelect={() => undefined}
          title={t('actionTags.form.action', {
            defaultValue: 'What should it do?',
          })}
        />

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
          {t('actionTags.form.container', { defaultValue: 'Container' })}
        </Text>
        <BottomSheetPicker
          value={containerId === null ? '' : String(containerId)}
          options={containerOptions}
          onSelect={(value) => setContainerId(Number(value))}
          title={t('actionTags.form.container', { defaultValue: 'Container' })}
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

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-5">
          {t('actionTags.form.name', { defaultValue: 'Name' })}
        </Text>
        <FormInput
          value={effectiveLabel}
          placeholder={t('actionTags.form.namePlaceholder', {
            defaultValue: 'e.g. Desk bottle',
          })}
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
