import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { useCurrentPregnancy } from '../../../hooks/usePregnancy';
import Button from '../../ui/Button';
import type { RootStackParamList } from '../../../types/navigation';
import { getTodayDate } from '../../../utils/dateUtils';

import CycleTodayView from '../CycleTodayView';

interface PregnancyLogViewProps {
  date?: string;
  onSaveSuccess?: () => void;
  /** Parent-triggered save: forwarded to CycleTodayView. */
  saveRequestRef?: React.MutableRefObject<(() => void) | null>;
  /** Reports saving state so a parent-owned save button can mirror it. */
  onSavingChange?: (saving: boolean) => void;
  /** Opens the parent's calendar sheet from the in-form date row. */
  onDatePress?: () => void;
  hideSaveButton?: boolean;
}

/**
 * Pregnancy logging form for CycleLogModalScreen: weight, symptoms, and notes
 * for the selected date, saved through the screen-level Save action. Live
 * tools (bump photos, safety search) live on the Pregnancy Hub.
 */
const PregnancyLogView: React.FC<PregnancyLogViewProps> = ({
  date = getTodayDate(),
  onSaveSuccess,
  saveRequestRef,
  onSavingChange,
  onDatePress,
  hideSaveButton,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { pregnancy, isLoading: isPregnancyLoading } = useCurrentPregnancy();
  const hasActive = !!pregnancy && pregnancy.status === 'active';

  if (isPregnancyLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (!hasActive) {
    return (
      <View className="bg-surface rounded-2xl p-6 shadow-sm gap-4 items-center">
        <Text className="text-text-primary text-base font-semibold">Set up your pregnancy</Text>
        <Text className="text-text-secondary text-sm text-center">
          Add your due date to track baby&apos;s growth week by week and keep a bump photo journal.
        </Text>
        <Button variant="primary" onPress={() => navigation.navigate('PregnancySetup')}>
          Get Started
        </Button>
      </View>
    );
  }

  return (
    <CycleTodayView
      date={date}
      onSaveSuccess={onSaveSuccess}
      saveRequestRef={saveRequestRef}
      onSavingChange={onSavingChange}
      onDatePress={onDatePress}
      hideSaveButton={hideSaveButton}
    />
  );
};

export default PregnancyLogView;
