import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type MessageRole,
} from '@assistant-ui/react-native';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import { useActiveAiServiceSetting } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

/**
 * Dev-only "Layer C" scaffold: the full assistant-ui + AI SDK v6 chat runtime
 * wired to the server's streaming endpoint (`/api/chat/stream`).
 *
 * The transport uses `expo/fetch` so response bodies stream incrementally in RN
 * (global fetch buffers them — see StreamProbeScreen). The server emits the AI
 * SDK UI message stream protocol via `pipeUIMessageStreamToResponse`, which is
 * exactly what `AssistantChatTransport` consumes.
 *
 * This proves the chosen libraries work end to end. The real chat feature can
 * replace the minimal UI below (built from headless primitives) with styled
 * components, history, provider switching, etc.
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

  return useChatRuntime({ transport });
}

/** A single chat bubble. Rendered inside MessageByIndexProvider context. */
function MessageBubble({ role }: { role: MessageRole }) {
  const isUser = role === 'user';
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
          renderToolCall={({ part }) => (
            <Text className="text-text-muted text-xs italic">🔧 {part.toolName}</Text>
          )}
        />
      </View>
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
      <ComposerPrimitive.Send>
        <View className="bg-accent-primary rounded-full px-4 h-11 items-center justify-center">
          <Text className="text-white font-semibold">Send</Text>
        </View>
      </ComposerPrimitive.Send>
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
              <Text className="text-text-muted text-center text-base">
                Ask Sparky anything.{'\n'}Replies stream token by token via expo/fetch.
              </Text>
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
  const { data: setting, isLoading: loadingSetting } = useActiveAiServiceSetting({
    staleTime: 0,
  });

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
        <Text className="text-2xl font-bold text-text-primary">Chat (Layer C)</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
