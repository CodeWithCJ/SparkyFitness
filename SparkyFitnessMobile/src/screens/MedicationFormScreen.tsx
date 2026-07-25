import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Alert, Modal, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMedicationDetail, useCreateMedication, useUpdateMedication } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
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

function SimplePicker({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const [surfaceBg] = useCSSVariable(['--color-surface']) as [string];
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={{ backgroundColor: surfaceBg, borderRadius: 16, padding: 8, width: '80%', maxHeight: '70%' }}
        >
          <Text style={{ color: textPrimary, fontSize: 17, fontWeight: '600', textAlign: 'center', paddingVertical: 12 }}>
            {title}
          </Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => { onSelect(item.value); onClose(); }}
                style={{ paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.6}
              >
                <Text style={{ color: textPrimary, fontSize: 16 }}>{item.label}</Text>
                <Icon name="checkmark" size={18} color={accent} style={{ opacity: 0 }} />
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
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

  const [typePickerVisible, setTypePickerVisible] = useState(false);

  const handleSave = useCallback(() => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Please enter a medication name.');
      return;
    }

    const strengthNum = form.strengthValue ? parseFloat(form.strengthValue) : null;
    const doseNum = form.doseAmount ? parseFloat(form.doseAmount) : null;

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
        { onSuccess: () => navigation.goBack() },
      );
    } else {
      createMedication.mutate(
        { ...base, is_active: form.isActive },
        {
          onSuccess: (med) => {
            navigation.replace('MedicationDetail', { medicationId: med.id });
          },
        },
      );
    }
  }, [form, isEditing, medicationId, createMedication, updateMedication, navigation]);

  const header = useScreenHeader({
    title: isEditing ? 'Edit Medication' : 'New Medication',
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      label: 'Save',
      onPress: handleSave,
    },
  });

  const typeOptions = useMemo(() => MEDICATION_TYPES.map((t) => ({ label: t.label, value: t.id })), []);
  const selectedTypeLabel = useMemo(() => MEDICATION_TYPES.find((t) => t.id === form.typeId)?.label ?? form.typeId, [form.typeId]);

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
          <FormField label="Name *">
            <TextInput
              className="text-base text-text-primary"
              placeholder="e.g., Lisinopril"
              placeholderTextColor="#9CA3AF"
              value={form.name}
              onChangeText={(v) => updateField('name', v)}
              autoCapitalize="words"
            />
          </FormField>

          <FormField label="Type">
            <TouchableOpacity
              className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
              onPress={() => setTypePickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text className="text-base flex-1 text-text-primary">{selectedTypeLabel}</Text>
              <Icon name="chevron-down" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </FormField>

          <View className="flex-row">
            <FormField label="Strength" style={{ flex: 1, marginRight: 8 }}>
              <TextInput
                className="text-base text-text-primary"
                placeholder="e.g., 10"
                placeholderTextColor="#9CA3AF"
                value={form.strengthValue}
                onChangeText={(v) => updateField('strengthValue', v)}
                keyboardType="decimal-pad"
              />
            </FormField>
            <FormField label="Unit" style={{ flex: 1, marginLeft: 8 }}>
              <TextInput
                className="text-base text-text-primary"
                placeholder="mg"
                placeholderTextColor="#9CA3AF"
                value={form.strengthUnit}
                onChangeText={(v) => updateField('strengthUnit', v)}
              />
            </FormField>
          </View>

          <View className="flex-row">
            <FormField label="Dose" style={{ flex: 1, marginRight: 8 }}>
              <TextInput
                className="text-base text-text-primary"
                placeholder="e.g., 1"
                placeholderTextColor="#9CA3AF"
                value={form.doseAmount}
                onChangeText={(v) => updateField('doseAmount', v)}
                keyboardType="decimal-pad"
              />
            </FormField>
            <FormField label="Unit" style={{ flex: 1, marginLeft: 8 }}>
              <TextInput
                className="text-base text-text-primary"
                placeholder="tablet"
                placeholderTextColor="#9CA3AF"
                value={form.doseUnit}
                onChangeText={(v) => updateField('doseUnit', v)}
              />
            </FormField>
          </View>

          <FormField label="Reason">
            <TextInput
              className="text-base text-text-primary"
              placeholder="e.g., Blood pressure"
              placeholderTextColor="#9CA3AF"
              value={form.reason}
              onChangeText={(v) => updateField('reason', v)}
            />
          </FormField>

          <FormField label="Prescriber">
            <TextInput
              className="text-base text-text-primary"
              placeholder="Doctor name"
              placeholderTextColor="#9CA3AF"
              value={form.prescriber}
              onChangeText={(v) => updateField('prescriber', v)}
            />
          </FormField>

          <FormField label="Pharmacy">
            <TextInput
              className="text-base text-text-primary"
              placeholder="Pharmacy name"
              placeholderTextColor="#9CA3AF"
              value={form.pharmacy}
              onChangeText={(v) => updateField('pharmacy', v)}
            />
          </FormField>

          <FormField label="Notes">
            <TextInput
              className="text-base text-text-primary"
              placeholder="Additional notes"
              placeholderTextColor="#9CA3AF"
              value={form.notes}
              onChangeText={(v) => updateField('notes', v)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </FormField>

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

      <SimplePicker
        visible={typePickerVisible}
        title="Medication Type"
        options={typeOptions}
        onSelect={(val) => updateField('typeId', val)}
        onClose={() => setTypePickerVisible(false)}
      />
    </View>
  );
};

const FormField: React.FC<{
  label: string;
  children: React.ReactNode;
  style?: object;
}> = ({ label, children, style }) => (
  <View className="py-3 border-b border-chrome-border" style={style}>
    <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">{label}</Text>
    {children}
  </View>
);

export default MedicationFormScreen;
