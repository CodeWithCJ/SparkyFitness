import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
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
import { loadLastSyncedTime } from '../services/storage';
import { formatRelativeTime } from '../utils/dateUtils';
import type { DiagnosticQueryState } from '../types/diagnosticReport';
import Constants from 'expo-constants';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type SettingsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();

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
    ? `Last synced ${formatRelativeTime(new Date(lastSyncedTime))}`
    : 'Never synced';

  const [success, danger, catSlate, catPink, catViolet, catOrange, catCalories, hydration] = useCSSVariable([
    '--color-icon-success',
    '--color-bg-danger',
    '--color-cat-slate',
    '--color-cat-pink',
    '--color-cat-violet',
    '--color-cat-orange',
    '--color-calories',
    '--color-hydration',
  ]) as [string, string, string, string, string, string, string, string];

  const serverSubtitle = activeConfig ? (
    <View className="flex-row items-center">
      <View
        className="w-2 h-2 rounded-full mr-2"
        style={{ backgroundColor: isConnected ? success : danger }}
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
    'Tap to add a server'
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
      Toast.show({ type: 'error', text1: 'Error', text2: `Failed to share diagnostic report: ${errorMessage}` });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        style={[{ flex: 1 }, Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }]}
        contentContainerStyle={{
          ...(Platform.OS !== 'ios' ? { paddingTop: 0 } : null),
          paddingBottom: 80 + activeWorkoutBarPadding,
        }}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets={Platform.OS === 'ios'}
      >
        <View className={Platform.OS === 'ios' ? 'px-4 pb-4' : 'flex-1 p-4'}>
          {Platform.OS !== 'ios' && (
            <View className="mb-6">
              <Text className="text-2xl font-bold text-text-primary">Settings</Text>
            </View>
          )}

          <SettingsRow
            icon="server"
            title="Server"
            subtitle={serverSubtitle}
            onPress={() => navigation.navigate('ServerSettings')}
            iconColor={catSlate}
            accessibilityLabel={
              activeConfig
                ? `Server settings. ${isConnected ? 'Connected' : 'Connection failed'}.`
                : 'Server settings. No server configured.'
            }
          />

          <SectionErrorBoundary sectionName="Settings">
            <SettingsRow
              icon="health-data-sync"
              title="Health Data Sync"
              subtitle={syncSubtitle}
              onPress={() => navigation.navigate('Sync')}
              iconColor={catPink}
            />

            <SettingsRowGroup>
              {isConnected && (
                <SettingsRow
                  icon="calorie-settings"
                  title="Calorie Settings"
                  onPress={() => navigation.navigate('CalorieSettings')}
                  iconColor={catCalories}
                />
              )}
              {isConnected && (
                <SettingsRow
                  icon="food-search-settings"
                  title="Food Settings"
                  onPress={() => navigation.navigate('FoodSettings')}
                  iconColor={catOrange}
                />
              )}
              <SettingsRow
                icon="app-settings"
                title="App Settings"
                onPress={() => navigation.navigate('AppSettings')}
                iconColor={catViolet}
              />
            </SettingsRowGroup>

            <SettingsRowGroup>
              <SettingsRow
                icon="sparkle"
                title="What's New"
                onPress={() => navigation.navigate('WhatsNew')}
                iconColor={catPink}
              />
              <SettingsRow
                icon="document-text"
                title="View Logs"
                onPress={() => navigation.navigate('Logs')}
                iconColor={catSlate}
              />
              <SettingsRow
                icon="info-circle"
                title="About"
                onPress={() => navigation.navigate('About')}
                iconColor={hydration}
              />
            </SettingsRowGroup>

            <SettingsRow
              icon="share"
              title="Share Diagnostic Report"
              onPress={handleShareDiagnosticReport}
              disabled={isSharing}
              iconColor={catSlate}
              rightAccessory={isSharing ? <ActivityIndicator size="small" /> : undefined}
            />
            <Text className="text-text-secondary text-sm px-2 mb-4 mt-2">
              Exports a local diagnostic report (app version, sync status, logs).
              No personal health or food data is included. Nothing is sent automatically.
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
