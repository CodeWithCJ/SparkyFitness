import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDiscreetMode } from '../hooks/useDiscreetMode';
import { useCycleMode } from '../hooks/useCycleMode';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useCycleSwitch } from '../hooks/useMobileFeatures';
import { useCycleHistory } from '../hooks/useCycleHistory';
import { useCycleLogsRange } from '../hooks/useCycleLogs';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

import MedicalDisclaimer from '../components/MedicalDisclaimer';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const { mode, isLoading: isModeLoading } = useCycleMode();
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();
  const { discreetMode } = useDiscreetMode();
  const cycle = useCycleSwitch();

  // Never set up, or its setup was reset: run the setup. Once it was set up,
  // a hub turned off in Settings → Features offers to turn it back on as it
  // was instead, so the setup never asks again and overwrites the settings;
  // a failed load offers Retry, never the setup.
  const isSetUp = !!cycle.settings?.onboarded_at;
  const needsSetup = cycle.state === 'ready' && !isSetUp;
  const isOff = cycle.state === 'ready' && isSetUp && !cycle.on;
  const showsHub = cycle.state === 'ready' && isSetUp && cycle.on;
  useEffect(() => {
    if (needsSetup) navigation.replace('CycleOnboarding');
  }, [needsSetup, navigation]);

  // Anchor date for predictions, alerts, and the header log action
  const [selectedDate] = useState(getTodayDate);

  // Tabs State. The middle segment is mode-specific: cycle/TTC gets Trends,
  // pregnancy gets Tools; a middle-tab selection left over from the other mode
  // falls back to Overview.
  const [activeTab, setActiveTab] = useState<
    'overview' | 'trends' | 'tools' | 'history'
  >('overview');
  const middleTab =
    mode === 'pregnant'
      ? ({
          key: 'tools',
          label: t('cycleHub.tools', { defaultValue: 'Tools' }),
        } as const)
      : ({
          key: 'trends',
          label: t('cycleHub.trends', { defaultValue: 'Trends' }),
        } as const);
  const currentTab =
    (activeTab === 'trends' || activeTab === 'tools') &&
    activeTab !== middleTab.key
      ? 'overview'
      : activeTab;

  // Queries. Logs feed the History calendar, so the range follows the month
  // it is showing, padded to cover the adjacent-month days the grid renders.
  const { cycles, isLoading: isHistoryLoading } = useCycleHistory();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    selectedDate.slice(0, 7)
  );
  const monthStart = `${visibleMonth}-01`;
  const { logs, isLoading: isLogsLoading } = useCycleLogsRange({
    startDate: useMemo(() => addDays(monthStart, -7), [monthStart]),
    endDate: useMemo(() => addDays(monthStart, 45), [monthStart]),
  });

  const isLoading =
    isModeLoading || isSettingsLoading || isHistoryLoading || isLogsLoading;

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
    if (
      !settings ||
      !sharedPrediction?.prediction ||
      !sharedPrediction.prediction.cycles ||
      sharedPrediction.prediction.cycles.length === 0
    )
      return [];
    return buildCycleAlerts(selectedDate, sharedPrediction.prediction, []);
  }, [selectedDate, sharedPrediction, settings]);

  const activeSegmentLabel = useMemo(() => {
    return getPhaseDisplayName(dayStats.phase, discreetMode, t);
  }, [dayStats, discreetMode, t]);

  const hubTitle = discreetMode
    ? t('cycleHub.wellness', { defaultValue: 'Wellness' })
    : mode === 'pregnant'
      ? t('cycleHub.pregnancyHub', { defaultValue: 'Pregnancy Hub' })
      : t('cycleHub.cycleHub', { defaultValue: 'Cycle Hub' });

  const header = useScreenHeader({
    title: hubTitle,
    nativeTitle: hubTitle,
    left: { kind: 'back' },
    right: showsHub
      ? {
          kind: 'icon',
          ionicon: 'add-outline',
          sfSymbol: 'plus',
          role: 'primary',
          accessibilityLabel: t('cycleHub.logEntry', {
            defaultValue: 'Log Entry',
          }),
          onPress: () =>
            navigation.navigate('CycleLogModal', { date: selectedDate }),
        }
      : undefined,
  });

  if (cycle.state === 'loadFailed' || isOff) {
    return (
      <View className="flex-1 bg-background">
        {header}
        {isOff ? (
          <View className="flex-1 justify-center items-center px-6 gap-3">
            <Text className="text-text-primary text-lg font-semibold text-center">
              {discreetMode
                ? t('cycleHub.off.discreetTitle', {
                    defaultValue: 'Wellness is turned off',
                  })
                : t('cycleHub.off.title', {
                    defaultValue: 'Cycle tracking is turned off',
                  })}
            </Text>
            <Text className="text-text-secondary text-sm text-center">
              {t('cycleHub.off.description', {
                defaultValue:
                  'Your history is kept. Turn it back on to see it here again.',
              })}
            </Text>
            <Button
              variant="primary"
              className="mt-2 px-6"
              disabled={cycle.isPending}
              onPress={() => cycle.setOn(true)}
            >
              {t('cycleHub.off.turnOn', { defaultValue: 'Turn on' })}
            </Button>
            <Button
              variant="secondary"
              className="px-6"
              onPress={() => navigation.navigate('FeatureSettings')}
            >
              {t('cycleHub.off.openFeatures', {
                defaultValue: 'Open Features',
              })}
            </Button>
          </View>
        ) : (
          <StatusView
            icon="alert-circle"
            iconTone="muted"
            title={t('cycleHub.loadFailed', {
              defaultValue: 'Could not load your settings.',
            })}
            action={{
              label: t('common.retry', { defaultValue: 'Retry' }),
              onPress: cycle.reload,
            }}
          />
        )}
      </View>
    );
  }

  if (!showsHub || isLoading || !settings) {
    return <StatusView loading className="bg-background" />;
  }

  return (
    <View className="flex-1 bg-background">
      {header}

      {/* Header Bar with Segmented Control */}
      <View className="px-4 py-2 bg-background z-10 border-b border-border-subtle">
        <SegmentedControl
          segments={[
            {
              key: 'overview',
              label: t('cycleHub.overview', { defaultValue: 'Overview' }),
            },
            middleTab,
            {
              key: 'history',
              label: t('cycleHub.history', { defaultValue: 'History' }),
            },
          ]}
          activeKey={currentTab}
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
        {currentTab === 'overview' && (
          <View className="gap-3">
            {/* Pregnancy Overview or Cycle Overview */}
            {mode === 'pregnant' ? (
              <PregnancyOverviewView section="overview" />
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
                    centerValue={
                      dayStats.cycleDay !== null
                        ? t('cycleHub.ring.day', {
                            defaultValue: 'Day {{day}}',
                            day: dayStats.cycleDay,
                          })
                        : '—'
                    }
                    centerSub={
                      discreetMode
                        ? undefined
                        : t('cycleHub.ring.dayCycle', {
                            defaultValue: '{{count}}-day cycle',
                            count: cycleStats.avgCycleLength,
                          })
                    }
                  />
                </View>

                {/* Cycle Alerts */}
                {alerts.length > 0 && (
                  <CycleAlerts
                    alerts={alerts.map((a) => ({
                      key: a.key,
                      severity: a.severity,
                      message: a.message,
                      params: a.params,
                    }))}
                  />
                )}

                {/* TTC: fertility summary */}
                {mode === 'ttc' && <FertilityCard date={selectedDate} />}
              </>
            )}
          </View>
        )}

        {currentTab === 'trends' && (
          <View className="gap-3">
            <CycleInsightsView />
          </View>
        )}

        {currentTab === 'tools' && (
          <View className="gap-3">
            <PregnancyOverviewView section="tools" />
          </View>
        )}

        {currentTab === 'history' && (
          <View className="gap-6">
            <CycleCalendarGrid
              initialDate={selectedDate}
              onDayPress={(date) =>
                navigation.navigate('CycleLogModal', { date })
              }
              cycles={cycles}
              logs={logs}
              settings={settings}
              onMonthChange={setVisibleMonth}
            />
            <View className="border-t border-border-subtle" />
            <CycleHistoryList />
          </View>
        )}

        <View className="mt-6 px-2">
          <MedicalDisclaimer />
        </View>
      </ScrollView>
    </View>
  );
};

export default CycleHubScreen;
