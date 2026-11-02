import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputProps,
} from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { getLocales } from 'expo-localization';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from 'react-native-keyboard-controller';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import Clipboard from '@react-native-clipboard/clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  ActionBarPrimitive,
  useAui,
  useAuiEvent,
  useAuiState,
  type Attachment,
  type MessageRole,
} from '@assistant-ui/react-native';
import {
  useChatRuntime,
  AssistantChatTransport,
} from '@assistant-ui/react-ai-sdk';
import { ASK_USER_TOOL_NAME } from '@workspace/shared';
import Icon from '../components/Icon';
import ActionSheet, { type ActionSheetRef } from '../components/ActionSheet';
import SafeImage from '../components/SafeImage';
import ImageLightbox from '../components/ImageLightbox';
import AskUserToolCard from '../components/chat/AskUserToolCard';
import ToolCallCard from '../components/chat/ToolCallCard';
import TypingIndicator from '../components/chat/TypingIndicator';
import MarkdownMessage from '../components/chat/MarkdownMessage';
import VoiceWaveform from '../components/chat/VoiceWaveform';
import AiVoiceDictationButton from '../components/chat/AiVoiceDictationButton';
import { useImageLightbox } from '../hooks/useImageLightbox';
import { useVoicePreferencesRefresh } from '../hooks/useVoicePreferencesRefresh';
import {
  useVoiceInputLifecycle,
  type VoiceCancellationReason,
} from '../hooks/useVoiceInputLifecycle';
import { CHAT_SUGGESTIONS } from '../constants/chat';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import { clearAllChatHistory } from '../services/api/chatApi';
import { addLog } from '../services/LogService';
import {
  MAX_CHAT_ATTACHMENTS,
  pickChatImageFromCamera,
  pickChatImagesFromLibrary,
  type PickedChatImage,
} from '../utils/pickImage';
import { resolveSpeechLocale } from '../utils/speechLocale';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  useActiveAiServiceSetting,
  useChatHistory,
  usePreferences,
  chatHistoryQueryKey,
} from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

/** Seed (initial) messages accepted by `useChatRuntime`. */
type InitialMessages = NonNullable<
  Parameters<typeof useChatRuntime>[0]
>['messages'];

/**
 * `ThreadPrimitive.Messages` renders a plain FlatList and spreads any extra props
 * onto it, but its prop type omits `ref`. Re-type it so we can attach a FlatList
 * ref (used for auto-scroll). Under React 19 a `ref` on a function component is a
 * regular prop, so it rides the spread through to the inner FlatList.
 */
const ThreadMessages = ThreadPrimitive.Messages as React.ComponentType<
  React.ComponentProps<typeof ThreadPrimitive.Messages> & {
    ref?: React.Ref<FlatList>;
  }
>;

const IOS_SMALL_NATIVE_HEADER_HEIGHT = 44;
const CHAT_KEYBOARD_EXTRA_SPACING = 12;
// How close (px) to the bottom still counts as "at the bottom" for auto-scroll.
const SCROLL_PIN_THRESHOLD = 40;

const EMPTY_HEADERS: Record<string, string> = {};
function getDirectImageSource(uri: string) {
  return uri ? { uri, headers: EMPTY_HEADERS } : null;
}

function getAttachmentImageUri(attachment: Attachment): string | null {
  if (attachment.type !== 'image') return null;
  for (const part of attachment.content ?? []) {
    if (part.type === 'image' && typeof part.image === 'string' && part.image) {
      return part.image;
    }
    if (part.type === 'file' && typeof part.data === 'string' && part.data) {
      return part.data;
    }
  }
  return null;
}

function ChatKeyboardAvoidingView(
  props: React.ComponentProps<typeof RNKeyboardAvoidingView>
) {
  if (Platform.OS === 'ios') {
    return <RNKeyboardAvoidingView {...props} />;
  }

  return <KeyboardControllerAvoidingView {...props} />;
}

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
  conversationId,
  initialMessages,
}: {
  baseUrl: string;
  serviceConfigId: string;
  conversationId: string;
  initialMessages: InitialMessages;
}) {
  const { t } = useTranslation();
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
            ? {
                ...proxyHeadersToRecord(config.proxyHeaders),
                ...getAuthHeaders(config),
              }
            : {};
        },
        // Merged into the request body alongside `messages`; the server reads it.
        body: { service_config_id: serviceConfigId, conversationId },
      }),
    [baseUrl, serviceConfigId, conversationId]
  );

  // Thread-level safety net: a per-message error box can't render if the stream
  // fails before any assistant message exists, so surface a toast too. The server's
  // stream onError mapper passes provider error messages through, so this shows them.
  return useChatRuntime({
    transport,
    // Seed prior history (the runtime ignores changes after mount — see ChatThread's key).
    messages: initialMessages,
    onError: (error: Error) => {
      addLog('Chat stream error', 'ERROR', [error?.message ?? String(error)]);
      Toast.show({
        type: 'error',
        text1: t('chat.error', { defaultValue: 'Chat error' }),
        text2:
          error?.message ||
          t('chat.errorRetry', {
            defaultValue: 'Something went wrong. Tap retry to try again.',
          }),
      });
    },
  });
}

