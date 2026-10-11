import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import {
  useMedicationDetail,
  useCreateMedication,
  useUpdateMedication,
  useUpdateMedicationSchedule,
} from '../hooks/useMedications';
import {
  useCustomNutrients,
  useEnsureCatalogNutrients,
} from '../hooks/useCustomNutrients';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSupplementLookup } from '../hooks/useSupplementLookup';
import { useSupplementLabelScan } from '../hooks/useSupplementLabelScan';
import { prepareLabelPhoto } from '../utils/labelPhoto';
import { useExternalProviders } from '../hooks/useExternalProviders';
import {
  SUPPLEMENT_LOOKUP_PROVIDER_TYPE,
  type SupplementLookupProduct,
} from '@workspace/shared';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import Switch from '../components/ui/Switch';
import type { RootStackScreenProps } from '../types/navigation';
import { medicationTypeLabel } from '../utils/medicationLocalization';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';
import { MEDICATION_TYPES } from '../types/medications';
import SupplementNutrientsEditor from '../components/medications/SupplementNutrientsEditor';
import {
  SUPPLEMENT_FORMS,
  buildNutrients,
  catalogIdsToProvision,
  parseAmount,
  rowsFromLookup,
  rowsFromNutrients,
  unmatchedSummary,
  type NutrientRow,
} from '../utils/supplements';

type MedicationFormScreenProps = RootStackScreenProps<'MedicationForm'>;

interface FormState {
  name: string;
  typeId: string;
  strengthValue: string;
  strengthUnit: string;
  doseAmount: string;
  doseUnit: string;
  reason: string;
  prescriber: string;
  pharmacy: string;
  notes: string;
  isActive: boolean;
  isSupplement: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  typeId: 'pill',
  strengthValue: '',
  strengthUnit: 'mg',
  doseAmount: '',
  doseUnit: 'tablet',
  reason: '',
  prescriber: '',
  pharmacy: '',
  notes: '',
  isActive: true,
  isSupplement: false,
};

const hasDetailsContent = (form: FormState): boolean =>
  Boolean(form.reason || form.prescriber || form.pharmacy || form.notes);

/** Order-independent check, so a stored payload can come back with keys shuffled. */
const sameNutrients = (
  left: { custom_nutrients?: Record<string, number> } | null | undefined,
  right: { custom_nutrients?: Record<string, number> } | null | undefined
): boolean => {
  const keyOf = (
    nutrients: { custom_nutrients?: Record<string, number> } | null | undefined
  ) => {
    const source = nutrients ?? {};
    const fixed = Object.entries(source)
      .filter(
        ([key, value]) =>
          key !== 'custom_nutrients' && typeof value === 'number'
      )
      .sort(([a], [b]) => a.localeCompare(b));
    const custom = Object.entries(source.custom_nutrients ?? {}).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    return JSON.stringify([fixed, custom]);
  };
  return keyOf(left) === keyOf(right);
};

function baseFromMed(
  existingMed?: NonNullable<ReturnType<typeof useMedicationDetail>['data']>,
  startAsSupplement = false
): FormState {
  if (!existingMed) {
    return startAsSupplement
      ? { ...EMPTY_FORM, isSupplement: true, typeId: 'capsule' }
      : EMPTY_FORM;
  }
  return {
    name: existingMed.name,
    typeId: existingMed.type_id ?? EMPTY_FORM.typeId,
    strengthValue:
      existingMed.strength_value != null
        ? String(existingMed.strength_value)
        : '',
    strengthUnit: existingMed.strength_unit ?? 'mg',
    doseAmount:
      existingMed.dose_amount != null ? String(existingMed.dose_amount) : '',
    doseUnit: existingMed.dose_unit ?? 'tablet',
    reason: existingMed.reason_text ?? '',
    prescriber: existingMed.prescriber ?? '',
    pharmacy: existingMed.pharmacy ?? '',
    notes: existingMed.notes ?? '',
    isActive: existingMed.is_active,
    isSupplement: existingMed.is_supplement ?? false,
  };
}

