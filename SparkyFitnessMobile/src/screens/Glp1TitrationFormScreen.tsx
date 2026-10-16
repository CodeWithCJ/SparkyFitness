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
  useCreateTitrationStep,
  useDeleteTitrationStep,
  useTitrationSteps,
  useUpdateTitrationStep,
} from '../hooks/useGlp1';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type { TitrationStep } from '@workspace/shared';

type Glp1TitrationFormScreenProps = RootStackScreenProps<'Glp1TitrationForm'>;

interface FormState {
  dose: string;
  unit: string;
  startDate: string;
  weeks: string;
  status: TitrationStep['status'];
  isTaper: boolean;
}

const EMPTY_FORM: FormState = {
  dose: '',
  unit: 'mg',
  startDate: '',
  weeks: '',
  status: 'planned',
  isTaper: false,
};

const fromStep = (step: TitrationStep): FormState => ({
  dose: String(step.dose_mg),
  unit: step.dose_unit || 'mg',
  startDate: step.start_date ?? '',
  weeks: step.planned_weeks != null ? String(step.planned_weeks) : '',
  status: step.status,
  isTaper: step.is_taper,
});

const Glp1TitrationFormScreen: React.FC<Glp1TitrationFormScreenProps> = ({
  route,
  navigation,
}) => {
  const { t } = useTranslation();
  const { medicationId, stepId } = route.params;
  const isEditing = !!stepId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');

  const { data: steps } = useTitrationSteps(medicationId);
  const existing = useMemo(
    () => steps?.find((s) => s.id === stepId),
    [steps, stepId]
  );
  const createStep = useCreateTitrationStep();
  const updateStep = useUpdateTitrationStep();
  const deleteStep = useDeleteTitrationStep();

  const [edits, setEdits] = useState<Partial<FormState>>({});
  const form: FormState = useMemo(
    () => ({ ...(existing ? fromStep(existing) : EMPTY_FORM), ...edits }),
    [existing, edits]
  );
  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) =>
      setEdits((prev) => ({ ...prev, [key]: value })),
    []
  );

  const isSaving = createStep.isPending || updateStep.isPending;

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const dose = Number(form.dose);
    const weeks = form.weeks.trim() === '' ? null : Number(form.weeks);
    if (
      form.dose.trim() === '' ||
      !Number.isFinite(dose) ||
      dose <= 0 ||
      (weeks !== null && (!Number.isFinite(weeks) || weeks <= 0))
    ) {
      Alert.alert(
        t('medications.form.invalidNumber', { defaultValue: 'Invalid number' }),
        t('medications.glp1.titration.invalidNumbers', {
          defaultValue: 'Enter a dose, and weeks if you set them, as numbers.',
        })
      );
      return;
    }
    const body = {
      dose_mg: dose,
      dose_unit: form.unit.trim() || 'mg',
      start_date: form.startDate || null,
      planned_weeks: weeks,
      status: form.status,
      is_taper: form.isTaper,
    };
    const onError = (error: Error) =>
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('medications.glp1.form.saveFailed', {
          defaultValue: 'Failed to save: {{error}}',
          error: error.message,
        })
      );
    if (stepId) {
      updateStep.mutate(
        { id: stepId, body },
        { onSuccess: () => navigation.goBack(), onError }
      );
    } else {
      createStep.mutate(
        { medicationId, body },
        { onSuccess: () => navigation.goBack(), onError }
      );
    }
  }, [
    form,
    isSaving,
    stepId,
    medicationId,
    createStep,
    updateStep,
    navigation,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (!stepId) return;
    Alert.alert(
      t('medications.glp1.titration.deleteTitle', {
        defaultValue: 'Delete step',
      }),
      t('medications.glp1.titration.deleteMessage', {
        defaultValue: 'Delete this titration step?',
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
            deleteStep.mutate(
              { id: stepId },
              { onSuccess: () => navigation.goBack() }
            ),
        },
      ]
    );
  }, [stepId, deleteStep, navigation, t]);

  const title = isEditing
    ? t('medications.glp1.titration.editStep', { defaultValue: 'Edit step' })
    : t('medications.glp1.titration.newStep', { defaultValue: 'New step' });
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

  const statusOptions = useMemo(
    () => [
      {
        label: t('medications.glp1.titration.status.planned', {
          defaultValue: 'Planned',
        }),
        value: 'planned' as const,
      },
      {
        label: t('medications.glp1.titration.status.active', {
          defaultValue: 'Current',
        }),
        value: 'active' as const,
      },
      {
        label: t('medications.glp1.titration.status.done', {
          defaultValue: 'Done',
        }),
        value: 'done' as const,
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
        <View className="flex-row gap-4">
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.glp1.titration.dose', { defaultValue: 'Dose' })}
            </Text>
            <FormInput
              value={form.dose}
              onChangeText={(v) => setField('dose', v)}
              keyboardType="decimal-pad"
              placeholder="1.0"
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.form.unit', { defaultValue: 'Unit' })}
            </Text>
            <FormInput
              value={form.unit}
              onChangeText={(v) => setField('unit', v)}
            />
          </View>
        </View>

        <OptionalDateField
          label={t('medications.glp1.titration.startDate', {
            defaultValue: 'Start date',
          })}
          value={form.startDate}
          onChange={(v) => setField('startDate', v)}
        />

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.titration.weeksAtDose', {
              defaultValue: 'Weeks at this dose',
            })}
          </Text>
          <FormInput
            value={form.weeks}
            onChangeText={(v) => setField('weeks', v)}
            keyboardType="number-pad"
            placeholder="4"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.glp1.titration.statusLabel', {
              defaultValue: 'Status',
            })}
          </Text>
          <BottomSheetPicker
            value={form.status}
            options={statusOptions}
            onSelect={(v) => setField('status', v)}
            title={t('medications.glp1.titration.statusLabel', {
              defaultValue: 'Status',
            })}
          />
        </View>

        <View className="flex-row justify-between items-center">
          <Text className="text-base text-text-primary">
            {t('medications.glp1.titration.taperLabel', {
              defaultValue: 'Taper (dose reduction)',
            })}
          </Text>
          <Switch
            value={form.isTaper}
            onValueChange={(v) => setField('isTaper', v)}
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

export default Glp1TitrationFormScreen;
