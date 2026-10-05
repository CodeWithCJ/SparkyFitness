import { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  getVoiceServiceOptions,
  type VoiceInputPreferences,
} from '@workspace/shared';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { usePreferences } from '../hooks/usePreferences';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { useVoicePreferencesRefresh } from '../hooks/useVoicePreferencesRefresh';
import {
  preferencesQueryKey,
  voiceServiceOptionsQueryKey,
} from '../hooks/queryKeys';
import { updatePreferences } from '../services/api/preferencesApi';
import { fetchVoiceServiceOptions } from '../services/api/aiSettingsApi';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import BottomSheetPicker from '../components/BottomSheetPicker';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import type { RootStackScreenProps } from '../types/navigation';

export default function ChatSettingsScreen(
  _props: RootStackScreenProps<'ChatSettings'>
) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const nativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const { preferences, isLoading, isError, refetch } = usePreferences();
  const services = useQuery({
    queryKey: voiceServiceOptionsQueryKey,
    queryFn: fetchVoiceServiceOptions,
    staleTime: 0,
  });
  const { data: chatService, refetch: refetchChat } = useActiveAiServiceSetting(
    { staleTime: 0 }
  );
  const refetchServices = services.refetch;
  const refresh = useCallback(() => {
    void refetch();
    void refetchServices();
    void refetchChat();
  }, [refetch, refetchServices, refetchChat]);
  useVoicePreferencesRefresh(refresh);
  const [choosingAi, setChoosingAi] = useState(false);
  const mutation = useMutation({
    mutationFn: (patch: VoiceInputPreferences) => updatePreferences(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(preferencesQueryKey, data);
      setChoosingAi(false);
    },
    onError: () =>
      Toast.show({
        type: 'error',
        text1: t('voiceSettings.saveFailed', {
          defaultValue: 'Could not save voice settings. Please try again.',
        }),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
  });
  const enabled = preferences?.voice_input_enabled !== false;
  const aiMode = choosingAi || !!preferences?.active_voice_ai_service_id;
  const options = getVoiceServiceOptions(
    services.data ?? [],
    chatService?.id
  ).map((service) => ({
    value: service.id,
    label: `${service.service_name}${
      service.model_name ? ` — ${service.model_name}` : ''
    }${
      service.id === chatService?.id
        ? ` (${t('voiceSettings.chatModel', {
            defaultValue: 'Used for chat',
          })})`
        : ''
    }`,
  }));
  const header = useScreenHeader({
    title: t('voiceSettings.open', { defaultValue: 'Voice settings' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={nativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80,
        }}
        contentInsetAdjustmentBehavior={nativeHeader ? 'automatic' : 'never'}
      >
        {isLoading ? (
          <StatusView inline loading />
        ) : isError || !preferences ? (
          <View className="gap-4">
            <Text className="text-text-secondary">
              {t('voiceSettings.loadFailed', {
                defaultValue: 'Could not load voice settings.',
              })}
            </Text>
            <Button
              onPress={() => {
                void refetch();
              }}
            >
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <SettingsRowGroup>
              <SettingsRow
                title={t('voiceSettings.title', {
                  defaultValue: 'Voice input',
                })}
                subtitleNumberOfLines={0}
                subtitle={t('voiceSettings.syncHint', {
                  defaultValue:
                    'These settings apply to web and mobile. Turning voice input off hides the microphone without changing your model selection.',
                })}
                rightAccessory={
                  <Switch
                    accessibilityLabel={t('voiceSettings.title', {
                      defaultValue: 'Voice input',
                    })}
                    value={enabled}
                    disabled={mutation.isPending}
                    onValueChange={(value) => {
                      setChoosingAi(false);
                      mutation.mutate({ voice_input_enabled: value });
                    }}
                  />
                }
              />
            </SettingsRowGroup>
            {enabled && (
              <View className="bg-surface rounded-xl p-4 gap-4">
                <Text className="text-text-primary font-semibold">
                  {t('voiceSettings.recognition', {
                    defaultValue: 'Recognition',
                  })}
                </Text>
                <View
                  pointerEvents={mutation.isPending ? 'none' : 'auto'}
                  accessibilityState={{ disabled: mutation.isPending }}
                >
                  <SegmentedControl
                    segments={[
                      {
                        key: 'system',
                        label: t('voiceSettings.system', {
                          defaultValue: 'System (default)',
                        }),
                      },
                      {
                        key: 'ai',
                        label: t('voiceSettings.ai', {
                          defaultValue: 'AI transcription',
                        }),
                      },
                    ]}
                    activeKey={aiMode ? 'ai' : 'system'}
                    onSelect={(mode) => {
                      if (mutation.isPending) return;
                      setChoosingAi(mode === 'ai');
                      if (mode === 'system')
                        mutation.mutate({ active_voice_ai_service_id: null });
                    }}
                  />
                </View>
                <Text className="text-sm text-text-secondary">
                  {aiMode
                    ? t('voiceSettings.aiHint', {
                        defaultValue:
                          'Audio is sent to the selected AI provider through your server. Provider charges may apply. Choose a model to enable AI transcription.',
                      })
                    : t('voiceSettings.systemHint', {
                        defaultValue:
                          'Uses your device or browser speech recognizer without a Sparky AI transcription charge. Availability and online processing depend on your device or browser.',
                      })}
                </Text>
                {aiMode && (
                  <>
                    <Text className="text-text-primary font-semibold">
                      {t('voiceSettings.model', {
                        defaultValue: 'Voice model',
                      })}
                    </Text>
                    {services.isLoading ? (
                      <StatusView inline loading />
                    ) : services.isError ? (
                      <View className="gap-3">
                        <Text className="text-text-secondary">
                          {t('voiceSettings.modelsFailed', {
                            defaultValue: 'Could not load voice models.',
                          })}
                        </Text>
                        <Button
                          onPress={() => {
                            void services.refetch();
                          }}
                        >
                          {t('common.retry', { defaultValue: 'Retry' })}
                        </Button>
                      </View>
                    ) : options.length === 0 ? (
                      <Text className="text-text-secondary">
                        {t('voiceSettings.noModels', {
                          defaultValue:
                            'No compatible voice models are enabled. Configure an audio-capable model in AI Service Settings in the web app, then refresh.',
                        })}
                      </Text>
                    ) : (
                      <View
                        pointerEvents={mutation.isPending ? 'none' : 'auto'}
                      >
                        <BottomSheetPicker
                          value={preferences.active_voice_ai_service_id ?? ''}
                          options={options}
                          title={t('voiceSettings.model', {
                            defaultValue: 'Voice model',
                          })}
                          placeholder={t('voiceSettings.chooseModel', {
                            defaultValue: 'Choose a model',
                          })}
                          onSelect={(id) => {
                            if (!mutation.isPending)
                              mutation.mutate({
                                active_voice_ai_service_id: id,
                              });
                          }}
                        />
                      </View>
                    )}
                    {!!preferences.active_voice_ai_service_id &&
                      services.isSuccess &&
                      !options.some(
                        (option) =>
                          option.value ===
                          preferences.active_voice_ai_service_id
                      ) && (
                        <Text className="text-text-secondary">
                          {t('voiceSettings.unavailable', {
                            defaultValue:
                              'The selected voice model is unavailable. Choose another model or switch to System.',
                          })}
                        </Text>
                      )}
                  </>
                )}
              </View>
            )}
            <Text className="text-sm text-text-secondary mt-4">
              {t('voiceSettings.manualSend', {
                defaultValue:
                  'Dictation fills your draft. Review or edit it, then send it yourself.',
              })}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