/** A single chat bubble. Rendered inside the message context. */
function MessageBubble({
  role,
  onOpenLightbox,
}: {
  role: MessageRole;
  onOpenLightbox: (images: string[], index?: number) => void;
}) {
  const { t } = useTranslation();
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
      (p) => (p.type === 'text' && p.text.length > 0) || p.type === 'tool-call'
    );
  });

  // Only the message currently being generated should fade in new tokens.
  // Settled history renders immediately and, crucially, skips the native fade
  // animator — its post-render setSpan triggers checkForResize() and NPE-crashes
  // (Android) on a recycled FlatList cell whose layoutParams have gone null.
  const isStreaming = useAuiState(
    (s) =>
      s.message.role === 'assistant' && s.message.status?.type === 'running'
  );

  const messageAttachments = useAuiState((s) =>
    s.message.role === 'user' ? s.message.attachments : undefined
  );

  const hasText = useAuiState((s) =>
    s.message.content.some(
      (part) => part.type === 'text' && part.text.trim().length > 0
    )
  );

  const messageImageUris = useMemo(() => {
    if (!isUser || !messageAttachments) return [];
    return messageAttachments
      .map(getAttachmentImageUri)
      .filter((uri): uri is string => Boolean(uri));
  }, [isUser, messageAttachments]);

  const showBubble = !isUser || messageImageUris.length === 0 || hasText;
  const showUserCopy = messageImageUris.length === 0 || hasText;

  return (
    <MessagePrimitive.Root
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 12,
      }}
    >
      {isUser && messageImageUris.length > 0 && (
        <View
          className={`flex-row flex-wrap justify-end gap-1.5 ${showBubble ? 'mb-1.5' : ''}`}
        >
          {messageImageUris.map((uri, index) => (
            <Pressable
              key={`${index}:${uri.slice(0, 32)}`}
              testID={`message-attachment-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t('chat.attachments.previewPhoto', {
                defaultValue: 'Preview photo',
              })}
              onPress={() => onOpenLightbox(messageImageUris, index)}
              style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
            >
              <SafeImage
                source={getDirectImageSource(uri)}
                style={{
                  width: messageImageUris.length === 1 ? 180 : 120,
                  height: messageImageUris.length === 1 ? 180 : 120,
                  borderRadius: 16,
                }}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </View>
      )}

      {showBubble && (
        <View
          testID={isUser ? 'user-message-bubble' : 'assistant-message-bubble'}
          className={`rounded-2xl px-4 py-2 ${isUser ? 'bg-accent-primary' : 'bg-surface border border-border-subtle'}`}
        >
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
                  <MarkdownMessage text={part.text} streaming={isStreaming} />
                )
              }
              renderToolCall={({ part }) =>
                part.toolName === ASK_USER_TOOL_NAME ? (
                  <AskUserToolCard part={part} />
                ) : (
                  <ToolCallCard part={part} />
                )
              }
            />
          )}
        </View>
      )}

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
          <ErrorPrimitive.Message
            style={{ flex: 1, color: dangerText, fontSize: 13 }}
          />
        </ErrorPrimitive.Root>

        {/* Actions appear under every settled (non-running) assistant message:
            Copy on all of them, Retry only on the latest reply. */}
        <MessagePrimitive.If running={false}>
          <View className="flex-row gap-4 mt-1.5 ml-1">
            <MessagePrimitive.If last>
              <ActionBarPrimitive.Reload>
                <View className="flex-row items-center gap-1">
                  <Icon name="sync" size={15} color={muted} />
                  <Text className="text-text-secondary text-xs">
                    {t('chat.retry', { defaultValue: 'Retry' })}
                  </Text>
                </View>
              </ActionBarPrimitive.Reload>
            </MessagePrimitive.If>
            <ActionBarPrimitive.Copy
              copyToClipboard={(text) => Clipboard.setString(text)}
            >
              {({ isCopied }) => (
                <View className="flex-row items-center gap-1">
                  <Icon
                    name={isCopied ? 'checkmark' : 'copy'}
                    size={15}
                    color={muted}
                  />
                  <Text className="text-text-secondary text-xs">
                    {isCopied
                      ? t('chat.copied', { defaultValue: 'Copied' })
                      : t('chat.copy', { defaultValue: 'Copy' })}
                  </Text>
                </View>
              )}
            </ActionBarPrimitive.Copy>
          </View>
        </MessagePrimitive.If>
      </MessagePrimitive.If>

      {/* User messages aren't selectable either, so give them their own Copy
          button — right-aligned to sit under the right-aligned user bubble. */}
      {showUserCopy && (
        <MessagePrimitive.If user>
          <View className="flex-row justify-end mt-1.5 mr-1">
            <ActionBarPrimitive.Copy
              copyToClipboard={(text) => Clipboard.setString(text)}
            >
              {({ isCopied }) => (
                <View className="flex-row items-center gap-1">
                  <Icon
                    name={isCopied ? 'checkmark' : 'copy'}
                    size={15}
                    color={muted}
                  />
                  <Text className="text-text-secondary text-xs">
                    {isCopied
                      ? t('chat.copied', { defaultValue: 'Copied' })
                      : t('chat.copy', { defaultValue: 'Copy' })}
                  </Text>
                </View>
              )}
            </ActionBarPrimitive.Copy>
          </View>
        </MessagePrimitive.If>
      )}
    </MessagePrimitive.Root>
  );
}

type LocalComposerInputProps = Omit<
  TextInputProps,
  'value' | 'onChangeText'
> & {
  /** Focus the input once the screen's push transition has settled. */
  autoFocusReady: boolean;
};

function LocalComposerInput({
  autoFocusReady,
  ...props
}: LocalComposerInputProps) {
  const aui = useAui();
  const inputRef = useRef<TextInput>(null);
  const composerText = useAuiState((s) => s.composer.text);
  const [localText, setLocalText] = useState(composerText);
  const localTextRef = useRef(composerText);
  const pendingLocalTextsRef = useRef<string[]>([]);

  // Focus once the screen's push transition has settled rather than via
  // `autoFocus`. Focusing mid-transition presents the keyboard over the
  // still-animating screen, which renders the keyboard backdrop a dark grey for
  // the whole slide-in before it snaps to the normal light keyboard. The parent
  // flips `autoFocusReady` on the entering `transitionEnd`; it may already be
  // true on mount when slow config/history loads keep the composer unmounted
  // past the transition, in which case we focus immediately.
  useEffect(() => {
    if (autoFocusReady) inputRef.current?.focus();
  }, [autoFocusReady]);

  const applyLocalText = useCallback((value: string) => {
    localTextRef.current = value;
    setLocalText(value);
  }, []);

  // Sync the locally-controlled input from the external assistant-ui composer
  // store, but drop echoes of the user's own keystrokes (tracked in the pending
  // queue) so we only adopt store-driven changes (suggestions, resets).
  useEffect(() => {
    const pendingLocalTexts = pendingLocalTextsRef.current;
    const index = pendingLocalTexts.indexOf(composerText);
    if (index !== -1) {
      pendingLocalTexts.splice(0, index + 1);
      return;
    }

    if (composerText !== localTextRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applyLocalText(composerText);
    }
  }, [applyLocalText, composerText]);

  useAuiEvent('composer.send', () => {
    pendingLocalTextsRef.current = [];
    applyLocalText('');
  });

  const handleChangeText = useCallback(
    (value: string) => {
      pendingLocalTextsRef.current.push(value);
      applyLocalText(value);
      aui.composer().setText(value);
    },
    [applyLocalText, aui]
  );

  return (
    <TextInput
      ref={inputRef}
      {...props}
      value={localText}
      onChangeText={handleChangeText}
    />
  );
}

/**
 * System dictation button: taps the platform speech recognizer (Google/Samsung
 * on Android, SFSpeechRecognizer on iOS) and streams the transcript into the
 * composer. The OS recognizer may use its own cloud service; no configured
 * Sparky AI provider is called. Sending stays manual for proofreading.
 */
function SystemVoiceDictationButton({
  textPrimary,
  recording,
  busy,
  onRecordingChange,
  onBusyChange,
  onVolumeChange,
}: {
  textPrimary: string;
  recording: boolean;
  busy: boolean;
  onRecordingChange: (recording: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onVolumeChange: (volume: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  // Text already present when dictation starts; final segments are appended.
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  // Latest composer text kept in a ref, so press callbacks can capture it
  // as the base that dictation appends to.
  const composerText = useAuiState((s) => s.composer.text);
  const composerTextRef = useRef(composerText);
  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  const activeRef = useRef(false);
  const pendingRef = useRef(false);
  const sessionRef = useRef(0);
  const finish = useCallback(() => {
    activeRef.current = false;
    pendingRef.current = false;
    onRecordingChange(false);
    onBusyChange(false);
    onVolumeChange(0);
  }, [onBusyChange, onRecordingChange, onVolumeChange]);
  const cancel = useCallback(
    (reason: VoiceCancellationReason) => {
      ++sessionRef.current;
      activeRef.current = false;
      pendingRef.current = false;
      ExpoSpeechRecognitionModule.abort();
      if (reason !== 'unmount') finish();
    },
    [finish]
  );
  useVoiceInputLifecycle(cancel);

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return;
    const transcript = event.results[0]?.transcript?.trim() ?? '';
    if (!transcript) return;

    if (event.isFinal) {
      finalTranscriptRef.current = [finalTranscriptRef.current, transcript]
        .filter(Boolean)
        .join(' ');
    }
    const recognized = event.isFinal
      ? finalTranscriptRef.current
      : [finalTranscriptRef.current, transcript].filter(Boolean).join(' ');
    aui
      .composer()
      .setText([baseTextRef.current, recognized].filter(Boolean).join(' '));
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (activeRef.current)
      onVolumeChange(Math.max(0, Math.min(1, (event.value + 2) / 12)));
  });

  useSpeechRecognitionEvent('nomatch', () => {
    if (!activeRef.current) return;
    finish();
    Toast.show({
      type: 'info',
      text1: t('chat.voice.noSpeechTitle', {
        defaultValue: 'No speech detected',
      }),
      text2: t('chat.voice.noSpeechMessage', {
        defaultValue: 'Try again and speak closer to the microphone.',
      }),
    });
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) return;
    finish();
    if (event.error === 'aborted') return;

    const noSpeech =
      event.error === 'no-speech' || event.error === 'speech-timeout';
    Toast.show({
      type: noSpeech ? 'info' : 'error',
      text1: noSpeech
        ? t('chat.voice.noSpeechTitle', { defaultValue: 'No speech detected' })
        : t('chat.voice.errorTitle', { defaultValue: 'Voice input failed' }),
      text2: noSpeech
        ? t('chat.voice.noSpeechMessage', {
            defaultValue: 'Try again and speak closer to the microphone.',
          })
        : event.message,
    });
  });

  useSpeechRecognitionEvent('end', () => {
    if (activeRef.current) finish();
  });

  const toggleDictation = useCallback(async () => {
    if (pendingRef.current) return;
    if (activeRef.current) {
      pendingRef.current = true;
      onBusyChange(true);
      onRecordingChange(false);
      onVolumeChange(0);
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        finish();
      }
      // Wait for the final transcript/end event before allowing Send or editing.
      return;
    }
    const session = ++sessionRef.current;
    pendingRef.current = true;
    onBusyChange(true);
    try {
      const currentPermission =
        await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (sessionRef.current !== session) return;
      const permission = currentPermission.granted
        ? currentPermission
        : await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (sessionRef.current !== session) return;
      if (!permission.granted) {
        finish();
        Alert.alert(
          t('chat.voice.permissionTitle', {
            defaultValue: 'Voice input needs the microphone',
          }),
          t('chat.voice.permissionMessage', {
            defaultValue:
              'Allow microphone and speech recognition in system settings to dictate messages.',
          })
        );
        return;
      }
      baseTextRef.current = composerTextRef.current.trim();
      finalTranscriptRef.current = '';
      activeRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: resolveSpeechLocale(
          i18n.language,
          getLocales().map((locale) => locale.languageTag)
        ),
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
        ...(Platform.OS === 'android'
          ? {
              androidIntentOptions: {
                EXTRA_ENABLE_LANGUAGE_SWITCH: 'balanced' as const,
              },
            }
          : {}),
      });
      pendingRef.current = false;
      onBusyChange(false);
      onVolumeChange(0);
      onRecordingChange(true);
    } catch (error) {
      if (sessionRef.current !== session) return;
      finish();
      addLog(
        'chat.voice.start',
        'ERROR',
        error instanceof Error ? [error.message] : [String(error)]
      );
      Toast.show({
        type: 'error',
        text1: t('chat.voice.errorTitle', {
          defaultValue: 'Voice input failed',
        }),
      });
    }
  }, [
    finish,
    onBusyChange,
    onRecordingChange,
    onVolumeChange,
    t,
    i18n.language,
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        recording
          ? t('chat.voice.stop', { defaultValue: 'Stop dictation' })
          : t('chat.voice.label', { defaultValue: 'Dictate message' })
      }
      accessibilityState={{ selected: recording, disabled: busy }}
      disabled={busy}
      onPress={toggleDictation}
      className={
        recording
          ? 'bg-border-subtle rounded-full w-10 h-10 items-center justify-center'
          : 'rounded-full w-10 h-10 items-center justify-center'
      }
    >
      <Icon
        name={recording ? 'stop' : 'microphone'}
        size={recording ? 17 : 20}
        color={textPrimary}
      />
    </Pressable>
  );
}

function ComposerAttachmentStrip({
  onOpenLightbox,
}: {
  onOpenLightbox: (images: string[], index?: number) => void;
}) {
  const { t } = useTranslation();
  const aui = useAui();
  const composerAttachments = useAuiState(
    (state) => state.composer.attachments
  );

  const composerImageAttachments = useMemo(() => {
    if (!composerAttachments) return [];
    return composerAttachments
      .map((attachment) => {
        const uri = getAttachmentImageUri(attachment);
        return uri ? { id: attachment.id, uri } : null;
      })
      .filter((item): item is { id: string; uri: string } => item !== null);
  }, [composerAttachments]);

  const composerImageUris = useMemo(
    () => composerImageAttachments.map((item) => item.uri),
    [composerImageAttachments]
  );

  if (composerImageAttachments.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingTop: 4, paddingRight: 4 }}
      keyboardShouldPersistTaps="handled"
    >
      {composerImageAttachments.map((item, index) => (
        <View
          key={item.id}
          style={{ width: 64, height: 64 }}
          className="relative"
        >
          <Pressable
            testID={`composer-attachment-${index}`}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attachments.previewPhoto', {
              defaultValue: 'Preview photo',
            })}
            onPress={() => onOpenLightbox(composerImageUris, index)}
            style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)}
          >
            <SafeImage
              source={getDirectImageSource(item.uri)}
              style={{ width: 64, height: 64, borderRadius: 12 }}
              contentFit="cover"
            />
          </Pressable>
          <Pressable
            testID={`composer-attachment-remove-${index}`}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attachments.removePhoto', {
              defaultValue: 'Remove photo',
            })}
            hitSlop={8}
            onPress={() => {
              void aui.composer().attachment({ id: item.id }).remove();
            }}
            className="absolute top-1 right-1 bg-black/70 rounded-full w-5 h-5 items-center justify-center"
          >
            <Icon name="close" size={12} color="#ffffff" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function ComposerPhotoPickerButton({
  disabled,
  pickerBusy,
  onBusyChange,
  raised,
  textPrimary,
}: {
  disabled: boolean;
  pickerBusy: boolean;
  onBusyChange: (busy: boolean) => void;
  raised: string;
  textPrimary: string;
}) {
  const { t } = useTranslation();
  const aui = useAui();
  const pickerLockRef = useRef(false);
  const pickerSessionRef = useRef(0);
  const photoSheetRef = useRef<ActionSheetRef>(null);
  const sheetOpenRef = useRef(false);
  const pendingSourceRef = useRef<'camera' | 'library' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const composerAttachments = useAuiState(
    (state) => state.composer.attachments
  );

  const imageCount = useMemo(() => {
    if (!composerAttachments) return 0;
    return composerAttachments.filter((a) => Boolean(getAttachmentImageUri(a)))
      .length;
  }, [composerAttachments]);

  const attachmentCountRef = useRef(imageCount);
  useEffect(() => {
    attachmentCountRef.current = imageCount;
  }, [imageCount]);

  const remainingSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - imageCount);
  const attachDisabled = disabled || pickerBusy || remainingSlots === 0;

  useFocusEffect(
    useCallback(
      () => () => {
        pickerSessionRef.current += 1;
        pendingSourceRef.current = null;
        if (sheetOpenRef.current) {
          sheetOpenRef.current = false;
          photoSheetRef.current?.dismiss();
        }
      },
      []
    )
  );

  const runPick = useCallback(
    async (pick: () => Promise<PickedChatImage[]>) => {
      if (pickerLockRef.current) return;
      pickerLockRef.current = true;
      const session = pickerSessionRef.current;
      onBusyChange(true);
      try {
        const picked = await pick();
        if (pickerSessionRef.current !== session || picked.length === 0) return;
        const availableSlots = Math.max(
          0,
          MAX_CHAT_ATTACHMENTS - attachmentCountRef.current
        );
        for (const photo of picked.slice(0, availableSlots)) {
          await aui.composer().addAttachment({
            type: 'image',
            name: photo.name,
            contentType: photo.mimeType,
            content: [
              {
                type: 'image',
                image: photo.dataUrl,
                filename: photo.name,
              },
            ],
          });
        }
      } catch (error) {
        if (pickerSessionRef.current !== session) return;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[Chat Image Picker] Picking failed: ${message}`, 'ERROR');
        Toast.show({
          type: 'error',
          text1: t('chat.attachments.addFailed', {
            defaultValue: 'Could not add photo',
          }),
        });
      } finally {
        pickerLockRef.current = false;
        onBusyChange(false);
      }
    },
    [aui, onBusyChange, t]
  );

  const addFromCamera = useCallback(
    () =>
      runPick(async () => {
        const result = await pickChatImageFromCamera();
        if (result.status === 'denied') {
          Toast.show({
            type: 'error',
            text1: t('chat.attachments.cameraPermission', {
              defaultValue: 'Camera permission needed',
            }),
            text2: t('chat.attachments.cameraPermissionBody', {
              defaultValue: 'Enable camera access to add a photo.',
            }),
          });
          return [];
        }
        return result.status === 'ok' ? [result.image] : [];
      }),
    [runPick, t]
  );

  const addFromLibrary = useCallback(
    () =>
      runPick(() =>
        pickChatImagesFromLibrary(
          Math.max(1, MAX_CHAT_ATTACHMENTS - attachmentCountRef.current)
        )
      ),
    [runPick]
  );

  const promptAddPhoto = useCallback(() => {
    if (attachDisabled || pickerLockRef.current || sheetOpenRef.current) return;
    sheetOpenRef.current = true;
    setSheetOpen(true);
    Keyboard.dismiss();
    photoSheetRef.current?.present();
  }, [attachDisabled]);

  const selectSource = (source: 'camera' | 'library') => {
    if (attachDisabled || pendingSourceRef.current || pickerLockRef.current)
      return;
    pendingSourceRef.current = source;
    photoSheetRef.current?.dismiss();
  };

  const handleSheetDismiss = useCallback(() => {
    sheetOpenRef.current = false;
    setSheetOpen(false);
    const source = pendingSourceRef.current;
    pendingSourceRef.current = null;
    if (attachDisabled) return;
    if (source === 'camera') void addFromCamera();
    if (source === 'library') void addFromLibrary();
  }, [addFromCamera, addFromLibrary, attachDisabled]);

  return (
    <>
      <Pressable
        testID="composer-attach-photo"
        accessibilityRole="button"
        accessibilityLabel={t('chat.attachments.addPhoto', {
          defaultValue: 'Add photo',
        })}
        accessibilityState={{ disabled: attachDisabled, expanded: sheetOpen }}
        disabled={attachDisabled}
        onPress={promptAddPhoto}
        className="rounded-full w-10 h-10 items-center justify-center"
        style={{
          backgroundColor: raised,
          opacity: attachDisabled ? 0.5 : 1,
        }}
      >
        <Icon
          name={sheetOpen ? 'close' : 'add'}
          size={22}
          color={textPrimary}
        />
      </Pressable>
      <ActionSheet
        ref={photoSheetRef}
        title={t('chat.attachments.addPhoto', { defaultValue: 'Add photo' })}
        layout="grid"
        items={[
          {
            key: 'camera',
            icon: 'camera',
            label: t('chat.attachments.takePhoto', {
              defaultValue: 'Take Photo',
            }),
            dismissOnPress: false,
            onPress: () => selectSource('camera'),
          },
          {
            key: 'library',
            icon: 'photo-library',
            label: t('chat.attachments.chooseFromLibrary', {
              defaultValue: 'Choose from Library',
            }),
            dismissOnPress: false,
            onPress: () => selectSource('library'),
          },
        ]}
        onDismiss={handleSheetDismiss}
      />
    </>
  );
}

/** The bottom input row. Send/Cancel stay on assistant-ui actions. */
function Composer({
  autoFocusReady,
  voiceServiceConfigId,
  voiceInputEnabled,
  onOpenLightbox,
}: {
  autoFocusReady: boolean;
  voiceServiceConfigId?: string | null;
  voiceInputEnabled: boolean;
  onOpenLightbox: (images: string[], index?: number) => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const running = useAuiState((state) => state.thread.isRunning);
  const voiceLevel = useSharedValue(0);
  const handleVoiceVolume = useCallback(
    (volume: number) => {
      const normalized = Number.isFinite(volume)
        ? Math.max(0, Math.min(1, volume))
        : 0;
      // Suppress low-level room noise. Follow speech quickly, then settle slowly
      // between syllables instead of shifting an entire row on every meter tick.
      const target = Math.max(0, (normalized - 0.08) / 0.92);
      // Reanimated shared values are intentionally mutable outside React renders.
      // eslint-disable-next-line react-hooks/immutability
      voiceLevel.value = withTiming(target, {
        duration: target > voiceLevel.value ? 100 : 280,
        easing: Easing.out(Easing.cubic),
      });
    },
    [voiceLevel]
  );
  const handleRecordingChange = useCallback(
    (nextRecording: boolean) => {
      setRecording(nextRecording);
      // Reset the UI-thread meter without re-rendering for each audio sample.
      // eslint-disable-next-line react-hooks/immutability
      voiceLevel.value = 0;
    },
    [voiceLevel]
  );
  const [muted, raised, textPrimary, accent] = useCSSVariable([
    '--color-text-muted',
    '--color-raised',
    '--color-text-primary',
    '--color-accent-primary',
  ]) as [string, string, string, string];

  return (
    <ComposerPrimitive.Root
      style={{
        margin: 12,
        gap: 8,
      }}
    >
      <ComposerAttachmentStrip onOpenLightbox={onOpenLightbox} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {!recording && (
          <ComposerPhotoPickerButton
            disabled={!!running || recording || voiceBusy}
            pickerBusy={pickerBusy}
            onBusyChange={setPickerBusy}
            raised={raised}
            textPrimary={textPrimary}
          />
        )}
        {recording ? (
          <VoiceWaveform level={voiceLevel} raised={raised} accent={accent} />
        ) : (
          <LocalComposerInput
            autoFocusReady={autoFocusReady && !voiceBusy}
            editable={!voiceBusy}
            placeholder={t('chat.placeholder', {
              defaultValue: 'Message Sparky…',
            })}
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
        )}
        {voiceInputEnabled && (
          // Keep the controller mounted while run-start cancellation finishes;
          // unmounting here would strand the parent's recording/busy state.
          <View style={running ? { display: 'none' } : undefined}>
            {voiceServiceConfigId ? (
              <AiVoiceDictationButton
                serviceConfigId={voiceServiceConfigId}
                textPrimary={textPrimary}
                recording={recording}
                onRecordingChange={handleRecordingChange}
                onBusyChange={setVoiceBusy}
                onVolumeChange={handleVoiceVolume}
              />
            ) : (
              <SystemVoiceDictationButton
                textPrimary={textPrimary}
                recording={recording}
                busy={voiceBusy}
                onRecordingChange={handleRecordingChange}
                onBusyChange={setVoiceBusy}
                onVolumeChange={handleVoiceVolume}
              />
            )}
          </View>
        )}
        {/* Keep the arrow visible, but disable it until recording has
            stopped so recognition can never continue invisibly after a send. */}
        <ThreadPrimitive.If running={false}>
          <ComposerPrimitive.Send
            disabled={recording || voiceBusy || pickerBusy ? true : undefined}
          >
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
      </View>
    </ComposerPrimitive.Root>
  );
}

/**
 * Headless reporter: lifts the thread's running state out to ChatScreen so the
 * header Clear button (outside the runtime provider) can disable while a stream
 * is in flight. Reads `isRunning` from assistant-ui state and pushes it up.
 */
function RunningReporter({
  onRunningChange,
}: {
  onRunningChange: (running: boolean) => void;
}) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  useEffect(() => {
    onRunningChange(!!isRunning);
  }, [isRunning, onRunningChange]);
  return null;
}

/** The live thread. Only mounted once baseUrl + serviceConfigId are known. */
function getLocalizedSuggestionLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  labelKey: string,
  defaultLabel: string
): string {
  switch (labelKey) {
    case 'chat.suggestions.breakfast':
      return t('chat.suggestions.breakfast', {
        defaultValue: 'Log two eggs and a banana for breakfast',
      });
    case 'chat.suggestions.run':
      return t('chat.suggestions.run', {
        defaultValue: 'Log a 30 minute run today',
      });
    case 'chat.suggestions.calories':
      return t('chat.suggestions.calories', {
        defaultValue: 'How many calories do I have left today?',
      });
    case 'chat.suggestions.snack':
      return t('chat.suggestions.snack', {
        defaultValue: 'Suggest a high-protein snack',
      });
    default:
      return defaultLabel;
  }
}

