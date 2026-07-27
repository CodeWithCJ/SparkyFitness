import React, { useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCycleMode } from '../hooks/useCycleMode';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import CycleTodayView from '../components/wellness/CycleTodayView';
import PregnancyLogView from '../components/wellness/pregnancy/PregnancyLogView';
import FertilityCard from '../components/wellness/ttc/FertilityCard';
import TestQuickLog from '../components/wellness/ttc/TestQuickLog';
import DateNavigator from '../components/DateNavigator';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { getTodayDate, addDays } from '../utils/dateUtils';

type CycleLogModalScreenProps = RootStackScreenProps<'CycleLogModal'>;

const CycleLogModalScreen: React.FC<CycleLogModalScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { mode, discreetMode } = useCycleMode();
  const calendarRef = useRef<CalendarSheetRef>(null);

  const [selectedDate, setSelectedDate] = React.useState(route.params?.date || getTodayDate());

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
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
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
              <CycleTodayView date={selectedDate} onSaveSuccess={() => navigation.goBack()} />
            </>
          )}

          {mode !== 'pregnant' && mode !== 'ttc' && (
            <>
              <FertilityCard date={selectedDate} />
              <CycleTodayView date={selectedDate} onSaveSuccess={() => navigation.goBack()} />
            </>
          )}
        </View>
      </ScrollView>

      <CalendarSheet
        ref={calendarRef}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </View>
  );
};

export default CycleLogModalScreen;
