import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';


import { useCycleMode } from '../hooks/useCycleMode';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleHistory } from '../hooks/useCycleHistory';
import { useCycleLogsRange } from '../hooks/useCycleLogs';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

import SegmentedControl from '../components/SegmentedControl';
import DateNavigator from '../components/DateNavigator';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import CycleTodayView from '../components/wellness/CycleTodayView';
import CycleCalendarGrid from '../components/wellness/CycleCalendarGrid';
import CycleHistoryList from '../components/wellness/CycleHistoryList';
import CycleInsightsView from '../components/wellness/CycleInsightsView';
import CycleRing from '../components/wellness/CycleRing';
import CycleAlerts from '../components/wellness/CycleAlerts';
import FertilityCard from '../components/wellness/ttc/FertilityCard';
import TestQuickLog from '../components/wellness/ttc/TestQuickLog';
import PregnancyTodayView from '../components/wellness/pregnancy/PregnancyTodayView';

import {
  predictNextCycles,
  phaseForDay,
  buildCycleAlerts,
  daysBetween,
} from '@workspace/shared';
import type { DerivedCycle, CyclePrediction } from '@workspace/shared';
import { getTodayDate, addDays } from '../utils/dateUtils';

type CycleHubScreenProps = RootStackScreenProps<'CycleHub'>;

const CycleHubScreen: React.FC<CycleHubScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { mode, enabled, discreetMode, isLoading: isModeLoading, onboardedAt } = useCycleMode();
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();

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
  const calendarRef = useRef<CalendarSheetRef>(null);

  // Tabs State: 'today' | 'insights' | 'history'
  const [activeTab, setActiveTab] = useState<'today' | 'insights' | 'history'>(
    route.params?.initialTab === 'insights' ? 'insights' : 'today'
  );

  // Queries
  const { cycles, isLoading: isHistoryLoading } = useCycleHistory();
  const { logs, isLoading: isLogsLoading } = useCycleLogsRange({
    startDate: useMemo(() => addDays(selectedDate, -60), [selectedDate]),
    endDate: useMemo(() => addDays(selectedDate, 60), [selectedDate]),
  });

  const isLoading = isModeLoading || isSettingsLoading || isHistoryLoading || isLogsLoading;

  // Day Navigation Handlers
  const handlePrevDay = () => {
    setSelectedDate((d) => addDays(d, -1));
  };

  const handleNextDay = () => {
    setSelectedDate((d) => addDays(d, 1));
  };

  const handleToday = () => setSelectedDate(getTodayDate());
  const openCalendar = () => calendarRef.current?.present();

  // 2. Cycle Stats
  const cycleStats = useMemo(() => {
    const completed = cycles.filter((c) => c.cycle_length && c.period_length);
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const periodLengths = completed.map((c) => c.period_length!);

    return {
      avgCycleLength: settings?.avg_cycle_length_override ?? (cycleLengths.length
        ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
        : 28),
      avgPeriodLength: settings?.avg_period_length_override ?? (periodLengths.length
        ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
        : 5),
      regularity: 'regular' as const,
      sampleSize: cycleLengths.length,
      medianCycleLength: 28,
      cycleLengthSd: 0,
    };
  }, [cycles, settings]);

  // 3. Predictions
  const prediction = useMemo(() => {
    const lastCycle = cycles[0];
    if (!lastCycle || !lastCycle.start_date || !settings) {
      return { cycles: [], basis: 'settings', confidence: 'low' } as CyclePrediction;
    }
    return predictNextCycles(cycleStats, lastCycle.start_date, settings);
  }, [cycles, cycleStats, settings]);

  // 4. Phase and Day stats for selectedDate
  const dayStats = useMemo(() => {
    return phaseForDay(selectedDate, cycles as DerivedCycle[], prediction);
  }, [selectedDate, cycles, prediction]);

  // Cycle-day numbers for the ring's fertile/ovulation markers. prediction.cycles[0]
  // holds the *current* cycle's ovulation/fertile-window dates (they sit `luteal`
  // days before the next predicted period), so convert those dates to 1-indexed
  // cycle days relative to the current cycle's start (the prediction anchor).
  const ringMarkers = useMemo(() => {
    const anchor = cycles[0]?.start_date;
    const next = prediction.cycles[0];
    if (!anchor || !next) {
      return { fertileStartDay: null, fertileEndDay: null, ovulationDay: null };
    }
    const toDay = (d: string | null): number | null =>
      d ? daysBetween(anchor, d) + 1 : null;
    return {
      fertileStartDay: toDay(next.fertileStart),
      fertileEndDay: toDay(next.fertileEnd),
      ovulationDay: toDay(next.ovulation),
    };
  }, [cycles, prediction]);

  // 5. Alerts
  const alerts = useMemo(() => {
    if (!settings || !prediction || !prediction.cycles || prediction.cycles.length === 0) return [];
    return buildCycleAlerts(selectedDate, prediction, []);
  }, [selectedDate, prediction, settings]);

  const activeSegmentLabel = useMemo(() => {
    if (dayStats.phase === 'menstrual') return 'Period';
    if (dayStats.phase === 'fertile') return 'Fertile Window';
    if (dayStats.phase === 'ovulation') return 'Ovulation Day';
    if (dayStats.phase === 'luteal') return 'Luteal Phase';
    if (dayStats.phase === 'follicular') return 'Follicular Phase';
    return 'Cycle';
  }, [dayStats]);

  const header = useScreenHeader({
    title: discreetMode ? 'Wellness' : mode === 'pregnant' ? 'Pregnancy Hub' : 'Cycle Hub',
    left: { kind: 'back' },
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

      {/* Segmented Control */}
      <View className="px-4 py-2 bg-background z-10 border-b border-border-subtle">
        <SegmentedControl
          segments={[
            { key: 'today', label: 'Log' },
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
          paddingBottom: insets.bottom + 80,
        }}
      >
        {activeTab === 'today' && mode === 'pregnant' && <PregnancyTodayView />}

        {activeTab === 'today' && mode !== 'pregnant' && (
          <View className="gap-6">
            {/* Date Navigation Row (matches Dashboard's DateNavigator) */}
            <DateNavigator
              title=""
              selectedDate={selectedDate}
              onPreviousDay={handlePrevDay}
              onNextDay={handleNextDay}
              onToday={handleToday}
              onDatePress={openCalendar}
              showDateAlways
              skipTopInset
              skipHorizontalPadding
            />

            {/* Cycle Ring Visualisation */}
            {(
              <View className="items-center py-4 bg-surface rounded-2xl border border-border-subtle shadow-sm">
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
            )}

            {/* Cycle Alerts */}
            {alerts.length > 0 && (
              <CycleAlerts alerts={alerts.map((a) => ({ key: a.key, severity: a.severity, message: a.message }))} />
            )}

            {/* TTC: fertility summary + test quick-log */}
            {mode === 'ttc' && (
              <>
                <FertilityCard date={selectedDate} />
                <TestQuickLog date={selectedDate} />
              </>
            )}

            {/* Daily Log Entry Form */}
            <CycleTodayView date={selectedDate} />
          </View>
        )}

        {activeTab === 'insights' && (
          <View className="gap-6">
            <CycleInsightsView />
          </View>
        )}

        {activeTab === 'history' && (
          <View className="gap-6">
            <CycleCalendarGrid
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setActiveTab('today');
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

      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
};

export default CycleHubScreen;
