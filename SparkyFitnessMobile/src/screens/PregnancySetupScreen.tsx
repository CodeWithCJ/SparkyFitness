import React, { useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePregnancyMutations } from '../hooks/usePregnancy';
import Button from '../components/ui/Button';
import StepperInput, { useStepperDraft } from '../components/StepperInput';
import SettingsRow from '../components/SettingsRow';
import PregnancyDueDateForm, {
  usePregnancyDueDateForm,
} from '../components/wellness/pregnancy/PregnancyDueDateForm';
import { PREGNANCY_SETTING_LIMITS } from '../utils/cycleDisplayUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'PregnancySetup'>;

const PregnancySetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const existing = route.params?.pregnancy;
  const isEdit = !!existing?.id;

  const form = usePregnancyDueDateForm(existing);
  const [fetusCount, setFetusCount] = useState(existing?.fetus_count ?? 1);

  const fetusCountProps = useStepperDraft({
    value: fetusCount,
    ...PREGNANCY_SETTING_LIMITS.fetusCount,
    onCommit: setFetusCount,
  });

  const { createPregnancyAsync, isCreating, updatePregnancyAsync, isUpdating } =
    usePregnancyMutations();
  const isSaving = isCreating || isUpdating;

  const handleSave = async () => {
    const error = form.validate();
    if (error) {
      Toast.show({ type: 'error', text1: t('mobileComponents.wellness.setup.checkDates'), text2: error });
      return;
    }
    const body = {
      ...form.dates,
      fetus_count: fetusCount,
      status: 'active' as const,
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
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this modal
      // sheet already starts below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}>
        <Text className="text-text-secondary text-sm mb-4">
          {t('mobileComponents.wellness.setup.description')}
        </Text>

        <PregnancyDueDateForm form={form}>
          <SettingsRow
            title={t('mobileComponents.wellness.setup.babies')}
            rightAccessory={
              <StepperInput {...fetusCountProps} keyboardType="number-pad" compact />
            }
          />
        </PregnancyDueDateForm>
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
    </View>
  );
};

export default PregnancySetupScreen;
