import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import { useServerConnection, useServerConfigs, usePreferences, queryClient } from '../hooks';
import DevTools from '../components/DevTools';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { SectionErrorBoundary } from '../components/ScreenErrorBoundary';
import { shareDiagnosticReport, sanitizeQueryKey } from '../services/diagnosticReportService';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { loadLastSyncedTime } from '../services/storage';
import { formatRelativeTime } from '../utils/dateUtils';
import type { DiagnosticQueryState } from '../types/diagnosticReport';
import Constants from 'expo-constants';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { mobileT } from '../localization';
import { addLog } from '../services/LogService';

type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const usesNativeTabs = useNativeIOSTabsActive();

  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  const { isConnected } = useServerConnection();
  const { activeConfig } = useServerConfigs();
  const { preferences: userPreferences } = usePreferences({ enabled: isConnected });
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadLastSyncedTime().then((time) => {
        if (!cancelled) setLastSyncedTime(time);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const syncSubtitle = lastSyncedTime
    ? mobileT('settings.lastSynced', {
        time: formatRelativeTime(new Date(lastSyncedTime)),
      })
    : formatRelativeTime(null);

  const [success, danger, catSlate, catPink, catViolet, catOrange, catCalories, hydration, macroGreen] = useCSSVariable([
    '--color-icon-success',
    '--color-bg-danger',
    '--color-cat-slate',
    '--color-cat-pink',
    '--color-cat-violet',
    '--color-cat-orange',
    '--color-calories',
    '--color-hydration',
    '--color-cat-green',
  ]) as [string, string, string, string, string, string, string, string, string];

  const serverSubtitle = activeConfig ? (
    <View className="flex-row items-center">
      <View
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: isConnected ? success : danger,
          marginEnd: 8,
        }}
      />
      <Text
        className="text-sm text-text-secondary flex-1"
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {activeConfig.url}
      </Text>
    </View>
  ) : (
    mobileT('settings.addServer')
  );

  const handleShareDiagnosticReport = async (): Promise<void> => {
    setIsSharing(true);
    try {
      const queryStates: DiagnosticQueryState[] = queryClient
        .getQueryCache()
        .getAll()
        .map((query) => ({
          queryKey: JSON.stringify(sanitizeQueryKey(query.queryKey)),
          status: query.state.status,
          fetchStatus: query.state.fetchStatus,
          isStale: query.isStale(),
          errorMessage: query.state.error instanceof Error
            ? query.state.error.message
            : query.state.error
              ? String(query.state.error)
              : null,
        }));

      await shareDiagnosticReport({
        isServerConnected: isConnected,
        userPreferences: userPreferences ?? null,
        queryStates,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(
        `[Settings] Failed to share diagnostic report: ${errorMessage}`,
        'ERROR',
      );
      Toast.show({
        type: 'error',
        text1: mobileT('common.error'),
        text2: mobileT('settings.shareFailed'),
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        style={[{ flex: 1 }, usesNativeTabs ? undefined : { paddingTop: insets.top }]}
        contentContainerStyle={{
          ...(!usesNativeTabs ? { paddingTop: 0 } : null),
          paddingBottom: 80 + activeWorkoutBarPadding,
        }}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={usesNativeTabs ? 'automatic' : 'never'}
        automaticallyAdjustsScrollIndicatorInsets={usesNativeTabs}
      >
        <View className={usesNativeTabs ? 'px-4 pb-4' : 'flex-1 p-4'}>
          {!usesNativeTabs && (
            <View className="mb-6">
              <Text className="text-2xl font-bold text-text-primary">
                {mobileT('tabs.settings')}
              </Text>
            </View>
          )}

          <SettingsRow
            icon="server"
            title={mobileT('settings.server')}
            subtitle={serverSubtitle}
            onPress={() => navigation.navigate('ServerSettings')}
            iconColor={catSlate}
            accessibilityLabel={
              activeConfig
                ? mobileT(
                    isConnected
                      ? 'settings.serverAccessibilityConnected'
                      : 'settings.serverAccessibilityFailed',
                  )
                : mobileT('settings.serverAccessibilityMissing')
            }
          />

          <SectionErrorBoundary sectionName="Settings">
            <SettingsRow
              icon="health-data-sync"
              title={mobileT('screens.sync')}
              subtitle={syncSubtitle}
              onPress={() => navigation.navigate('Sync')}
              iconColor={catPink}
            />

            <SettingsRowGroup>
              {isConnected && activeConfig?.authType === 'session' && (
                <SettingsRow
                  icon="fingerprint"
                  title={mobileT('screens.passkeySettings')}
                  onPress={() => navigation.navigate('PasskeySettings')}
                  iconColor={catSlate}
                />
              )}
              {isConnected && (
                <SettingsRow
                  icon="calorie-settings"
                  title={mobileT('screens.calorieSettings')}
                  onPress={() => navigation.navigate('CalorieSettings')}
                  iconColor={catCalories}
                />
              )}
              {isConnected && (
                <SettingsRow
                  icon="food-search-settings"
                  title={mobileT('screens.foodSettings')}
                  onPress={() => navigation.navigate('FoodSettings')}
                  iconColor={catOrange}
                />
              )}
              {isConnected && (
                <SettingsRow
                  icon="dashboard-settings"
                  title={mobileT('screens.dashboardSettings')}
                  onPress={() => navigation.navigate('DashboardSettings')}
                  iconColor={macroGreen}
                />
              )}
              <SettingsRow
                icon="app-settings"
                title={mobileT('screens.appSettings')}
                onPress={() => navigation.navigate('AppSettings')}
                iconColor={catViolet}
              />
            </SettingsRowGroup>

            <SettingsRowGroup>
              <SettingsRow
                icon="whats-new"
                title={mobileT('screens.whatsNew')}
                onPress={() => navigation.navigate('WhatsNew')}
                iconColor={catPink}
              />
              <SettingsRow
                icon="document-text"
                title={mobileT('screens.logs')}
                onPress={() => navigation.navigate('Logs')}
                iconColor={catSlate}
              />
              <SettingsRow
                icon="info-circle"
                title={mobileT('screens.about')}
                onPress={() => navigation.navigate('About')}
                iconColor={hydration}
              />
            </SettingsRowGroup>

            <SettingsRow
              icon="share"
              title={mobileT('settings.shareDiagnostic')}
              onPress={handleShareDiagnosticReport}
              disabled={isSharing}
              iconColor={catSlate}
              rightAccessory={isSharing ? <ActivityIndicator size="small" /> : undefined}
            />
            <Text className="text-text-secondary text-sm px-2 mb-4 mt-2">
              {mobileT('settings.diagnosticDescription')}
            </Text>

            {__DEV__ &&
              (Constants.expoConfig?.extra?.APP_VARIANT === 'development' ||
                Constants.expoConfig?.extra?.APP_VARIANT === 'dev') && (
                <DevTools />
              )}


          </SectionErrorBoundary>
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </>
  );
};

export default SettingsScreen;