const MedicationFormScreen: React.FC<MedicationFormScreenProps> = ({
  route,
  navigation,
}) => {
  const { t } = useTranslation();
  const medicationId = route.params?.medicationId;
  const startAsSupplement = route.params?.isSupplement ?? false;
  const isEditing = !!medicationId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const { data: existingMed } = useMedicationDetail(medicationId ?? '', {
    enabled: isEditing,
  });
  const createMedication = useCreateMedication();
  const updateMedication = useUpdateMedication();
  const updateSchedule = useUpdateMedicationSchedule();
  const ensureCatalog = useEnsureCatalogNutrients();
  const supplementLookup = useSupplementLookup();
  const labelScan = useSupplementLabelScan();
  // The barcode lookup runs on external providers: it only shows while one is
  // active.
  const { providers: lookupProviders } = useExternalProviders({
    filterSet: SUPPLEMENT_LOOKUP_PROVIDER_TYPE_SET,
  });
  const canLookUpSupplements = lookupProviders.length > 0;
  const { customNutrients: customNutrientDefs } = useCustomNutrients();

  const [edits, setEdits] = useState<Partial<FormState>>({});

  const baseForm = useMemo(
    () => baseFromMed(existingMed, startAsSupplement),
    [existingMed, startAsSupplement]
  );
  // A lookup finishes after a render of its own, and a refetch may have
  // changed the saved medication since, so it reads the base from here.
  const latestBaseForm = useRef(baseForm);
  latestBaseForm.current = baseForm;
  const form: FormState = useMemo(
    () => ({ ...baseForm, ...edits }),
    [baseForm, edits]
  );

  // null until the user changes a nutrient row; until then follow the saved
  // supplement, so rows appear even when it arrives after mount.
  const [nutrientEdits, setNutrientEdits] = useState<NutrientRow[] | null>(
    null
  );
  const nutrientRows = useMemo(
    () =>
      nutrientEdits ??
      rowsFromNutrients(existingMed?.nutrients, customNutrientDefs),
    [nutrientEdits, existingMed, customNutrientDefs]
  );
  const isSupplement = form.isSupplement;
  // Whether the supplement switch is on right now, for a lookup that finishes
  // after it was turned off: a result must not leave a supplement-only type on
  // a medication.
  const isSupplementRef = useRef(isSupplement);
  isSupplementRef.current = isSupplement;
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  // Fills the form from a supplement found by barcode or read from a photo.
  const applyLookupProduct = (product: SupplementLookupProduct) => {
    setEdits((prev) => {
      const base = latestBaseForm.current;
      const notes = prev.notes ?? base.notes;
      return {
        ...prev,
        name: product.name || prev.name || base.name,
        typeId: product.form ?? prev.typeId ?? base.typeId,
        notes:
          notes.trim() === '' && product.serving
            ? t('medications.supplement.servingNote', {
                defaultValue: 'Label serving: {{serving}}',
                serving: product.serving,
              })
            : notes,
      };
    });
    // No mapped rows must not replace nutrients already on the form.
    const lookupRows = rowsFromLookup(product);
    if (lookupRows.length > 0) setNutrientEdits(lookupRows);
    const skipped = unmatchedSummary(product);
    const fromOff =
      product.source === 'off'
        ? t('medications.supplement.fromOpenFoodFacts', {
            defaultValue:
              'From Open Food Facts. Check the amounts against the label.',
          })
        : null;
    const notAdded = skipped
      ? t('medications.supplement.notAdded', {
          defaultValue: 'Not added from the label: {{names}}',
          names:
            skipped.extra > 0
              ? t('medications.supplement.notAddedMore', {
                  defaultValue: '{{names}} and {{count}} more',
                  names: skipped.names,
                  count: skipped.extra,
                })
              : skipped.names,
        })
      : null;
    setLookupNote([fromOff, notAdded].filter(Boolean).join(' ') || null);
  };

  // Photographing the Supplement Facts panel covers products the barcode
  // database does not have. The system crop editor doubles as the "frame the
  // label" step, which is what makes vision models read it reliably.
  const pickerLock = useRef(false);
  // True from the moment a photo is chosen until the scan request starts, so
  // the overlay covers the resize step too.
  const [preparingLabel, setPreparingLabel] = useState(false);
  const readLabelPhoto = async (source: 'camera' | 'library') => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync({
              ...options,
              allowsMultipleSelection: false,
            });
      if (result.canceled) return;
      setPreparingLabel(true);
      const asset = result.assets?.[0];
      const prepared = asset?.uri ? await prepareLabelPhoto(asset) : null;
      if (!prepared) {
        Alert.alert(
          t('common.error', { defaultValue: 'Error' }),
          t('medications.supplement.photoFailed', {
            defaultValue: 'Could not use that photo. Try another one.',
          })
        );
        return;
      }
      labelScan.mutate(prepared.base64, {
        onSuccess: ({ product, source: reader }) => {
          if (!isSupplementRef.current) return;
          if (
            !product ||
            (!product.fixed.length &&
              !product.catalog.length &&
              !product.unmatched.length &&
              !product.name)
          ) {
            setLookupNote(null);
            Alert.alert(
              t('medications.supplement.labelNoMatchTitle', {
                defaultValue: 'Nothing readable',
              }),
              t('medications.supplement.labelNoMatchMessage', {
                defaultValue:
                  'No supplement facts could be read from that photo. Crop closely to the Supplement Facts panel, or enter the label by hand.',
              })
            );
            return;
          }
          applyLookupProduct(product);
          Toast.show({
            type: 'info',
            text1:
              reader === 'device'
                ? t('medications.supplement.labelReadOnDevice', {
                    defaultValue: 'Label read on this iPhone',
                  })
                : t('medications.supplement.labelReadByServer', {
                    defaultValue: 'Label read by the server AI',
                  }),
          });
        },
        onError: () =>
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            t('medications.supplement.labelFailed', {
              defaultValue:
                'Could not read the label. Check that an AI provider is set up and try again.',
            })
          ),
      });
    } catch {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('medications.supplement.photoFailed', {
          defaultValue: 'Could not use that photo. Try another one.',
        })
      );
    } finally {
      setPreparingLabel(false);
      pickerLock.current = false;
    }
  };

  const chooseLabelSource = () =>
    Alert.alert(
      t('medications.supplement.scanLabel', {
        defaultValue: 'Scan label to fill in',
      }),
      t('medications.supplement.scanLabelHint', {
        defaultValue: 'Photograph the Supplement Facts panel.',
      }),
      [
        {
          text: t('medications.supplement.takePhoto', {
            defaultValue: 'Take photo',
          }),
          onPress: () => void readLabelPhoto('camera'),
        },
        {
          text: t('medications.supplement.choosePhoto', {
            defaultValue: 'Choose from library',
          }),
          onPress: () => void readLabelPhoto('library'),
        },
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
      ]
    );

  // A barcode scanned on the scanner screen arrives as a one-shot route param.
  const { pendingScannedBarcode, scannedBarcodeNonce } = route.params ?? {};
  useEffect(() => {
    if (scannedBarcodeNonce == null || pendingScannedBarcode == null) return;
    navigation.setParams({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
    supplementLookup.mutate(pendingScannedBarcode, {
      onSuccess: ({ product }) => {
        if (!isSupplementRef.current) return;
        if (!product) {
          setLookupNote(null);
          Alert.alert(
            t('medications.supplement.noMatchTitle', {
              defaultValue: 'No match found',
            }),
            t('medications.supplement.noMatchMessage', {
              defaultValue:
                'No supplement was found for that barcode. You can enter the label by hand.',
            })
          );
          return;
        }
        applyLookupProduct(product);
      },
      onError: () =>
        Alert.alert(
          t('common.error', { defaultValue: 'Error' }),
          t('medications.supplement.lookupFailed', {
            defaultValue:
              'Could not reach the supplement label database. Try again later.',
          })
        ),
    });
    // The lookup runs once per scan; the nonce is what makes a scan new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedBarcodeNonce, pendingScannedBarcode]);

  // null until the user toggles; until then follow the data, so a medication
  // with detail content opens expanded even when it arrives after mount.
  const [detailsToggle, setDetailsToggle] = useState<boolean | null>(null);
  const showDetails = detailsToggle ?? hasDetailsContent(form);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setEdits((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSupplementToggle = useCallback(
    (value: boolean) => {
      setEdits((prev) => {
        const typeId = prev.typeId ?? form.typeId;
        const isSupplementForm = (
          SUPPLEMENT_FORMS as readonly string[]
        ).includes(typeId);
        const nextType = value
          ? isSupplementForm
            ? typeId
            : 'capsule'
          : (MEDICATION_TYPES as readonly string[]).includes(typeId)
            ? typeId
            : 'pill';
        return { ...prev, isSupplement: value, typeId: nextType };
      });
    },
    [form.typeId]
  );

  const savingRef = useRef(false);
  const handleSave = useCallback(async () => {
    if (
      savingRef.current ||
      createMedication.isPending ||
      updateMedication.isPending ||
      updateSchedule.isPending ||
      ensureCatalog.isPending
    ) {
      return;
    }
    // Set before any await. A schedule reset can outlast the header's
    // duplicate-press window, and isPending is still false until it starts.
    savingRef.current = true;
    try {
      if (!form.name.trim()) {
        Alert.alert(
          t('medications.form.required', { defaultValue: 'Required' }),
          isSupplement
            ? t('medications.supplement.nameRequired', {
                defaultValue: 'Please enter a supplement name.',
              })
            : t('medications.form.nameRequired', {
                defaultValue: 'Please enter a medication name.',
              })
        );
        return;
      }

      const strengthNum = form.strengthValue
        ? parseFloat(form.strengthValue)
        : null;
      const doseNum = form.doseAmount ? parseFloat(form.doseAmount) : null;

      if (
        !isSupplement &&
        ((form.strengthValue && !Number.isFinite(strengthNum)) ||
          (form.doseAmount && !Number.isFinite(doseNum)))
      ) {
        Alert.alert(
          t('medications.form.invalidNumber', {
            defaultValue: 'Invalid number',
          }),
          t('medications.form.invalidNumberMessage', {
            defaultValue:
              'Please enter valid numeric values for strength and dose.',
          })
        );
        return;
      }

      if (
        isSupplement &&
        nutrientRows.some(
          (row) => row.value.trim() !== '' && parseAmount(row.value) == null
        )
      ) {
        Alert.alert(
          t('medications.form.invalidNumber', {
            defaultValue: 'Invalid number',
          }),
          t('medications.supplement.invalidAmount', {
            defaultValue:
              'Nutrient amounts must be numbers that are zero or more.',
          })
        );
        return;
      }

      // Nutrients picked from the catalog need a custom nutrient to store the
      // amount against. Created now, not when picked, so cancelling leaves none.
      const resolvedNames: Record<string, string> = {};
      if (isSupplement) {
        const catalogIds = catalogIdsToProvision(nutrientRows);
        if (catalogIds.length > 0) {
          try {
            const { resolved } = await ensureCatalog.mutateAsync(catalogIds);
            for (const entry of resolved) {
              if (!entry.fixedField)
                resolvedNames[entry.catalogId] = entry.name;
            }
          } catch (error) {
            Alert.alert(
              t('common.error', { defaultValue: 'Error' }),
              t('medications.supplement.nutrientsFailed', {
                defaultValue: 'Failed to set up the nutrients: {{error}}',
                error: error instanceof Error ? error.message : String(error),
              })
            );
            return;
          }
        }
      }

      const base = {
        name: form.name.trim(),
        type_id: form.typeId,
        is_supplement: isSupplement,
        nutrients: isSupplement
          ? buildNutrients(nutrientRows, resolvedNames)
          : {},
        // A supplement is taken in servings: the label's nutrition is per
        // serving, and a dose logged is the number of servings. Converting a
        // medication resets to one serving; an existing supplement keeps its dose.
        strength_value: isSupplement ? null : strengthNum,
        strength_unit: isSupplement ? null : form.strengthUnit || null,
        dose_amount: isSupplement
          ? existingMed?.is_supplement
            ? (existingMed.dose_amount ?? 1)
            : 1
          : doseNum,
        dose_unit: isSupplement
          ? existingMed?.is_supplement
            ? (existingMed.dose_unit ?? 'serving')
            : 'serving'
          : form.doseUnit || null,
        reason_text: form.reason.trim() || null,
        prescriber: isSupplement ? null : form.prescriber.trim() || null,
        pharmacy: isSupplement ? null : form.pharmacy.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (isEditing && medicationId) {
        // Cleared schedule doses, put back if the conversion does not finish.
        // A later log would otherwise use the medication dose, not the override.
        let restoreOverrides: (() => Promise<string[]>) | undefined;
        const doseRestoreWarning = (failed: string[]): string | null =>
          failed.length === 0
            ? null
            : t('medications.supplement.scheduleRestoreFailed', {
                defaultValue:
                  'The dose for {{schedules}} could not be restored. Set it again on the schedule.',
                schedules: failed.join(', '),
              });

        // A schedule's own dose wins over the medication's, and a supplement's
        // dose counts servings. Turning a medication into a supplement therefore
        // drops those overrides, or "2 tablets" would count two servings of the
        // nutrients on every dose. A supplement keeps the ones it has.
        if (isSupplement && existingMed && !existingMed.is_supplement) {
          const overridden = (existingMed.schedules ?? []).filter(
            (schedule) => schedule.dose_amount != null
          );
          restoreOverrides = async () => {
            const results = await Promise.allSettled(
              overridden.map((schedule) =>
                updateSchedule.mutateAsync({
                  id: schedule.id,
                  medicationId,
                  body: { dose_amount: schedule.dose_amount },
                })
              )
            );
            return results.flatMap((result, index) => {
              if (result.status !== 'rejected') return [];
              const time = overridden[index]?.time_of_day;
              return [
                time
                  ? formatLocalizedTimeOfDay(time)
                  : t('medications.supplement.unnamedSchedule', {
                      defaultValue: 'a schedule',
                    }),
              ];
            });
          };
          try {
            const resetResults = await Promise.allSettled(
              overridden.map((schedule) =>
                updateSchedule.mutateAsync({
                  id: schedule.id,
                  medicationId,
                  body: { dose_amount: null },
                })
              )
            );
            const resetFailure = resetResults.find(
              (result) => result.status === 'rejected'
            );
            if (resetFailure?.status === 'rejected') {
              throw resetFailure.reason;
            }
          } catch (error) {
            const failed = await restoreOverrides();
            const warning = doseRestoreWarning(failed);
            const message = t('medications.supplement.scheduleResetFailed', {
              defaultValue: 'Failed to reset the schedule doses: {{error}}',
              error: error instanceof Error ? error.message : String(error),
            });
            Alert.alert(
              t('common.error', { defaultValue: 'Error' }),
              warning ? `${message}\n\n${warning}` : message
            );
            return;
          }
        }
        let updated;
        try {
          updated = await updateMedication.mutateAsync({
            id: medicationId,
            body: { ...base, is_active: form.isActive },
          });
        } catch (error) {
          const report = (warning: string | null) => {
            const message = t('medications.form.updateFailed', {
              defaultValue: 'Failed to update medication: {{error}}',
              error: error instanceof Error ? error.message : String(error),
            });
            Alert.alert(
              t('common.error', { defaultValue: 'Error' }),
              warning ? `${message}\n\n${warning}` : message
            );
          };
          if (!restoreOverrides) {
            report(null);
            return;
          }
          report(doseRestoreWarning(await restoreOverrides()));
          return;
        }
        // Without diary access the server drops the mode change and
        // keeps the stored supplement flag. Closing would hide that.
        // The schedule overrides were already cleared, so put them back.
        if (updated.is_supplement !== isSupplement) {
          const failed = restoreOverrides ? await restoreOverrides() : [];
          const warning = doseRestoreWarning(failed);
          const message = t('medications.supplement.modeUpdateNotApplied', {
            defaultValue: 'The requested supplement mode was not applied.',
          });
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            warning ? `${message}\n\n${warning}` : message
          );
          return;
        }
        // The same access strips nutrient edits and returns the old payload.
        if (isSupplement && !sameNutrients(updated.nutrients, base.nutrients)) {
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            t('medications.supplement.nutrientsNotUpdated', {
              defaultValue: 'The nutrient changes were not saved.',
            })
          );
          return;
        }
        navigation.goBack();
      } else {
        let med;
        try {
          med = await createMedication.mutateAsync({
            ...base,
            is_active: form.isActive,
          });
        } catch (error) {
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            t('medications.form.createFailed', {
              defaultValue: 'Failed to create medication: {{error}}',
              error: error instanceof Error ? error.message : String(error),
            })
          );
          return;
        }
        // Create keeps the supplement flag but can drop the nutrient
        // payload when this account cannot write diary data.
        if (
          isSupplement &&
          Object.keys(base.nutrients).length > 0 &&
          Object.keys(med.nutrients ?? {}).length === 0
        ) {
          // The row exists. Staying here would let Save create another one.
          Alert.alert(
            t('common.error', { defaultValue: 'Error' }),
            t('medications.supplement.nutrientsNotSaved', {
              defaultValue:
                'The supplement was created, but its nutrient values were not saved because this account has no diary access.',
            })
          );
        }
        navigation.replace('MedicationDetail', { medicationId: med.id });
      }
    } finally {
      savingRef.current = false;
    }
  }, [
    form,
    isEditing,
    isSupplement,
    medicationId,
    existingMed,
    nutrientRows,
    createMedication,
    updateMedication,
    updateSchedule,
    ensureCatalog,
    navigation,
    t,
  ]);

  const screenTitle = isSupplement
    ? isEditing
      ? t('medications.supplement.editTitle', {
          defaultValue: 'Edit Supplement',
        })
      : t('medications.supplement.newTitle', { defaultValue: 'New Supplement' })
    : isEditing
      ? t('medications.form.editTitle', { defaultValue: 'Edit Medication' })
      : t('medications.form.newTitle', { defaultValue: 'New Medication' });

  const header = useScreenHeader({
    title: screenTitle,
    nativeTitle: screenTitle,
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busy:
        createMedication.isPending ||
        updateMedication.isPending ||
        updateSchedule.isPending ||
        ensureCatalog.isPending,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      onPress: () => void handleSave(),
    },
  });

  const typeOptions = useMemo(
    () =>
      (isSupplement ? SUPPLEMENT_FORMS : MEDICATION_TYPES).map((id) => ({
        label: medicationTypeLabel(id, t),
        value: id as string,
      })),
    [isSupplement, t]
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          rowGap: 24,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <View className="gap-4">
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.form.name', { defaultValue: 'Name *' })}
            </Text>
            <FormInput
              placeholder={t('medications.form.namePlaceholder', {
                defaultValue: 'Ipsumol',
              })}
              value={form.name}
              onChangeText={(v) => updateField('name', v)}
              autoCapitalize="words"
            />
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-base text-text-primary flex-1 pr-3">
              {t('medications.supplement.toggle', {
                defaultValue: 'This is a supplement',
              })}
            </Text>
            <Switch
              value={isSupplement}
              onValueChange={handleSupplementToggle}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {isSupplement
                ? t('medications.supplement.form', { defaultValue: 'Form' })
                : t('medications.form.type', { defaultValue: 'Type' })}
            </Text>
            <BottomSheetPicker
              value={form.typeId}
              options={typeOptions}
              onSelect={(val) => updateField('typeId', val)}
              title={
                isSupplement
                  ? t('medications.supplement.formTitle', {
                      defaultValue: 'Supplement Form',
                    })
                  : t('medications.form.typeTitle', {
                      defaultValue: 'Medication Type',
                    })
              }
            />
          </View>

          {!isSupplement && (
            <>
              <View className="flex-row gap-4">
                <View className="flex-1 gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.strength', {
                      defaultValue: 'Strength',
                    })}
                  </Text>
                  <FormInput
                    placeholder="10"
                    value={form.strengthValue}
                    onChangeText={(v) => updateField('strengthValue', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.unit', { defaultValue: 'Unit' })}
                  </Text>
                  <FormInput
                    placeholder={t('medications.form.strengthUnitPlaceholder', {
                      defaultValue: 'mg',
                    })}
                    value={form.strengthUnit}
                    onChangeText={(v) => updateField('strengthUnit', v)}
                  />
                </View>
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1 gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.dose', { defaultValue: 'Dose' })}
                  </Text>
                  <FormInput
                    placeholder="1"
                    value={form.doseAmount}
                    onChangeText={(v) => updateField('doseAmount', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.unit', { defaultValue: 'Unit' })}
                  </Text>
                  <FormInput
                    placeholder={t('medications.form.doseUnitPlaceholder', {
                      defaultValue: 'tablet',
                    })}
                    value={form.doseUnit}
                    onChangeText={(v) => updateField('doseUnit', v)}
                  />
                </View>
              </View>
            </>
          )}

          {isSupplement && canLookUpSupplements && (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('FoodScan', {
                  mode: 'capture-barcode',
                  returnKey: route.key,
                })
              }
              disabled={supplementLookup.isPending}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="flex-row items-center gap-2 py-1 self-start"
            >
              <Icon name="scan" size={18} color={textMuted} />
              <Text className="text-accent-primary text-base font-medium">
                {supplementLookup.isPending
                  ? t('medications.supplement.lookingUp', {
                      defaultValue: 'Looking up the label…',
                    })
                  : t('medications.supplement.scan', {
                      defaultValue: 'Scan barcode to fill in',
                    })}
              </Text>
            </TouchableOpacity>
          )}

          {isSupplement && (
            <TouchableOpacity
              onPress={chooseLabelSource}
              disabled={labelScan.isPending || supplementLookup.isPending}
              activeOpacity={0.7}
              accessibilityRole="button"
              className="flex-row items-center gap-2 py-1 self-start"
            >
              <Icon name="camera" size={18} color={textMuted} />
              <Text className="text-accent-primary text-base font-medium">
                {labelScan.isPending
                  ? t('medications.supplement.readingLabel', {
                      defaultValue: 'Reading the label…',
                    })
                  : t('medications.supplement.scanLabel', {
                      defaultValue: 'Scan label to fill in',
                    })}
              </Text>
            </TouchableOpacity>
          )}

          {isSupplement && lookupNote != null && (
            <Text className="text-text-muted text-sm">{lookupNote}</Text>
          )}

          {isSupplement && (
            <SupplementNutrientsEditor
              rows={nutrientRows}
              onChange={setNutrientEdits}
            />
          )}
        </View>

        <TouchableOpacity
          onPress={() => setDetailsToggle(!showDetails)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          className="flex-row items-center gap-1 py-2 self-start"
        >
          <Text
            className="text-text-primary font-medium"
            style={{ fontSize: 16 }}
          >
            {t('medications.form.details', { defaultValue: 'Details' })}
          </Text>
          <Icon
            name={showDetails ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={textMuted}
          />
        </TouchableOpacity>

        {showDetails && (
          <View className="gap-4">
            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('medications.form.reason', { defaultValue: 'Reason' })}
              </Text>
              <FormInput
                placeholder={t('medications.form.reasonPlaceholder', {
                  defaultValue: 'Blood pressure',
                })}
                value={form.reason}
                onChangeText={(v) => updateField('reason', v)}
              />
            </View>

            {!isSupplement && (
              <>
                <View className="gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.prescriber', {
                      defaultValue: 'Prescriber',
                    })}
                  </Text>
                  <FormInput
                    placeholder={t('medications.form.prescriberPlaceholder', {
                      defaultValue: 'Dr. Ipsum',
                    })}
                    value={form.prescriber}
                    onChangeText={(v) => updateField('prescriber', v)}
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('medications.form.pharmacy', {
                      defaultValue: 'Pharmacy',
                    })}
                  </Text>
                  <FormInput
                    placeholder={t('medications.form.pharmacyPlaceholder', {
                      defaultValue: 'Sunny Pharmacy',
                    })}
                    value={form.pharmacy}
                    onChangeText={(v) => updateField('pharmacy', v)}
                  />
                </View>
              </>
            )}

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('medications.form.notes', { defaultValue: 'Notes' })}
              </Text>
              <FormInput
                value={form.notes}
                onChangeText={(v) => updateField('notes', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ minHeight: 72 }}
              />
            </View>
          </View>
        )}

        <View className="flex-row justify-between items-center">
          <Text className="text-base text-text-primary">
            {t('medications.form.active', { defaultValue: 'Active' })}
          </Text>
          <Switch
            value={form.isActive}
            onValueChange={(v) => updateField('isActive', v)}
          />
        </View>
      </KeyboardAwareScrollView>
      {(preparingLabel ||
        labelScan.isPending ||
        supplementLookup.isPending) && (
        <View
          className="absolute inset-0 items-center justify-center gap-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="large" color="#fff" />
          <Text className="text-white text-base font-medium">
            {supplementLookup.isPending
              ? t('medications.supplement.lookingUp', {
                  defaultValue: 'Looking up the label…',
                })
              : t('medications.supplement.readingLabel', {
                  defaultValue: 'Reading the label…',
                })}
          </Text>
        </View>
      )}
    </View>
  );
};

// Either barcode source is enough to offer the scan: the NIH label database or
// Open Food Facts.
const SUPPLEMENT_LOOKUP_PROVIDER_TYPE_SET = new Set([
  SUPPLEMENT_LOOKUP_PROVIDER_TYPE,
  'openfoodfacts',
]);

export default MedicationFormScreen;
