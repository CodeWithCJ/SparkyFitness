import React, { useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
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
import DateNavigator from '../components/DateNavigator';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { getTodayDate, addDays } from '../utils/dateUtils';

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
  // Pregnancy mode keeps PregnancyLogView's own save button instead.
  const saveRequestRef = useRef<(() => void) | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const showsScreenSave = mode !== 'pregnant';

  const handlePrevDay = () => setSelectedDate((d) => addDays(d, -1));
  const handleNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const handleToday = () => setSelectedDate(getTodayDate());

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
    right: showsScreenSave
      ? {
          kind: 'primary',
          label: SAVE_LABEL,
          busyLabel: SAVING_LABEL,
          busy: isSaving,
          disabled: isSaving,
          placement: 'native-only',
          onPress: () => saveRequestRef.current?.(),
          identifier: 'cycle-log-save',
        }
      : undefined,
  });

  return (
    <View
      className="flex-1 bg-background"
      // iOS keeps no top inset even without the native header: this modal
      // sheet already starts below the status bar.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      {/* Integrated Header Date Bar */}
      <View className="px-4 py-2 bg-background border-b border-border-subtle flex-row items-center justify-between z-10">
        <Text className="text-sm font-semibold text-text-secondary">Selected Date</Text>
        <DateNavigator
          title=""
          selectedDate={selectedDate}
          onPreviousDay={handlePrevDay}
          onNextDay={handleNextDay}
          onToday={handleToday}
          onDatePress={() => calendarRef.current?.present()}
          showDateAlways
          skipTopInset
          skipHorizontalPadding
          compact
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View className="gap-3">
          {/* Mode-aware entry view */}
          {mode === 'pregnant' && (
            <PregnancyLogView date={selectedDate} onSaveSuccess={() => navigation.goBack()} />
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
      </ScrollView>

      {/* Sticky footer save; the native-header path shows Save in the nav bar */}
      {showsScreenSave && !usesNativeHeader && (
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
