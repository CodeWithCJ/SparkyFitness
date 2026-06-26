import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  ActionBarPrimitive,
  type MessageRole,
} from '@assistant-ui/react-native';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import ToolCallCard from '../components/chat/ToolCallCard';
import { CHAT_SUGGESTIONS } from '../constants/chat';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import { addLog } from '../services/LogService';
import { useActiveAiServiceSetting } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

/**
 * Sparky chat: the assistant-ui + AI SDK runtime wired to the server's
 * streaming endpoint (`/api/chat/stream`).
 *
 * The transport uses `expo/fetch` so response bodies stream incrementally in
 * React Native (the global fetch buffers them). The server emits the AI SDK UI
 * message stream protocol via `pipeUIMessageStreamToResponse`, which is what
 * `AssistantChatTransport` consumes. `service_config_id` identifies the user's
 * active AI provider — the server requires it to build the model.
 */

/** Builds the assistant-ui runtime bound to our streaming endpoint. */
function useSparkyChatRuntime({
  baseUrl,
  serviceConfigId,
}: {
  baseUrl: string;
  serviceConfigId: string;
}) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${baseUrl}/api/chat/stream`,
        // expo/fetch exposes a real ReadableStream body; RN's global fetch does not.
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        // Resolved per request so auth/proxy headers stay current.
        headers: async () => {
          const config = await getActiveServerConfig();
          return config
            ? { ...proxyHeadersToRecord(config.proxyHeaders), ...getAuthHeaders(config) }
            : {};
        },
        // Merged into the request body alongside `messages`; the server reads it.
        body: { service_config_id: serviceConfigId },
      }),
    [baseUrl, serviceConfigId]
  );

  // Thread-level safety net: a per-message error box can't render if the stream
  // fails before any assistant message exists, so surface a toast too. (AI SDK 6
  // redacts mid-stream server errors to a generic message on the client unless the
  // server supplies an onError mapper to its stream response — out of mobile scope.)
  return useChatRuntime({
    transport,
    onError: (error: Error) => {
      addLog('Chat stream error', 'ERROR', [error?.message ?? String(error)]);
      Toast.show({
        type: 'error',
        text1: 'Chat error',
        text2: error?.message || 'Something went wrong. Tap retry to try again.',
      });
    },
  });
}

/** A single chat bubble. Rendered inside the message context. */
function MessageBubble({ role }: { role: MessageRole }) {
  const isUser = role === 'user';
  const [dangerBg, dangerIcon, dangerText, muted] = useCSSVariable([
    '--color-bg-danger-subtle',
    '--color-icon-danger',
    '--color-text-danger-subtle',
    '--color-text-muted',
  ]) as [string, string, string, string];

  return (
    <MessagePrimitive.Root
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 12,
      }}
    >
      <View className={`rounded-2xl px-4 py-2 ${isUser ? 'bg-accent-primary' : 'bg-surface'}`}>
        <MessagePrimitive.Content
          renderText={({ part }) => (
            <Text className={`text-base ${isUser ? 'text-white' : 'text-text-primary'}`}>
              {part.text}
            </Text>
          )}
          renderToolCall={({ part }) => <ToolCallCard part={part} />}
        />
      </View>

      {/* Error box + actions sit below the bubble and only apply to assistant
          messages. ErrorPrimitive.Root self-gates (renders null with no error). */}
      <MessagePrimitive.If assistant>
        <ErrorPrimitive.Root
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: dangerBg,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: 6,
          }}
        >
          <Icon name="alert-circle" size={16} color={dangerIcon} />
          <ErrorPrimitive.Message style={{ flex: 1, color: dangerText, fontSize: 13 }} />
        </ErrorPrimitive.Root>

        <MessagePrimitive.If last running={false}>
          <View className="flex-row gap-4 mt-1.5 ml-1">
            <ActionBarPrimitive.Reload>
              <View className="flex-row items-center gap-1">
                <Icon name="sync" size={15} color={muted} />
                <Text className="text-text-muted text-xs">Retry</Text>
              </View>
            </ActionBarPrimitive.Reload>
            <ActionBarPrimitive.Copy>
              {({ isCopied }) => (
                <View className="flex-row items-center gap-1">
                  <Icon name={isCopied ? 'checkmark' : 'copy'} size={15} color={muted} />
                  <Text className="text-text-muted text-xs">{isCopied ? 'Copied' : 'Copy'}</Text>
                </View>
              )}
            </ActionBarPrimitive.Copy>
          </View>
        </MessagePrimitive.If>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}

/** The bottom input row. ComposerInput/Send manage their own state + actions. */
function Composer() {
  const [muted, raised, textPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-raised',
    '--color-text-primary',
  ]) as [string, string, string];

  return (
    <ComposerPrimitive.Root
      style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8 }}
    >
      <ComposerPrimitive.Input
        placeholder="Message Sparky…"
        placeholderTextColor={muted}
        autoFocus
        multiline
        style={{
          flex: 1,
          color: textPrimary,
          backgroundColor: raised,
          borderRadius: 20,
          paddingHorizontal: 16,
          paddingVertical: 10,
          maxHeight: 120,
          fontSize: 16,
        }}
      />
      {/* ThreadPrimitive.If is the running-aware conditional (ComposerPrimitive.If
          is not): show Send when idle, swap to a Stop button while streaming. */}
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send>
          <View className="bg-accent-primary rounded-full px-4 h-11 items-center justify-center">
            <Text className="text-white font-semibold">Send</Text>
          </View>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel>
          <View className="bg-accent-primary rounded-full w-11 h-11 items-center justify-center">
            <Icon name="stop" size={18} color="#ffffff" />
          </View>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  );
}

/** The live thread. Only mounted once baseUrl + serviceConfigId are known. */
function ChatThread({ baseUrl, serviceConfigId }: { baseUrl: string; serviceConfigId: string }) {
  const runtime = useSparkyChatRuntime({ baseUrl, serviceConfigId });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <ThreadPrimitive.Empty>
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-text-muted text-center text-base mb-6">
                Ask Sparky anything about your nutrition, exercise, or goals.
              </Text>
              {/* ThreadPrimitive.Suggestion IS the Pressable, so its child must be a
                  non-touchable styled View (nested pressables swallow touches). */}
              <View className="w-full gap-2">
                {CHAT_SUGGESTIONS.map((prompt) => (
                  <ThreadPrimitive.Suggestion key={prompt} prompt={prompt} send clearComposer>
                    <View className="bg-surface border border-border-subtle rounded-2xl px-4 py-3">
                      <Text className="text-text-primary text-sm text-center">{prompt}</Text>
                    </View>
                  </ThreadPrimitive.Suggestion>
                ))}
              </View>
            </View>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
          >
            {({ message }) => <MessageBubble role={message.role} />}
          </ThreadPrimitive.Messages>
        </View>

        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center p-8">
      <Text className="text-text-muted text-center text-base">{text}</Text>
    </View>
  );
}

export default function ChatScreen({ navigation }: RootStackScreenProps<'Chat'>) {
  const insets = useSafeAreaInsets();
  const accent = useCSSVariable('--color-accent-primary') as string;

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const { data: setting, isLoading: loadingSetting } = useActiveAiServiceSetting();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await getActiveServerConfig();
      if (cancelled) return;
      setBaseUrl(config ? normalizeUrl(config.url) : null);
      setLoadingConfig(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const serviceConfigId = setting?.id ?? null;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 pb-2 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="py-0 px-0 mr-2"
        >
          <Icon name="chevron-back" size={22} color={accent} />
        </Button>
        <Text className="text-2xl font-bold text-text-primary">Sparky</Text>
      </View>

      {/* keyboard-controller's reworked KeyboardAvoidingView supports `padding`
          on both platforms (RN-core's needs `undefined` on Android, but this is
          not that component). Padding shrinks the message list by the keyboard
          height so the composer stays pinned just above the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loadingConfig || loadingSetting ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : !baseUrl ? (
          <Centered text="No active server config. Set one up in Settings first." />
        ) : !serviceConfigId ? (
          <Centered text="No active AI provider. Configure one in the web app first." />
        ) : (
          <ChatThread baseUrl={baseUrl} serviceConfigId={serviceConfigId} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
