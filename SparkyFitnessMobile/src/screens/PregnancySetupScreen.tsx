import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { eddFromLmp, eddFromConception, compareDays } from '@workspace/shared';
import type { PregnancyDueDateBasis } from '@workspace/shared';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePregnancyMutations } from '../hooks/usePregnancy';
import { getTodayDate, formatDate, addDays } from '../utils/dateUtils';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import Button from '../components/ui/Button';
import StepperInput from '../components/StepperInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import type { RootStackScreenProps } from '../types/navigation';

const BASIS_OPTIONS: { value: PregnancyDueDateBasis }[] = [
  { value: 'lmp' }, { value: 'conception' }, { value: 'manual' }, { value: 'scan' },
];

const basisLabel = (value: PregnancyDueDateBasis, t: (key: string) => string): string => {
  switch (value) {
    case 'lmp': return t('mobileComponents.wellness.setupBasis.lmp');
    case 'conception': return t('mobileComponents.wellness.setupBasis.conception');
    case 'manual': return t('mobileComponents.wellness.setupBasis.manual');
    case 'scan': return t('mobileComponents.wellness.setupBasis.scan');
  }
};

const fieldLabel = (value: PregnancyDueDateBasis, t: (key: string) => string): string => {
  switch (value) {
    case 'lmp': return t('mobileComponents.wellness.setupField.lmp');
    case 'conception': return t('mobileComponents.wellness.setupField.conception');
    case 'manual': return t('mobileComponents.wellness.setupField.manual');
    case 'scan': return t('mobileComponents.wellness.setupField.scan');
  }
};

type Props = RootStackScreenProps<'PregnancySetup'>;

// A pregnancy runs ~280 days; term is capped at 42 weeks (294 days). Allow a
// little slack for overdue (past) and very-early (future) due dates.
const MAX_DUE_DAYS_AHEAD = 300;
const MAX_OVERDUE_DAYS = 21;

const PregnancySetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const calendarRef = useRef<CalendarSheetRef>(null);

  const existing = route.params?.pregnancy;
  const isEdit = !!existing?.id;

  // Prefill from the existing record when editing. For lmp/conception the date
  // field holds that basis date; for manual/scan it holds the due date itself.
  const initialBasis = existing?.due_date_basis ?? 'lmp';
  const initialDate =
    initialBasis === 'lmp'
      ? existing?.lmp_date ?? getTodayDate()
      : initialBasis === 'conception'
        ? existing?.conception_date ?? getTodayDate()
        : existing?.due_date ?? getTodayDate();

  const [basis, setBasis] = useState<PregnancyDueDateBasis>(initialBasis);
  const [date, setDate] = useState<string>(initialDate);
  const [fetusCount, setFetusCount] = useState(existing?.fetus_count ?? 1);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const { createPregnancyAsync, isCreating, updatePregnancyAsync, isUpdating } =
    usePregnancyMutations();
  const isSaving = isCreating || isUpdating;

  const computedDueDate = useMemo(() => {
    if (basis === 'lmp') return eddFromLmp(date);
    if (basis === 'conception') return eddFromConception(date);
    return date; // manual / scan: the entered date is already the due date
  }, [basis, date]);

  /** Returns an error message if the entered dates are implausible, else null. */
  const validate = (): string | null => {
    const today = getTodayDate();
    if (basis === 'lmp' && compareDays(date, today) > 0) {
      return t('mobileComponents.wellness.setup.futureLmp');
    }
    if (basis === 'conception' && compareDays(date, today) > 0) {
      return t('mobileComponents.wellness.setup.futureConception');
    }
    if (compareDays(computedDueDate, addDays(today, -MAX_OVERDUE_DAYS)) < 0) {
      return t('mobileComponents.wellness.setup.pastDue');
    }
    if (compareDays(computedDueDate, addDays(today, MAX_DUE_DAYS_AHEAD)) > 0) {
      return t('mobileComponents.wellness.setup.farDue');
    }
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      Toast.show({ type: 'error', text1: t('mobileComponents.wellness.setup.checkDates'), text2: error });
      return;
    }
    const body = {
      due_date: computedDueDate,
      due_date_basis: basis,
      lmp_date: basis === 'lmp' ? date : null,
      conception_date: basis === 'conception' ? date : null,
      fetus_count: fetusCount,
      status: 'active' as const,
      notes: notes || null,
    };
    try {
      if (isEdit && existing?.id) {
        await updatePregnancyAsync({ id: existing.id, body });
        Toast.show({ type: 'success', text1: t('mobileComponents.wellness.setup.updated') });
      } else {
        await createPregnancyAsync(body);
        Toast.show({ type: 'success', text1: t('mobileComponents.wellness.setup.created') });
      }
      navigation.goBack();
    } catch {
      Toast.show({ type: 'error', text1: t('mobileComponents.wellness.setup.saveError') });
    }
  };

  const header = useScreenHeader({
    title: isEdit ? t('mobileComponents.wellness.setup.editTitle') : t('mobileComponents.wellness.setup.newTitle'),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}>
        <Text className="text-text-secondary text-sm mb-4">
          {t('mobileComponents.wellness.setup.description')}
        </Text>

        <SettingsRowGroup>
          <SettingsRow
            title={t('mobileComponents.wellness.setup.basedOn')}
            rightAccessory={
              <BottomSheetPicker
                value={basis}
                 options={BASIS_OPTIONS.map((option) => ({ ...option, label: basisLabel(option.value, t) }))}
                onSelect={setBasis}
                 title={t('mobileComponents.wellness.setup.estimateBy')}
                containerStyle={{ flex: 1, maxWidth: 210 }}
              />
            }
          />
          <SettingsRow
             title={fieldLabel(basis, t)}
            rightAccessory={
              <TouchableOpacity onPress={() => calendarRef.current?.present()}>
                <Text className="text-accent-primary text-sm font-semibold">{formatDate(date)}</Text>
              </TouchableOpacity>
            }
          />
          <SettingsRow
             title={t('mobileComponents.wellness.setup.babies')}
            rightAccessory={
              <StepperInput
                value={String(fetusCount)}
                onChangeText={(t) => setFetusCount(Math.max(1, Math.min(6, parseInt(t, 10) || 1)))}
                onIncrement={() => setFetusCount((n) => Math.min(6, n + 1))}
                onDecrement={() => setFetusCount((n) => Math.max(1, n - 1))}
                keyboardType="number-pad"
                compact
              />
            }
          />
        </SettingsRowGroup>

        <View className="bg-surface rounded-2xl p-4 mt-4 border border-border-subtle shadow-sm">
           <Text className="text-text-secondary text-xs">{t('mobileComponents.wellness.setup.due')}</Text>
          <Text className="text-text-primary text-lg font-bold">{formatDate(computedDueDate)}</Text>
        </View>

        <View className="bg-surface rounded-2xl p-4 mt-4 border border-border-subtle shadow-sm">
           <Text className="text-text-primary text-sm font-semibold mb-2">{t('mobileComponents.wellness.setup.notes')}</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
             placeholder={t('mobileComponents.wellness.setup.notesPlaceholder')}
            multiline
            className="bg-raised rounded-xl p-3 text-text-primary text-sm min-h-[70px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <Button variant="primary" disabled={isSaving} onPress={handleSave}>
          {isSaving ? t('mobileComponents.wellness.setup.saving') : t('mobileComponents.wellness.setup.save')}
        </Button>
      </View>

      <CalendarSheet ref={calendarRef} selectedDate={date} onSelectDate={setDate} />
    </View>
  );
};

export default PregnancySetupScreen;
