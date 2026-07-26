import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { useMedicationDetail, useCreateMedication, useUpdateMedication } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import FormInput from '../components/FormInput';
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

function baseFromMed(
  existingMed?: NonNullable<ReturnType<typeof useMedicationDetail>['data']>,
): FormState {
  if (!existingMed) return EMPTY_FORM;
  return {
    name: existingMed.name,
    typeId: existingMed.type_id,
    strengthValue: existingMed.strength_value != null ? String(existingMed.strength_value) : '',
    strengthUnit: existingMed.strength_unit ?? 'mg',
    doseAmount: existingMed.dose_amount != null ? String(existingMed.dose_amount) : '',
    doseUnit: existingMed.dose_unit ?? 'tablet',
    reason: existingMed.reason ?? '',
    prescriber: existingMed.prescriber ?? '',
    pharmacy: existingMed.pharmacy ?? '',
    notes: existingMed.notes ?? '',
    isActive: existingMed.is_active,
  };
}

const MedicationFormScreen: React.FC<MedicationFormScreenProps> = ({ route, navigation }) => {
  const medicationId = route.params?.medicationId;
  const isEditing = !!medicationId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

  const { data: existingMed } = useMedicationDetail(medicationId ?? '', { enabled: isEditing });
  const createMedication = useCreateMedication();
  const updateMedication = useUpdateMedication();

  const [edits, setEdits] = useState<Partial<FormState>>({});

  const form: FormState = useMemo(
    () => ({ ...baseFromMed(existingMed), ...edits }),
    [existingMed, edits],
  );

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (createMedication.isPending || updateMedication.isPending) return;

    if (!form.name.trim()) {
      Alert.alert('Required', 'Please enter a medication name.');
      return;
    }

    const strengthNum = form.strengthValue ? parseFloat(form.strengthValue) : null;
    const doseNum = form.doseAmount ? parseFloat(form.doseAmount) : null;

    if ((form.strengthValue && !Number.isFinite(strengthNum)) || (form.doseAmount && !Number.isFinite(doseNum))) {
      Alert.alert('Invalid number', 'Please enter valid numeric values for strength and dose.');
      return;
    }

    const base = {
      name: form.name.trim(),
      type_id: form.typeId,
      strength_value: strengthNum,
      strength_unit: form.strengthUnit || null,
      dose_amount: doseNum,
      dose_unit: form.doseUnit || null,
      reason: form.reason || undefined,
      prescriber: form.prescriber || undefined,
      pharmacy: form.pharmacy || undefined,
      notes: form.notes || undefined,
    };

    if (isEditing && medicationId) {
      updateMedication.mutate(
        { id: medicationId, body: { ...base, is_active: form.isActive } },
        {
          onSuccess: () => navigation.goBack(),
          onError: (error) => Alert.alert('Error', `Failed to update medication: ${error.message}`),
        },
      );
    } else {
      createMedication.mutate(
        { ...base, is_active: form.isActive },
        {
          onSuccess: (med) => {
            navigation.replace('MedicationDetail', { medicationId: med.id });
          },
          onError: (error) => Alert.alert('Error', `Failed to create medication: ${error.message}`),
        },
      );
    }
  }, [form, isEditing, medicationId, createMedication, updateMedication, navigation]);

  const header = useScreenHeader({
    title: isEditing ? 'Edit Medication' : 'New Medication',
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: 'Save',
      busy: createMedication.isPending || updateMedication.isPending,
      busyLabel: 'Saving…',
      onPress: handleSave,
    },
  });

  const typeOptions = useMemo(() => MEDICATION_TYPES.map((t) => ({ label: t.label, value: t.id })), []);

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm gap-4">
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Name *</Text>
            <FormInput
              placeholder="Lisinopril"
              value={form.name}
              onChangeText={(v) => updateField('name', v)}
              autoCapitalize="words"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Type</Text>
            <BottomSheetPicker
              value={form.typeId}
              options={typeOptions}
              onSelect={(val) => updateField('typeId', val)}
              title="Medication Type"
            />
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Strength</Text>
              <FormInput
                placeholder="10"
                value={form.strengthValue}
                onChangeText={(v) => updateField('strengthValue', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Unit</Text>
              <FormInput
                placeholder="mg"
                value={form.strengthUnit}
                onChangeText={(v) => updateField('strengthUnit', v)}
              />
            </View>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Dose</Text>
              <FormInput
                placeholder="1"
                value={form.doseAmount}
                onChangeText={(v) => updateField('doseAmount', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Unit</Text>
              <FormInput
                placeholder="tablet"
                value={form.doseUnit}
                onChangeText={(v) => updateField('doseUnit', v)}
              />
            </View>
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Reason</Text>
            <FormInput
              placeholder="Blood pressure"
              value={form.reason}
              onChangeText={(v) => updateField('reason', v)}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Prescriber</Text>
            <FormInput
              placeholder="Dr. Ipsum"
              value={form.prescriber}
              onChangeText={(v) => updateField('prescriber', v)}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Pharmacy</Text>
            <FormInput
              placeholder="Sunny Pharmacy"
              value={form.pharmacy}
              onChangeText={(v) => updateField('pharmacy', v)}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Notes</Text>
            <FormInput
              value={form.notes}
              onChangeText={(v) => updateField('notes', v)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 72 }}
            />
          </View>

          <View className="flex-row justify-between items-center py-3 border-t border-chrome-border">
            <Text className="text-base text-text-primary">Active</Text>
            <Switch
              value={form.isActive}
              onValueChange={(v) => updateField('isActive', v)}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default MedicationFormScreen;
