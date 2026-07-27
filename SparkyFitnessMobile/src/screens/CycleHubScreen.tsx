import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useDiscreetMode } from '../hooks/useDiscreetMode';
import { useCycleMode } from '../hooks/useCycleMode';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleHistory } from '../hooks/useCycleHistory';
import { useCycleLogsRange } from '../hooks/useCycleLogs';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

import SegmentedControl from '../components/SegmentedControl';
import CycleCalendarGrid from '../components/wellness/CycleCalendarGrid';
import CycleHistoryList from '../components/wellness/CycleHistoryList';
import CycleInsightsView from '../components/wellness/CycleInsightsView';
import CycleRing from '../components/wellness/CycleRing';
import CycleAlerts from '../components/wellness/CycleAlerts';
import FertilityCard from '../components/wellness/ttc/FertilityCard';
import PregnancyOverviewView from '../components/wellness/pregnancy/PregnancyOverviewView';

import { buildCycleAlerts } from '@workspace/shared';
import { getTodayDate, addDays } from '../utils/dateUtils';
import { getPhaseDisplayName } from '../utils/cycleDisplayUtils';
import { useCyclePredictionData } from '../hooks/useCyclePredictionData';

type CycleHubScreenProps = RootStackScreenProps<'CycleHub'>;

const CycleHubScreen: React.FC<CycleHubScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { mode, enabled, isLoading: isModeLoading, onboardedAt } = useCycleMode();
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();
  const { discreetMode } = useDiscreetMode();

  // Redirect to Onboarding if not enabled or not onboarded
  useEffect(() => {
    if (!isModeLoading) {
      if (!enabled || !onboardedAt) {
        navigation.replace('CycleOnboarding');
      }
    }
  }, [isModeLoading, enabled, onboardedAt, navigation]);

  // Selected Date State
  const [selectedDate, setSelectedDate] = useState(getTodayDate);

  // Tabs State: 'insights' | 'history'
  const [activeTab, setActiveTab] = useState<'insights' | 'history'>('insights');

  // Queries
  const { cycles, isLoading: isHistoryLoading } = useCycleHistory();
  const { logs, isLoading: isLogsLoading } = useCycleLogsRange({
    startDate: useMemo(() => addDays(selectedDate, -60), [selectedDate]),
    endDate: useMemo(() => addDays(selectedDate, 60), [selectedDate]),
  });

  const isLoading = isModeLoading || isSettingsLoading || isHistoryLoading || isLogsLoading;

  // 2. Shared Cycle Prediction Hook
  const sharedPrediction = useCyclePredictionData(selectedDate);

  const cycleStats = useMemo(() => {
    return {
      avgCycleLength: sharedPrediction?.avgCycleLength ?? 28,
      avgPeriodLength: sharedPrediction?.avgPeriodLength ?? 5,
    };
  }, [sharedPrediction]);

  const dayStats = useMemo(() => {
    return {
      phase: sharedPrediction?.phase ?? 'unknown',
      cycleDay: sharedPrediction?.day ?? null,
    };
  }, [sharedPrediction]);

  const ringMarkers = useMemo(() => {
    return {
      fertileStartDay: sharedPrediction?.fertileStartDay ?? null,
      fertileEndDay: sharedPrediction?.fertileEndDay ?? null,
      ovulationDay: sharedPrediction?.ovulationDay ?? null,
    };
  }, [sharedPrediction]);

  // 5. Alerts
  const alerts = useMemo(() => {
    if (!settings || !sharedPrediction?.prediction || !sharedPrediction.prediction.cycles || sharedPrediction.prediction.cycles.length === 0) return [];
    return buildCycleAlerts(selectedDate, sharedPrediction.prediction, []);
  }, [selectedDate, sharedPrediction, settings]);

  const activeSegmentLabel = useMemo(() => {
    return getPhaseDisplayName(dayStats.phase, discreetMode);
  }, [dayStats, discreetMode]);

  const hubTitle = discreetMode ? 'Wellness' : mode === 'pregnant' ? 'Pregnancy Hub' : 'Cycle Hub';

  const header = useScreenHeader({
    title: hubTitle,
    nativeTitle: hubTitle,
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      ionicon: 'add-outline',
      sfSymbol: 'plus',
      accessibilityLabel: 'Log Entry',
      onPress: () => navigation.navigate('CycleLogModal', { date: selectedDate }),
    },
  });

  if (isLoading || !settings) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      {/* Header Bar with Segmented Control */}
      <View className="px-4 py-2 bg-background z-10 border-b border-border-subtle">
        <SegmentedControl
          segments={[
            { key: 'insights', label: 'Insights' },
            { key: 'history', label: 'History' },
          ]}
          activeKey={activeTab}
          onSelect={setActiveTab}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 80,
        }}
      >
        {activeTab === 'insights' && (
          <View className="gap-3">
            {/* Pregnancy View or Cycle Insights */}
            {mode === 'pregnant' ? (
              <PregnancyOverviewView />
            ) : (
              <>
                {/* Cycle Ring Visualisation */}
                <View className="items-center py-4 bg-surface rounded-xl shadow-sm border-0">
                  <CycleRing
                    cycleDay={dayStats.cycleDay}
                    cycleLength={cycleStats.avgCycleLength}
                    periodLength={cycleStats.avgPeriodLength}
                    fertileStartDay={ringMarkers.fertileStartDay}
                    fertileEndDay={ringMarkers.fertileEndDay}
                    ovulationDay={ringMarkers.ovulationDay}
                    centerLabel={activeSegmentLabel}
                    centerValue={dayStats.cycleDay !== null ? `Day ${dayStats.cycleDay}` : '—'}
                    centerSub={discreetMode ? undefined : `${cycleStats.avgCycleLength} day cycle`}
                  />
                </View>

                {/* Cycle Alerts */}
                {alerts.length > 0 && (
                  <CycleAlerts alerts={alerts.map((a) => ({ key: a.key, severity: a.severity, message: a.message }))} />
                )}

                {/* TTC: fertility summary */}
                {mode === 'ttc' && <FertilityCard date={selectedDate} />}

                <CycleInsightsView />
              </>
            )}
          </View>
        )}

        {activeTab === 'history' && (
          <View className="gap-6">
            <CycleCalendarGrid
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                navigation.navigate('CycleLogModal', { date });
              }}
              cycles={cycles}
              logs={logs}
              settings={settings}
            />
            <View className="border-t border-border-subtle my-2" />
            <CycleHistoryList />
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default CycleHubScreen;
