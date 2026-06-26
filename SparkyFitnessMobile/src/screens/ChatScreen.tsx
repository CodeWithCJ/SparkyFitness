import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import Clipboard from '@react-native-clipboard/clipboard';
import { useQueryClient } from '@tanstack/react-query';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  ActionBarPrimitive,
  useAuiState,
  type MessageRole,
} from '@assistant-ui/react-native';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import ToolCallCard from '../components/chat/ToolCallCard';
import TypingIndicator from '../components/chat/TypingIndicator';
import MarkdownMessage from '../components/chat/MarkdownMessage';
import { CHAT_SUGGESTIONS } from '../constants/chat';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import { clearAllChatHistory } from '../services/api/chatApi';
import { addLog } from '../services/LogService';
import { useActiveAiServiceSetting, useChatHistory, chatHistoryQueryKey } from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

/** Seed (initial) messages accepted by `useChatRuntime`. */
type InitialMessages = NonNullable<Parameters<typeof useChatRuntime>[0]>['messages'];

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
  initialMessages,
}: {
  baseUrl: string;
  serviceConfigId: string;
  initialMessages: InitialMessages;
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
    // Seed prior history (the runtime ignores changes after mount — see ChatThread's key).
    messages: initialMessages,
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

  // "Thinking" window: an assistant message that's running but hasn't produced
  // any visible content yet (before the first token / tool call). Show the
  // animated typing indicator in place of the empty bubble until output arrives.
  const isThinking = useAuiState((s) => {
    const m = s.message;
    if (m.role !== 'assistant' || m.status?.type !== 'running') return false;
    return !m.content?.some(
      (p) => (p.type === 'text' && p.text.length > 0) || p.type === 'tool-call',
    );
  });

  return (
    <MessagePrimitive.Root
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 12,
      }}
    >
      <View className={`rounded-2xl px-4 py-2 ${isUser ? 'bg-accent-primary' : 'bg-surface border border-border-subtle'}`}>
        {isThinking ? (
          <TypingIndicator />
        ) : (
          <MessagePrimitive.Content
            // User text is plain (white on the accent bubble); assistant text
            // renders as themed markdown.
            renderText={({ part }) =>
              isUser ? (
                <Text className="text-base text-white">{part.text}</Text>
              ) : (
                <MarkdownMessage text={part.text} />
              )
            }
            renderToolCall={({ part }) => <ToolCallCard part={part} />}
          />
        )}
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
                <Text className="text-text-secondary text-xs">Retry</Text>
              </View>
            </ActionBarPrimitive.Reload>
            <ActionBarPrimitive.Copy copyToClipboard={(text) => Clipboard.setString(text)}>
              {({ isCopied }) => (
                <View className="flex-row items-center gap-1">
                  <Icon name={isCopied ? 'checkmark' : 'copy'} size={15} color={muted} />
                  <Text className="text-text-secondary text-xs">{isCopied ? 'Copied' : 'Copy'}</Text>
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
          <View className="bg-accent-primary rounded-full w-10 h-10 items-center justify-center">
            <Icon name="arrow-up" size={20} color="#ffffff" />
          </View>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel>
          <View className="bg-accent-primary rounded-full w-10 h-10 items-center justify-center">
            <Icon name="stop" size={18} color="#ffffff" />
          </View>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  );
}

/**
 * Headless reporter: lifts the thread's running state out to ChatScreen so the
 * header Clear button (outside the runtime provider) can disable while a stream
 * is in flight. Reads `isRunning` from assistant-ui state and pushes it up.
 */
function RunningReporter({ onRunningChange }: { onRunningChange: (running: boolean) => void }) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  useEffect(() => {
    onRunningChange(!!isRunning);
  }, [isRunning, onRunningChange]);
  return null;
}

/** The live thread. Only mounted once baseUrl + serviceConfigId are known. */
function ChatThread({
  baseUrl,
  serviceConfigId,
  initialMessages,
  onRunningChange,
}: {
  baseUrl: string;
  serviceConfigId: string;
  initialMessages: InitialMessages;
  onRunningChange: (running: boolean) => void;
}) {
  const runtime = useSparkyChatRuntime({ baseUrl, serviceConfigId, initialMessages });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RunningReporter onRunningChange={onRunningChange} />
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
  const queryClient = useQueryClient();

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [running, setRunning] = useState(false);
  // Remounting ChatThread by key resets the in-memory runtime (it ignores
  // `messages` changes after mount), so bump this to clear the thread.
  const [threadKey, setThreadKey] = useState(0);
  const { data: setting, isLoading: loadingSetting } = useActiveAiServiceSetting();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled) return;
        setBaseUrl(config ? normalizeUrl(config.url) : null);
      } catch (error) {
        // getActiveServerConfig re-throws on storage failure; without this the
        // spinner would hang forever. Fall through to the "no server" branch.
        if (cancelled) return;
        addLog('Failed to load active server config', 'ERROR', [String(error)]);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Clearing needs only an authenticated server, not an active AI provider.
  const { data: historyData, isLoading: loadingHistory } = useChatHistory({ enabled: !!baseUrl });
  const initialMessages = historyData ?? [];

  const serviceConfigId = setting?.id ?? null;

  const handleClear = () => {
    Alert.alert(
      'Clear chat',
      'This permanently deletes your Sparky chat history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllChatHistory();
              // Reset the raw (pre-select) cache so a remount seeds an empty thread.
              queryClient.setQueryData(chatHistoryQueryKey, []);
              setThreadKey((k) => k + 1);
            } catch (error) {
              addLog('Failed to clear chat history', 'ERROR', [
                error instanceof Error ? error.message : String(error),
              ]);
              Toast.show({
                type: 'error',
                text1: 'Could not clear chat',
                text2: 'Please try again.',
              });
            }
          },
        },
      ]
    );
  };

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
        {/* Clear chat. Disabled while a stream runs so the server's in-flight
            onFinish save can't resurrect the exchange after the DELETE. */}
        {baseUrl ? (
          <Button
            variant="ghost"
            onPress={handleClear}
            disabled={running}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 ml-auto"
          >
            <Icon name="trash" size={20} color={accent} />
          </Button>
        ) : null}
      </View>

      {/* keyboard-controller's reworked KeyboardAvoidingView supports `padding`
          on both platforms (RN-core's needs `undefined` on Android, but this is
          not that component). Padding shrinks the message list by the keyboard
          height so the composer stays pinned just above the keyboard. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loadingConfig || loadingSetting || loadingHistory ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : !baseUrl ? (
          <Centered text="No active server config. Set one up in Settings first." />
        ) : !serviceConfigId ? (
          <Centered text="No active AI provider. Configure one in the web app first." />
        ) : (
          <ChatThread
            key={threadKey}
            baseUrl={baseUrl}
            serviceConfigId={serviceConfigId}
            initialMessages={initialMessages}
            onRunningChange={setRunning}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
