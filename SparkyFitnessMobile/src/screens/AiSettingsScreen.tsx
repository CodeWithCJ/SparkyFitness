import Button from '../components/ui/Button';
import { useChatMcpServers } from '../hooks/useChatMcpServers';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { isOnDeviceLabelScanAvailable } from '../services/onDeviceLabelScan';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type AiSettingsScreenProps = RootStackScreenProps<'AiSettings'>;

function ToggleCard({
  title,
  description,
  value,
  onValueChange,
  testID,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  return (
    <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
      <View className="flex-row justify-between items-center">
        <Text className="text-base font-semibold text-text-primary flex-shrink">
          {title}
        </Text>
        <Switch
          testID={testID}
          accessibilityLabel={title}
          onValueChange={onValueChange}
          value={value}
        />
      </View>
      <Text className="text-text-secondary text-sm mt-4">{description}</Text>
    </View>
  );
}

const AiSettingsScreen: React.FC<AiSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const {
    servers,
    savingServerIds,
    save,
    isError: serversError,
    isLoading: serversLoading,
    refetch,
  } = useChatMcpServers();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const {
    data: provider,
    isLoading,
    isError,
  } = useActiveAiServiceSetting({
    throwOnFailure: true,
  });

  const onDeviceLabelScanEnabled = useAppPreferencesStore(
    (s) => s.onDeviceLabelScanEnabled
  );
  const setOnDeviceLabelScanEnabled = useAppPreferencesStore(
    (s) => s.setOnDeviceLabelScanEnabled
  );
  const onDeviceAvailable = useMemo(() => isOnDeviceLabelScanAvailable(), []);
  const header = useScreenHeader({
    title: t('screens.aiSettings', { defaultValue: 'AI' }),
    left: { kind: 'back' },
  });

  const providerText = isLoading
    ? t('aiSettings.server.loading', { defaultValue: 'Checking…' })
    : isError
      ? t('aiSettings.server.error', {
          defaultValue: 'Could not check the AI provider.',
        })
      : provider
        ? `${provider.service_name}${provider.model_name ? ` · ${provider.model_name}` : ''}`
        : t('aiSettings.server.none', {
            defaultValue: 'No AI provider is configured',
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
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {serversLoading && (
          <Text className="text-text-secondary text-sm">
            {t('aiSettings.chatMcp.loading', {
              defaultValue: 'Loading outside tools…',
            })}
          </Text>
        )}
        {serversError && (
          <View className="mb-4 gap-3">
            <Text
              accessibilityRole="alert"
              className="text-icon-danger text-sm"
            >
              {t('aiSettings.chatMcp.loadError', {
                defaultValue: 'Could not load outside tools.',
              })}
            </Text>
            <Button onPress={() => void refetch()}>
              {t('aiSettings.chatMcp.retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          </View>
        )}
        {servers.length > 0 && (
          <View testID="chat-mcp-servers-section" className="mb-6">
            <Text className="text-text-primary text-base font-semibold mb-1">
              {t('aiSettings.chatMcp.title', {
                defaultValue: 'Outside tools',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mb-3">
              {t('aiSettings.chatMcp.description', {
                defaultValue:
                  'Your admin added these services from outside SparkyFitness. When one is on, Sparky can send it parts of your chat and read what it sends back. Each is off until you turn it on.',
              })}
            </Text>
            {servers.map((server) => {
              const label = t('aiSettings.chatMcp.allow', {
                defaultValue: 'Let Sparky use {{name}}',
                name: server.name,
              });
              return (
                <View
                  key={server.id}
                  className="bg-surface rounded-xl p-3 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-shrink">
                    <Text className="text-text-primary text-base">{label}</Text>
                    {server.send_user_id && (
                      <Text className="text-text-secondary text-sm">
                        {t('aiSettings.chatMcp.accountId', {
                          defaultValue: 'Sees your account ID.',
                        })}
                      </Text>
                    )}
                  </View>
                  <Switch
                    testID={`chat-mcp-server-switch-${server.id}`}
                    accessibilityLabel={label}
                    value={server.enabled}
                    disabled={savingServerIds.includes(server.id)}
                    onValueChange={(enabled) =>
                      save({
                        server_id: server.id,
                        enabled,
                        send_user_id: server.send_user_id,
                      })
                    }
                  />
                </View>
              );
            })}
          </View>
        )}
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('aiSettings.server.title', { defaultValue: 'Server AI provider' })}
        </Text>
        <View className="bg-surface rounded-xl p-3 mb-6 shadow-sm">
          <Text
            testID="ai-settings-provider"
            className="text-text-primary text-base"
          >
            {providerText}
          </Text>
          <Text className="text-text-secondary text-sm mt-2">
            {t('aiSettings.server.description', {
              defaultValue:
                'Used for label scans unless an on-device option below handles them. Providers are set up in the web app.',
            })}
          </Text>
        </View>

        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('aiSettings.onDevice.title', {
            defaultValue: 'On-device (Apple Intelligence)',
          })}
        </Text>
        {onDeviceAvailable ? (
          <>
            <Text className="text-text-secondary text-sm mb-3">
              {t('aiSettings.onDevice.description', {
                defaultValue:
                  'These run on this phone. Anything the on-device model cannot handle falls back to the server provider.',
              })}
            </Text>
            <ToggleCard
              testID="ai-label-scan-switch"
              title={t('aiSettings.onDevice.labelScan.title', {
                defaultValue: 'Scan Labels On Device',
              })}
              description={t('aiSettings.onDevice.labelScan.description', {
                defaultValue:
                  'Read nutrition labels with Apple Intelligence on this device. If it cannot read a label, the server AI provider is used instead.',
              })}
              value={onDeviceLabelScanEnabled}
              onValueChange={setOnDeviceLabelScanEnabled}
            />
          </>
        ) : (
          <Text className="text-text-secondary text-sm">
            {t('aiSettings.onDevice.unavailable', {
              defaultValue:
                'Not available on this device. It needs iOS 27 or later with Apple Intelligence turned on and ready.',
            })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

export default AiSettingsScreen;
