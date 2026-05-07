import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServerConnection, useServerConfigs, usePreferences, queryClient } from '../hooks';
import ConnectionStatus from '../components/ConnectionStatus';
import AppearanceSettings from '../components/AppearanceSettings';
import DevTools from '../components/DevTools';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import * as Application from 'expo-application';
import Icon from '../components/Icon';
import { SectionErrorBoundary } from '../components/ScreenErrorBoundary';
import { shareDiagnosticReport, sanitizeQueryKey } from '../services/diagnosticReportService';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
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
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 + activeWorkoutBarPadding }} contentInsetAdjustmentBehavior="never">
        <View className="flex-1 p-4 pb-20">
          <TouchableOpacity
            className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
            onPress={() => navigation.navigate('ServerSettings')}
            accessibilityLabel="Server settings"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-text-primary">Server</Text>
              <ConnectionStatus
                isConnected={isConnected}
                hasConfig={!!activeConfig}
                variant="inline"
              />
            </View>
            {activeConfig ? (
              <View className="flex-row items-center justify-between mt-2">
                <Text
                  className="text-sm text-text-secondary shrink mr-2"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {activeConfig.url}
                </Text>
                <Icon name="chevron-forward" size={20} color="#999" />
              </View>
            ) : (
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-sm text-text-secondary">Tap to add a server</Text>
                <Icon name="chevron-forward" size={20} color="#999" />
              </View>
            )}
          </TouchableOpacity>

          <SectionErrorBoundary sectionName="Settings">
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={() => navigation.navigate('Sync')}
              activeOpacity={0.7}
            >
              <Text className="text-base font-semibold text-text-primary">Health Data Sync</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {isConnected && (
              <View className="bg-surface rounded-xl mb-4 shadow-sm">
                <TouchableOpacity
                  className="p-4 flex-row items-center justify-between border-b border-border-subtle"
                  onPress={() => navigation.navigate('CalorieSettings')}
                  activeOpacity={0.7}
                >
                  <Text className="text-base font-semibold text-text-primary">Calorie Settings</Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>

                <TouchableOpacity
                  className="p-4 flex-row items-center justify-between"
                  onPress={() => navigation.navigate('FoodSettings')}
                  activeOpacity={0.7}
                >
                  <Text className="text-base font-semibold text-text-primary">Food Search Settings</Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </View>
            )}

            <AppearanceSettings />
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={() => navigation.navigate('Logs')}
              activeOpacity={0.7}
            >
              <Text className="text-base font-semibold text-text-primary">View Logs</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={handleShareDiagnosticReport}
              activeOpacity={0.7}
              disabled={isSharing}
            >
              <Text className="text-base font-semibold text-text-primary">Share Diagnostic Report</Text>
              {isSharing ? (
                <ActivityIndicator size="small" />
              ) : (
                <Icon name="share" size={20} color="#999" />
              )}
            </TouchableOpacity>
            <Text className="text-text-secondary text-sm px-2 mb-4 mt-2">
              Exports a local diagnostic report (app version, sync status, logs).{'\n'}
              No personal health or food data is included. Nothing is sent automatically.
            </Text>

            <TouchableOpacity
              className="bg-surface rounded-xl p-4 mb-4 flex-row items-center justify-between shadow-sm"
              onPress={() => navigation.navigate('About')}
              activeOpacity={0.7}
            >
              <Text className="text-base font-semibold text-text-primary">About</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {__DEV__ &&
              (Constants.expoConfig?.extra?.APP_VARIANT === 'development' ||
                Constants.expoConfig?.extra?.APP_VARIANT === 'dev') && (
                <DevTools />
              )}


            <View className="items-center z-100">
              <Button variant="ghost" onPress={() => setShowPrivacyModal(true)} className="p-0 mb-2">
                Privacy Policy
              </Button>
              <Text className="text-text-muted">Version {Application.nativeApplicationVersion} ({Application.nativeBuildVersion})</Text>
            </View>
          </SectionErrorBoundary>
        </View>
      </ScrollView>

      <PrivacyPolicyModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </View>
  );
};

export default SettingsScreen;
