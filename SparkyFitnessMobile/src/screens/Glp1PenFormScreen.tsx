import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import OptionalDateField from '../components/glp1/OptionalDateField';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import {
  useCreatePen,
  useDeletePen,
  useMedicationPens,
  useUpdatePen,
} from '../hooks/useGlp1';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addDays } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';
import type { MedicationPen } from '@workspace/shared';

type Glp1PenFormScreenProps = RootStackScreenProps<'Glp1PenForm'>;

/** Days a vial stays usable once opened; matches web's beyond-use date. */
const BUD_DAYS = 28;

interface FormState {
  kind: 'pen' | 'vial';
  label: string;
  doseMg: string;
  concentration: string;
  volume: string;
  dosesTotal: string;
  openedAt: string;
  expiryDate: string;
  reorderFlag: boolean;
  reorderThreshold: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  kind: 'pen',
  label: '',
  doseMg: '',
  concentration: '',
  volume: '',
  dosesTotal: '4',
  openedAt: '',
  expiryDate: '',
  reorderFlag: false,
  reorderThreshold: '1',
  notes: '',
};

const fromPen = (pen: MedicationPen): FormState => ({
  kind: pen.kind,
  label: pen.label ?? '',
  doseMg: pen.dose_mg != null ? String(pen.dose_mg) : '',
  concentration:
    pen.concentration_mg_ml != null ? String(pen.concentration_mg_ml) : '',
  volume: pen.volume_ml != null ? String(pen.volume_ml) : '',
  dosesTotal: pen.doses_total != null ? String(pen.doses_total) : '',
  openedAt: pen.opened_at ?? '',
  expiryDate: pen.expiry_date ?? '',
  reorderFlag: pen.reorder_flag,
  reorderThreshold:
    pen.reorder_threshold != null ? String(pen.reorder_threshold) : '1',
  notes: pen.notes ?? '',
});

/** Empty string -> null; otherwise the number, or NaN when it is not numeric. */
const optionalNumber = (text: string): number | null =>
  text.trim() === '' ? null : Number(text);

