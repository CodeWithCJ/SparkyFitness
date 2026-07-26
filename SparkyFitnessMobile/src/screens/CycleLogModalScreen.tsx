import React from 'react';
import { View, ScrollView } from 'react-native';
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
import { getTodayDate, addDays } from '../utils/dateUtils';

type CycleLogModalScreenProps = RootStackScreenProps<'CycleLogModal'>;

const CycleLogModalScreen: React.FC<CycleLogModalScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { mode, discreetMode } = useCycleMode();

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
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View className="gap-3">
          {/* Date Selector in Modal Header area */}
          {mode !== 'pregnant' && (
            <View className="flex-row justify-end -mb-1">
              <DateNavigator
                title=""
                selectedDate={selectedDate}
                onPreviousDay={handlePrevDay}
                onNextDay={handleNextDay}
                onToday={handleToday}
                showDateAlways
                skipTopInset
                skipHorizontalPadding
                compact
              />
            </View>
          )}

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
            <CycleTodayView date={selectedDate} onSaveSuccess={() => navigation.goBack()} />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default CycleLogModalScreen;
