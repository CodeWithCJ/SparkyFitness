import React, { useRef } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL } from '../hooks/useScreenHeader';
import Button from '../components/ui/Button';
import { useCycleMode } from '../hooks/useCycleMode';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import CycleTodayView from '../components/wellness/CycleTodayView';
import PregnancyLogView from '../components/wellness/pregnancy/PregnancyLogView';
import FertilityCard from '../components/wellness/ttc/FertilityCard';
import TestQuickLog from '../components/wellness/ttc/TestQuickLog';
import DateSelectRow from '../components/DateSelectRow';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { getTodayDate } from '../utils/dateUtils';

import { useDiscreetMode } from '../hooks/useDiscreetMode';

type CycleLogModalScreenProps = RootStackScreenProps<'CycleLogModal'>;

const CycleLogModalScreen: React.FC<CycleLogModalScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { mode } = useCycleMode();
  const { discreetMode } = useDiscreetMode();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const [borderSubtle] = useCSSVariable(['--color-border-subtle']) as [string];

  const [selectedDate, setSelectedDate] = React.useState(route.params?.date || getTodayDate());

  // Save lives in CycleTodayView; the header/footer buttons trigger it here.
  const saveRequestRef = useRef<(() => void) | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const headerTitle = React.useMemo(() => {
    if (discreetMode) return 'Log Entry';
    if (mode === 'pregnant') return 'Log Pregnancy Entry';
    if (mode === 'ttc') return 'Log Fertility & Test';
    return 'Log Daily Entry';
  }, [discreetMode, mode]);

  const header = useScreenHeader({
    title: headerTitle,
    nativeTitle: headerTitle,
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: SAVE_LABEL,
      busyLabel: SAVING_LABEL,
      busy: isSaving,
      disabled: isSaving,
      placement: 'native-only',
      onPress: () => saveRequestRef.current?.(),
      identifier: 'cycle-log-save',
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this modal
      // sheet already starts below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 40,
        }}
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          {/* Date card; pregnancy mode shows the date inside its weight card instead */}
          {mode !== 'pregnant' && (
            <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
              <DateSelectRow date={selectedDate} onPress={() => calendarRef.current?.present()} />
            </View>
          )}

          {/* Mode-aware entry view */}
          {mode === 'pregnant' && (
            <PregnancyLogView
              date={selectedDate}
              onSaveSuccess={() => navigation.goBack()}
              saveRequestRef={saveRequestRef}
              onSavingChange={setIsSaving}
              onDatePress={() => calendarRef.current?.present()}
              hideSaveButton
            />
          )}

          {mode === 'ttc' && (
            <>
              <FertilityCard date={selectedDate} />
              <TestQuickLog date={selectedDate} />
              <CycleTodayView
                date={selectedDate}
                onSaveSuccess={() => navigation.goBack()}
                saveRequestRef={saveRequestRef}
                onSavingChange={setIsSaving}
                hideSaveButton
              />
            </>
          )}

          {mode !== 'pregnant' && mode !== 'ttc' && (
            <>
              <FertilityCard date={selectedDate} />
              <CycleTodayView
                date={selectedDate}
                onSaveSuccess={() => navigation.goBack()}
                saveRequestRef={saveRequestRef}
                onSavingChange={setIsSaving}
                hideSaveButton
              />
            </>
          )}
        </View>

        <View className="mt-6 px-2">
          <MedicalDisclaimer />
        </View>
      </KeyboardAwareScrollView>

      {/* Sticky footer save; the native-header path shows Save in the nav bar */}
      {!usesNativeHeader && (
        <View
          className="px-4 py-3"
          style={{
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: borderSubtle,
          }}
        >
          <Button
            variant="primary"
            onPress={() => saveRequestRef.current?.()}
            disabled={isSaving}
            className="py-3"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-sm font-semibold text-center" style={{ color: '#fff' }}>
                {SAVE_LABEL}
              </Text>
            )}
          </Button>
        </View>
      )}

      <CalendarSheet
        ref={calendarRef}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </View>
  );
};

export default CycleLogModalScreen;