const Glp1PenFormScreen: React.FC<Glp1PenFormScreenProps> = ({
  route,
  navigation,
}) => {
  const { t } = useTranslation();
  const { medicationId, penId } = route.params;
  const isEditing = !!penId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');

  const { data: pens } = useMedicationPens(medicationId);
  const existing = useMemo(
    () => pens?.find((p) => p.id === penId),
    [pens, penId]
  );
  const createPen = useCreatePen();
  const updatePen = useUpdatePen();
  const deletePen = useDeletePen();

  const [edits, setEdits] = useState<Partial<FormState>>({});
  const form: FormState = useMemo(
    () => ({
      ...(existing ? fromPen(existing) : EMPTY_FORM),
      ...edits,
    }),
    [existing, edits]
  );
  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setEdits((prev) => ({ ...prev, [key]: value })),
    []
  );

  const isSaving = createPen.isPending || updatePen.isPending;

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const doseMg = optionalNumber(form.doseMg);
    const dosesTotal = optionalNumber(form.dosesTotal);
    const concentration =
      form.kind === 'vial' ? optionalNumber(form.concentration) : null;
    const volume = form.kind === 'vial' ? optionalNumber(form.volume) : null;
    const threshold = form.reorderFlag
      ? optionalNumber(form.reorderThreshold)
      : null;
    const numbers = [doseMg, dosesTotal, concentration, volume, threshold];
    if (numbers.some((n) => n !== null && !Number.isFinite(n))) {
      Alert.alert(
        t('medications.form.invalidNumber', { defaultValue: 'Invalid number' }),
        t('medications.glp1.form.invalidNumbers', {
          defaultValue: 'Please enter valid numbers.',
        })
      );
      return;
    }
    const body = {
      kind: form.kind,
      label: form.label.trim() || null,
      dose_mg: doseMg,
      concentration_mg_ml: concentration,
      volume_ml: volume,
      doses_total: dosesTotal,
      opened_at: form.openedAt || null,
      expiry_date: form.expiryDate || null,
      bud_date: form.openedAt ? addDays(form.openedAt, BUD_DAYS) : null,
      reorder_flag: form.reorderFlag,
      reorder_threshold: threshold,
      notes: form.notes.trim() || null,
    };
    const onError = (error: Error) =>
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('medications.glp1.form.saveFailed', {
          defaultValue: 'Failed to save: {{error}}',
          error: error.message,
        })
      );
    if (penId) {
      updatePen.mutate(
        { id: penId, body },
        { onSuccess: () => navigation.goBack(), onError }
      );
    } else {
      createPen.mutate(
        { medicationId, body },
        { onSuccess: () => navigation.goBack(), onError }
      );
    }
  }, [
    form,
    isSaving,
    penId,
    medicationId,
    createPen,
    updatePen,
    navigation,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (!penId) return;
    Alert.alert(
      t('medications.glp1.form.deletePenTitle', {
        defaultValue: 'Delete pen or vial',
      }),
      t('medications.glp1.form.deletePenMessage', {
        defaultValue: 'Delete this pen or vial from your inventory?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deletePen.mutate(penId, {
              onSuccess: () => navigation.goBack(),
            }),
        },
      ]
    );
  }, [penId, deletePen, navigation, t]);

  const title = isEditing
    ? t('medications.glp1.form.editPen', { defaultValue: 'Edit pen or vial' })
    : t('medications.glp1.form.newPen', { defaultValue: 'New pen or vial' });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busy: isSaving,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      onPress: handleSave,
    },
  });

  const kindOptions = useMemo(
    () => [
      {
        label: t('medications.glp1.inventory.pen', { defaultValue: 'Pen' }),
        value: 'pen' as const,
      },
      {
        label: t('medications.glp1.inventory.vial', { defaultValue: 'Vial' }),
        value: 'vial' as const,
      },
    ],
    [t]
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
          rowGap: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.form.kind', { defaultValue: 'Type' })}
          </Text>
          <BottomSheetPicker
            value={form.kind}
            options={kindOptions}
            onSelect={(v) => setField('kind', v)}
            title={t('medications.glp1.form.kind', { defaultValue: 'Type' })}
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.form.label', { defaultValue: 'Label' })}
          </Text>
          <FormInput
            value={form.label}
            onChangeText={(v) => setField('label', v)}
          />
        </View>

        <View className="flex-row gap-4">
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.glp1.form.doseMg', {
                defaultValue: 'Dose per shot (mg)',
              })}
            </Text>
            <FormInput
              value={form.doseMg}
              onChangeText={(v) => setField('doseMg', v)}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.glp1.form.dosesTotal', {
                defaultValue: 'Doses in total',
              })}
            </Text>
            <FormInput
              value={form.dosesTotal}
              onChangeText={(v) => setField('dosesTotal', v)}
              keyboardType="number-pad"
            />
          </View>
        </View>

        {form.kind === 'vial' && (
          <View className="flex-row gap-4">
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('medications.glp1.form.concentration', {
                  defaultValue: 'mg per mL',
                })}
              </Text>
              <FormInput
                value={form.concentration}
                onChangeText={(v) => setField('concentration', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('medications.glp1.form.volume', {
                  defaultValue: 'Volume (mL)',
                })}
              </Text>
              <FormInput
                value={form.volume}
                onChangeText={(v) => setField('volume', v)}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        )}

        <OptionalDateField
          label={t('medications.glp1.form.openedAt', {
            defaultValue: 'Opened',
          })}
          value={form.openedAt}
          onChange={(v) => setField('openedAt', v)}
        />
        <OptionalDateField
          label={t('medications.glp1.form.expiry', { defaultValue: 'Expires' })}
          value={form.expiryDate}
          onChange={(v) => setField('expiryDate', v)}
        />

        <View className="flex-row justify-between items-center">
          <Text className="text-base text-text-primary">
            {t('medications.glp1.form.reorderFlag', {
              defaultValue: 'Remind me to reorder',
            })}
          </Text>
          <Switch
            value={form.reorderFlag}
            onValueChange={(v) => setField('reorderFlag', v)}
          />
        </View>
        {form.reorderFlag && (
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.glp1.form.reorderThreshold', {
                defaultValue: 'Reorder when doses left reach',
              })}
            </Text>
            <FormInput
              value={form.reorderThreshold}
              onChangeText={(v) => setField('reorderThreshold', v)}
              keyboardType="number-pad"
            />
          </View>
        )}

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.form.notes', { defaultValue: 'Notes' })}
          </Text>
          <FormInput
            value={form.notes}
            onChangeText={(v) => setField('notes', v)}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 72 }}
          />
        </View>

        {isEditing && (
          <Button variant="destructive" onPress={handleDelete}>
            {t('common.delete', { defaultValue: 'Delete' })}
          </Button>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
};

export default Glp1PenFormScreen;
