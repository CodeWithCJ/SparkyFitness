import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { useMedicationDetail, useCreateMedication, useUpdateMedication } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import Switch from '../components/ui/Switch';
import type { RootStackScreenProps } from '../types/navigation';
import { MEDICATION_TYPES } from '../types/medications';

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
};

const hasDetailsContent = (form: FormState): boolean =>
  Boolean(form.reason || form.prescriber || form.pharmacy || form.notes);

function baseFromMed(
  existingMed?: NonNullable<ReturnType<typeof useMedicationDetail>['data']>,
): FormState {
  if (!existingMed) return EMPTY_FORM;
  return {
    name: existingMed.name,
    typeId: existingMed.type_id ?? EMPTY_FORM.typeId,
    strengthValue: existingMed.strength_value != null ? String(existingMed.strength_value) : '',
    strengthUnit: existingMed.strength_unit ?? 'mg',
    doseAmount: existingMed.dose_amount != null ? String(existingMed.dose_amount) : '',
    doseUnit: existingMed.dose_unit ?? 'tablet',
    reason: existingMed.reason_text ?? '',
    prescriber: existingMed.prescriber ?? '',
    pharmacy: existingMed.pharmacy ?? '',
    notes: existingMed.notes ?? '',
    isActive: existingMed.is_active,
  };
}

const MedicationFormScreen: React.FC<MedicationFormScreenProps> = ({ route, navigation }) => {
  const { t } = useTranslation();
  const medicationId = route.params?.medicationId;
  const isEditing = !!medicationId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const { data: existingMed } = useMedicationDetail(medicationId ?? '', { enabled: isEditing });
  const createMedication = useCreateMedication();
  const updateMedication = useUpdateMedication();

  const [edits, setEdits] = useState<Partial<FormState>>({});

  const form: FormState = useMemo(
    () => ({ ...baseFromMed(existingMed), ...edits }),
    [existingMed, edits],
  );

  // null until the user toggles; until then follow the data, so a medication
  // with detail content opens expanded even when it arrives after mount.
  const [detailsToggle, setDetailsToggle] = useState<boolean | null>(null);
  const showDetails = detailsToggle ?? hasDetailsContent(form);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (createMedication.isPending || updateMedication.isPending) return;

    if (!form.name.trim()) {
       Alert.alert(t('medications.required'), t('medications.nameRequired'));
      return;
    }

    const strengthNum = form.strengthValue ? parseFloat(form.strengthValue) : null;
    const doseNum = form.doseAmount ? parseFloat(form.doseAmount) : null;

    if ((form.strengthValue && !Number.isFinite(strengthNum)) || (form.doseAmount && !Number.isFinite(doseNum))) {
       Alert.alert(t('medications.invalidNumber'), t('medications.invalidStrengthDose'));
      return;
    }

    const base = {
      name: form.name.trim(),
      type_id: form.typeId,
      strength_value: strengthNum,
      strength_unit: form.strengthUnit || null,
      dose_amount: doseNum,
      dose_unit: form.doseUnit || null,
      reason_text: form.reason.trim() || null,
      prescriber: form.prescriber.trim() || null,
      pharmacy: form.pharmacy.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (isEditing && medicationId) {
      updateMedication.mutate(
        { id: medicationId, body: { ...base, is_active: form.isActive } },
        {
          onSuccess: () => navigation.goBack(),
           onError: (error) => Alert.alert(t('common.error'), t('medications.updateFailed', { message: error.message })),
        },
      );
    } else {
      createMedication.mutate(
        { ...base, is_active: form.isActive },
        {
          onSuccess: (med) => {
            navigation.replace('MedicationDetail', { medicationId: med.id });
          },
           onError: (error) => Alert.alert(t('common.error'), t('medications.createFailed', { message: error.message })),
        },
      );
    }
  }, [form, isEditing, medicationId, createMedication, updateMedication, navigation, t]);

  const header = useScreenHeader({
    title: isEditing ? t('medications.edit') : t('medications.new'),
    nativeTitle: isEditing ? t('medications.edit') : t('medications.new'),
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      busy: createMedication.isPending || updateMedication.isPending,
      onPress: handleSave,
    },
  });

  const typeOptions = useMemo(() => MEDICATION_TYPES.map((t) => ({ label: t.label, value: t.id })), []);

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          rowGap: 24,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <View className="gap-4">
          <View className="gap-1.5">
             <Text className="text-text-secondary text-sm font-medium">{t('medications.nameRequiredLabel')}</Text>
              <FormInput
                placeholder={t('medications.namePlaceholder')}
                value={form.name}
              onChangeText={(v) => updateField('name', v)}
              autoCapitalize="words"
            />
          </View>

          <View className="gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.type')}</Text>
            <BottomSheetPicker
              value={form.typeId}
              options={typeOptions}
              onSelect={(val) => updateField('typeId', val)}
               title={t('medications.typePicker')}
            />
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.strength')}</Text>
              <FormInput
                placeholder="10"
                value={form.strengthValue}
                onChangeText={(v) => updateField('strengthValue', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1 gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.unit')}</Text>
              <FormInput
                 placeholder={t('medications.unit')}
                value={form.strengthUnit}
                onChangeText={(v) => updateField('strengthUnit', v)}
              />
            </View>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.dose')}</Text>
              <FormInput
                placeholder="1"
                value={form.doseAmount}
                onChangeText={(v) => updateField('doseAmount', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1 gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.unit')}</Text>
              <FormInput
                 placeholder={t('medications.type')}
                value={form.doseUnit}
                onChangeText={(v) => updateField('doseUnit', v)}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setDetailsToggle(!showDetails)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          className="flex-row items-center gap-1 py-2 self-start"
        >
          <Text className="text-text-primary font-medium" style={{ fontSize: 16 }}>
             {t('medications.details')}
          </Text>
          <Icon name={showDetails ? 'chevron-down' : 'chevron-forward'} size={12} color={textMuted} />
        </TouchableOpacity>

        {showDetails && (
          <View className="gap-4">
            <View className="gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.reason')}</Text>
              <FormInput
                 placeholder={t('medications.reason')}
                value={form.reason}
                onChangeText={(v) => updateField('reason', v)}
              />
            </View>

            <View className="gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.prescriber')}</Text>
              <FormInput
                 placeholder={t('medications.prescriber')}
                value={form.prescriber}
                onChangeText={(v) => updateField('prescriber', v)}
              />
            </View>

            <View className="gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.pharmacy')}</Text>
              <FormInput
                 placeholder={t('medications.pharmacy')}
                value={form.pharmacy}
                onChangeText={(v) => updateField('pharmacy', v)}
              />
            </View>

            <View className="gap-1.5">
               <Text className="text-text-secondary text-sm font-medium">{t('medications.notes')}</Text>
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
           <Text className="text-base text-text-primary">{t('medications.active')}</Text>
          <Switch
            value={form.isActive}
            onValueChange={(v) => updateField('isActive', v)}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default MedicationFormScreen;