function ChatThread({
  baseUrl,
  serviceConfigId,
  voiceServiceConfigId,
  voiceInputEnabled,
  conversationId,
  initialMessages,
  onRunningChange,
  autoFocusReady,
}: {
  baseUrl: string;
  serviceConfigId: string;
  voiceServiceConfigId?: string | null;
  voiceInputEnabled: boolean;
  conversationId: string;
  initialMessages: InitialMessages;
  onRunningChange: (running: boolean) => void;
  autoFocusReady: boolean;
}) {
  const { t } = useTranslation();
  const { lightboxProps, openLightbox } = useImageLightbox();
  const runtime = useSparkyChatRuntime({
    baseUrl,
    serviceConfigId,
    conversationId,
    initialMessages,
  });

  // Keep the message list pinned to the bottom as content grows — but only
  // while the user is at the bottom: lands on the latest message on mount
  // (seeded history) and follows the stream. While the user scrolls back
  // through history, the FlatList keeps re-measuring rows (variable-height
  // markdown), firing onContentSizeChange; scrolling unconditionally on it
  // snapped the list back to the newest message and made history unreadable
  // (#2276). Starting a new run re-pins, since send and retry both append at
  // the bottom and the user is asking to see that reply.
  const messagesRef = useRef<FlatList>(null);
  const pinnedToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSettledFrameRef = useRef<number | null>(null);

  const cancelScheduledScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    if (scrollSettledFrameRef.current !== null) {
      cancelAnimationFrame(scrollSettledFrameRef.current);
      scrollSettledFrameRef.current = null;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    cancelScheduledScroll();

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      messagesRef.current?.scrollToEnd({ animated: false });

      scrollSettledFrameRef.current = requestAnimationFrame(() => {
        scrollSettledFrameRef.current = null;
        messagesRef.current?.scrollToEnd({ animated: false });
      });
    });
  }, [cancelScheduledScroll]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      pinnedToBottomRef.current =
        contentOffset.y + layoutMeasurement.height >=
        contentSize.height - SCROLL_PIN_THRESHOLD;
    },
    []
  );

  const scrollToBottomIfPinned = useCallback(() => {
    if (pinnedToBottomRef.current) scrollToBottom();
  }, [scrollToBottom]);

  const handleRunningChange = useCallback(
    (running: boolean) => {
      if (running) {
        pinnedToBottomRef.current = true;
        scrollToBottom();
      }
      onRunningChange(running);
    },
    [onRunningChange, scrollToBottom]
  );

  useEffect(() => {
    scrollToBottom();
    return cancelScheduledScroll;
  }, [cancelScheduledScroll, scrollToBottom]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RunningReporter onRunningChange={handleRunningChange} />
      <ThreadPrimitive.Root style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <ThreadPrimitive.Empty>
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-text-muted text-center text-base mb-6">
                {t('chat.emptyPrompt', {
                  defaultValue:
                    'Ask Sparky anything about your nutrition, exercise, or goals.',
                })}
              </Text>
              {/* ThreadPrimitive.Suggestion IS the Pressable, so its child must be a
                  non-touchable styled View (nested pressables swallow touches). */}
              <View className="w-full gap-2">
                {CHAT_SUGGESTIONS.map((suggestion) => (
                  <ThreadPrimitive.Suggestion
                    key={suggestion.prompt}
                    prompt={suggestion.prompt}
                    send
                    clearComposer
                  >
                    <View className="bg-surface border border-border-subtle rounded-2xl px-4 py-3">
                      <Text className="text-text-primary text-sm text-center">
                        {getLocalizedSuggestionLabel(
                          t,
                          suggestion.labelKey,
                          suggestion.defaultLabel
                        )}
                      </Text>
                    </View>
                  </ThreadPrimitive.Suggestion>
                ))}
              </View>
            </View>
          </ThreadPrimitive.Empty>

          <ThreadMessages
            ref={messagesRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={scrollToBottomIfPinned}
            onLayout={scrollToBottomIfPinned}
          >
            {({ message }) => (
              <MessageBubble
                role={message.role}
                onOpenLightbox={openLightbox}
              />
            )}
          </ThreadMessages>
        </View>

        <Composer
          key={`${voiceInputEnabled}:${voiceServiceConfigId ?? 'system'}`}
          autoFocusReady={autoFocusReady}
          voiceServiceConfigId={voiceServiceConfigId}
          voiceInputEnabled={voiceInputEnabled}
          onOpenLightbox={openLightbox}
        />
      </ThreadPrimitive.Root>
      <ImageLightbox
        {...lightboxProps}
        getImageSource={getDirectImageSource}
        autoPlay={false}
      />
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

export default function ChatScreen({
  navigation,
}: RootStackScreenProps<'Chat'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  // The offset depends on which header is on screen. With the native stack
  // header, the header sits above the KeyboardAvoidingView's frame, so the
  // status-bar + header height has to be added back for the composer to land
  // just above the keyboard. With the screen-owned header, that header lives
  // inside the KAV's parent flow (and is already reflected in the KAV frame),
  // so only a small breathing gap is needed — adding the header height there
  // double-counts and leaves a large empty band above the keyboard.
  const keyboardVerticalOffset = usesNativeHeader
    ? insets.top + IOS_SMALL_NATIVE_HEADER_HEIGHT + CHAT_KEYBOARD_EXTRA_SPACING
    : CHAT_KEYBOARD_EXTRA_SPACING;

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [running, setRunning] = useState(false);
  // Remounting ChatThread by key resets the in-memory runtime (it ignores
  // `messages` changes after mount), so bump this to clear the thread.
  const [threadKey, setThreadKey] = useState(0);
  // Kept across reopening the chat so session-affine providers keep their
  // session; rotated when the history is cleared or the provider changes.
  const chatConversationId = useAppPreferencesStore(
    (s) => s.chatConversationId
  );
  const chatConversationServiceId = useAppPreferencesStore(
    (s) => s.chatConversationServiceId
  );
  const startChatConversation = useAppPreferencesStore(
    (s) => s.startChatConversation
  );
  const { data: setting, isLoading: loadingSetting } =
    useActiveAiServiceSetting();
  const { preferences, refetch: refetchPreferences } = usePreferences({
    enabled: !!baseUrl,
  });
  useVoicePreferencesRefresh(refetchPreferences, !!baseUrl);

  // Gate the composer's autofocus on the push transition finishing so the
  // keyboard doesn't animate in over the still-sliding screen (which renders it
  // a dark grey until the screen settles). Tracked here — not in the composer —
  // because the composer mounts behind a loading gate that can outlast the
  // transition, missing a `transitionEnd` listener attached that late.
  const [transitionComplete, setTransitionComplete] = useState(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) setTransitionComplete(true);
    });
    return unsubscribe;
  }, [navigation]);

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
  const { data: historyData, isLoading: loadingHistory } = useChatHistory({
    enabled: !!baseUrl,
  });
  const initialMessages = historyData ?? [];

  const serviceConfigId = setting?.id ?? null;

  useEffect(() => {
    if (!serviceConfigId) return;
    if (!chatConversationId || chatConversationServiceId !== serviceConfigId) {
      let cancelled = false;
      void (async () => {
        // The history is global, not per provider; refetch so the new thread seeds from the latest messages.
        await queryClient.refetchQueries({ queryKey: chatHistoryQueryKey });
        if (!cancelled) startChatConversation(serviceConfigId);
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [
    queryClient,
    serviceConfigId,
    chatConversationId,
    chatConversationServiceId,
    startChatConversation,
  ]);

  const handleClear = useCallback(() => {
    Alert.alert(
      t('chat.clearTitle', { defaultValue: 'Clear chat' }),
      t('chat.clearMessage', {
        defaultValue:
          'This permanently deletes your Sparky chat history. This cannot be undone.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllChatHistory();
              // Reset the raw (pre-select) cache so a remount seeds an empty thread.
              queryClient.setQueryData(chatHistoryQueryKey, []);
              startChatConversation(serviceConfigId);
              setThreadKey((k) => k + 1);
            } catch (error) {
              addLog('Failed to clear chat history', 'ERROR', [
                error instanceof Error ? error.message : String(error),
              ]);
              Toast.show({
                type: 'error',
                text1: t('chat.clearFailed', {
                  defaultValue: 'Could not clear chat',
                }),
                text2: t('common.tryAgain', {
                  defaultValue: 'Please try again.',
                }),
              });
            }
          },
        },
      ]
    );
  }, [queryClient, serviceConfigId, startChatConversation, t]);

  // Clear chat is disabled while a stream runs so the server's in-flight
  // onFinish save can't resurrect the exchange after the DELETE.
  const header = useScreenHeader({
    title: t('chat.title', { defaultValue: 'Sparky' }),
    left: { kind: 'back' },
    right: baseUrl
      ? {
          kind: 'icon',
          sfSymbol: 'trash',
          ionicon: 'trash-outline',
          role: 'secondary',
          disabled: running,
          onPress: handleClear,
          accessibilityLabel: t('chat.clearAccessibility', {
            defaultValue: 'Clear chat',
          }),
          identifier: 'chat-clear',
        }
      : null,
  });

  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: usesNativeHeader ? undefined : insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      {header}

      {/* Padding shrinks the message list by the keyboard height so the composer
          stays pinned just above the keyboard. On iOS, RN core's
          KeyboardAvoidingView follows keyboardWillShow with the system layout
          animation; keyboard-controller's KAV can miss the live progress on iOS
          26 with the custom header path and snap at keyboardDidShow. */}
      <ChatKeyboardAvoidingView
        testID="chat-keyboard-avoiding-view"
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        {loadingConfig || loadingSetting || loadingHistory ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : !baseUrl ? (
          <Centered
            text={t('chat.noServer', {
              defaultValue:
                'No active server config. Set one up in Settings first.',
            })}
          />
        ) : !serviceConfigId ? (
          <Centered
            text={t('chat.noProvider', {
              defaultValue:
                'No active AI provider. Configure one in the web app first.',
            })}
          />
        ) : !chatConversationId ||
          chatConversationServiceId !== serviceConfigId ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : (
          <ChatThread
            key={threadKey}
            baseUrl={baseUrl}
            serviceConfigId={serviceConfigId}
            voiceServiceConfigId={preferences?.active_voice_ai_service_id}
            voiceInputEnabled={
              !!preferences && preferences.voice_input_enabled !== false
            }
            conversationId={chatConversationId}
            initialMessages={initialMessages}
            onRunningChange={setRunning}
            autoFocusReady={transitionComplete}
          />
        )}
      </ChatKeyboardAvoidingView>
    </View>
  );
}
