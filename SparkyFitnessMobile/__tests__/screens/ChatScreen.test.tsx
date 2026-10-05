import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Reanimated from 'react-native-reanimated';
import { AppState } from 'react-native';
import { transcribeVoiceRecording } from '../../src/services/api/voiceTranscriptionApi';
import ChatScreen from '../../src/screens/ChatScreen';
import { getActiveServerConfig } from '../../src/services/storage';
import { useActiveAiServiceSetting, useChatHistory } from '../../src/hooks';

// The real @assistant-ui runtime pulls in web fetch globals + a chain of ESM
// dependencies that don't load under jsdom without transforming the whole tree.
// Stub the primitives instead, with `ThreadPrimitive.If`/`Empty` honoring
// controllable flags so the empty state and Send↔Cancel gating are exercised.
// Streaming behavior itself is covered by on-device manual verification.

// expo/fetch's FetchResponse extends the global Response (absent in jsdom); the
// transport is stubbed here anyway.
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

// Native speech recognition is unavailable under jsdom; stub the module and
// capture the registered event handlers so tests can drive transcripts.
jest.mock('expo-speech-recognition', () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  (
    globalThis as typeof globalThis & {
      __mockSpeechHandlers: typeof handlers;
    }
  ).__mockSpeechHandlers = handlers;
  return {
    __esModule: true,
    ExpoSpeechRecognitionModule: {
      getPermissionsAsync: jest.fn(async () => ({ granted: false })),
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
    },
    useSpeechRecognitionEvent: (
      event: string,
      handler: (event: unknown) => void
    ) => {
      handlers[event] = handler;
    },
  };
});

jest.mock('@assistant-ui/react-ai-sdk', () => ({
  __esModule: true,
  AssistantChatTransport: class AssistantChatTransport {},
  useChatRuntime: (options: {
    onError?: (error: Error) => void;
    messages?: unknown;
  }) => {
    (global as any).__mockCapturedOnError = options?.onError;
    (global as any).__mockCapturedMessages = options?.messages;
    return {};
  },
}));

jest.mock('@assistant-ui/react-native', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  const Box = ({ children, style }: any) =>
    React.createElement(View, { style }, children);
  return {
    __esModule: true,
    AssistantRuntimeProvider: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    useAui: () => ({
      composer: () => ({
        setText: (value: string) => {
          // By default the echo back through `composer.text` is synchronous. Set
          // `__mockComposerDeferEchoes` to hold it so a test can drive the
          // asynchronous echoes manually (assistant-ui lags the local input).
          if (!(global as any).__mockComposerDeferEchoes) {
            (global as any).__mockComposerText = value;
          }
          (global as any).__mockComposerSetText?.(value);
        },
      }),
    }),
    useAuiEvent: () => undefined,
    useAuiState: (selector: (s: any) => any) =>
      selector({
        thread: { isRunning: !!(global as any).__mockChatIsRunning },
        composer: { text: (global as any).__mockComposerText ?? '' },
      }),
    ThreadPrimitive: {
      Root: Box,
      Empty: ({ children }: any) =>
        (global as any).__mockChatIsEmpty === false
          ? null
          : React.createElement(React.Fragment, null, children),
      Messages: React.forwardRef(
        ({ children: _children, ...props }: any, ref: any) => {
          React.useImperativeHandle(ref, () => ({
            scrollToEnd: (options: unknown) =>
              (global as any).__mockMessagesScrollToEnd?.(options),
          }));
          return React.createElement(View, {
            testID: 'thread-messages',
            ...props,
          });
        }
      ),
      If: ({ children, running, empty }: any) => {
        if (running !== undefined) {
          return running === !!(global as any).__mockChatIsRunning
            ? children
            : null;
        }
        if (empty !== undefined) {
          return empty === ((global as any).__mockChatIsEmpty !== false)
            ? children
            : null;
        }
        return children;
      },
      Suggestion: ({ children, prompt }: any) =>
        React.createElement(
          Pressable,
          { testID: `suggestion-${prompt}` },
          children
        ),
    },
    ComposerPrimitive: {
      Root: Box,
      Input: () => React.createElement(View, { testID: 'composer-input' }),
      Send: ({
        children,
        disabled,
      }: {
        children: React.ReactNode;
        disabled?: boolean;
      }) =>
        React.createElement(
          View,
          { testID: 'composer-send', accessibilityState: { disabled } },
          children
        ),
      Cancel: ({ children }: any) =>
        React.createElement(View, { testID: 'composer-cancel' }, children),
    },
    MessagePrimitive: {
      Root: Box,
      Content: () => null,
      If: ({ children }: any) => children,
    },
    ErrorPrimitive: {
      Root: Box,
      Message: (props: any) => React.createElement(Text, props),
    },
    ActionBarPrimitive: {
      Reload: ({ children }: any) => React.createElement(View, null, children),
      Copy: ({ children }: any) =>
        React.createElement(
          View,
          null,
          typeof children === 'function'
            ? children({ isCopied: false })
            : children
        ),
    },
  };
});

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(() => ({})),
}));

jest.mock('../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(() => ({})),
}));

jest.mock('../../src/services/api/apiClient', () => ({
  normalizeUrl: (url: string) => url,
}));

jest.mock('../../src/services/api/voiceTranscriptionApi', () => ({
  transcribeVoiceRecording: jest.fn(async () => ({
    text: 'Привет из Gemini',
    model: 'gemini-test',
  })),
}));

const mockVoicePreferences = { enabled: true, refetch: jest.fn() };
jest.mock('../../src/hooks', () => ({
  useActiveAiServiceSetting: jest.fn(),
  useChatHistory: jest.fn(),
  usePreferences: jest.fn(() => ({
    preferences: {
      active_voice_ai_service_id:
        (
          globalThis as typeof globalThis & {
            __mockVoiceServiceId?: string | null;
          }
        ).__mockVoiceServiceId ?? null,
      voice_input_enabled: mockVoicePreferences.enabled,
    },
    refetch: mockVoicePreferences.refetch,
  })),
  chatHistoryQueryKey: ['chatHistory'],
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      React.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockUseActiveAiServiceSetting =
  useActiveAiServiceSetting as jest.MockedFunction<
    typeof useActiveAiServiceSetting
  >;
const mockUseChatHistory = useChatHistory as jest.MockedFunction<
  typeof useChatHistory
>;

const mockNavigation = {
  goBack: jest.fn(),
  setOptions: jest.fn(),
  // Returns an unsubscribe; ChatScreen subscribes to 'transitionEnd' to defer
  // the composer's autofocus until the push transition settles.
  addListener: jest.fn(() => jest.fn()),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn(),
}));

const navigation = mockNavigation;
const route = { params: {} } as any;

const initialMetrics = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderScreen() {
  // A real QueryClient backs the screen's useQueryClient() call; useChatHistory
  // is mocked so no actual queries run through it.
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ChatScreen navigation={navigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const SERVER_CONFIG = {
  id: 'srv-1',
  url: 'https://sparky.example',
  proxyHeaders: [],
} as any;
const ACTIVE_SETTING = { id: 'svc-1', service_type: 'openai' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockVoicePreferences.enabled = true;
  (global as any).__mockChatIsRunning = false;
  (global as any).__mockChatIsEmpty = true;
  (global as any).__mockCapturedOnError = undefined;
  (global as any).__mockCapturedMessages = undefined;
  (global as any).__mockMessagesScrollToEnd = undefined;
  (global as any).__mockComposerText = '';
  (global as any).__mockComposerSetText = jest.fn();
  (global as any).__mockComposerDeferEchoes = false;
  voiceTestState.__mockVoiceServiceId = null;
  mockGetActiveServerConfig.mockResolvedValue(SERVER_CONFIG);
  mockUseActiveAiServiceSetting.mockReturnValue({
    data: ACTIVE_SETTING,
    isLoading: false,
  } as any);
  mockUseChatHistory.mockReturnValue({ data: [], isLoading: false } as any);
});

describe('ChatScreen config gating', () => {
  it('renders the keyboard avoiding container', async () => {
    const { getByTestId } = renderScreen();

    expect(getByTestId('chat-keyboard-avoiding-view')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });
  });

  it('prompts to set up a server when none is configured', async () => {
    mockGetActiveServerConfig.mockResolvedValue(null);
    const { findByText } = renderScreen();
    expect(await findByText(/No active server config/i)).toBeTruthy();
  });

  it('prompts to configure an AI provider when none is active', async () => {
    mockUseActiveAiServiceSetting.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);
    const { findByText } = renderScreen();
    expect(await findByText(/No active AI provider/i)).toBeTruthy();
  });
});

describe('ChatScreen thread', () => {
  it('hides dictation when disabled without hiding the text composer', async () => {
    mockVoicePreferences.enabled = false;
    const screen = renderScreen();
    await screen.findByPlaceholderText('Message Sparky…');
    expect(screen.queryByLabelText('Dictate message')).toBeNull();
    expect(screen.queryByLabelText('Dictate with AI')).toBeNull();
    expect(screen.getByTestId('composer-send')).toBeTruthy();
  });

  it('renders the empty state with the configured starter suggestions', async () => {
    const { findByText, getByText } = renderScreen();
    expect(
      await findByText(
        'Ask Sparky anything about your nutrition, exercise, or goals.'
      )
    ).toBeTruthy();
    expect(getByText('Log two eggs and a banana for breakfast')).toBeTruthy();
    expect(getByText('Suggest a high-protein snack')).toBeTruthy();
  });

  it('shows the up-arrow send button while idle and swaps to a Stop button while running', async () => {
    const { findByTestId, getByTestId, queryByTestId, rerender } =
      renderScreen();
    await findByTestId('composer-send');

    // Idle: send button (up arrow) visible, Stop hidden.
    expect(getByTestId('icon-arrow-up')).toBeTruthy();
    expect(queryByTestId('icon-stop')).toBeNull();

    // Running: send hidden, Stop shown.
    (global as any).__mockChatIsRunning = true;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ChatScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    expect(queryByTestId('composer-send')).toBeNull();
    expect(queryByTestId('icon-arrow-up')).toBeNull();
    expect(getByTestId('icon-stop')).toBeTruthy();
  });

  it('surfaces a toast when the stream errors via the runtime onError handler', async () => {
    const { findByTestId } = renderScreen();
    await findByTestId('composer-send');

    const onError = (global as any).__mockCapturedOnError as
      ((e: Error) => void) | undefined;
    expect(onError).toBeDefined();
    act(() => {
      onError?.(new Error('bad config'));
    });

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Chat error',
        text2: 'bad config',
      })
    );
  });

  it('starts system dictation, shows a waveform, and streams transcript into the composer', async () => {
    const {
      findByPlaceholderText,
      findByLabelText,
      getByLabelText,
      queryByPlaceholderText,
    } = renderScreen();
    await findByPlaceholderText('Message Sparky…');

    const { ExpoSpeechRecognitionModule } = jest.requireMock(
      'expo-speech-recognition'
    );
    const mic = getByLabelText('Dictate message');
    await act(async () => {
      fireEvent.press(mic);
    });

    expect(
      ExpoSpeechRecognitionModule.requestPermissionsAsync
    ).toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        interimResults: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
      })
    );
    expect(await findByLabelText('Listening')).toBeTruthy();
    expect(queryByPlaceholderText('Message Sparky…')).toBeNull();

    // Partial then final results accumulate into the composer text.
    await act(async () => {
      voiceTestState.__mockSpeechHandlers.result?.({
        isFinal: false,
        results: [{ transcript: 'log an apple' }],
      });
    });
    expect(voiceTestState.__mockComposerSetText).toHaveBeenCalledWith(
      'log an apple'
    );

    await act(async () => {
      voiceTestState.__mockSpeechHandlers.result?.({
        isFinal: true,
        results: [{ transcript: 'log an apple and run' }],
      });
    });
    expect(voiceTestState.__mockComposerSetText).toHaveBeenCalledWith(
      'log an apple and run'
    );

    // Final results do not auto-send. The active mic stops recognition and
    // restores the editable composer containing the recognized text.
    await act(async () => {
      fireEvent.press(getByLabelText('Stop dictation'));
    });
    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
    expect(await findByPlaceholderText('Message Sparky…')).toBeTruthy();
  });

  it('smooths microphone levels without re-rendering the recording UI on every sample', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const reducedMotion = jest.spyOn(Reanimated, 'useReducedMotion');
    try {
      const { findByPlaceholderText, getByLabelText } = renderScreen();
      await findByPlaceholderText('Message Sparky…');
      await act(async () => {
        fireEvent.press(getByLabelText('Dictate message'));
      });

      const renders = reducedMotion.mock.calls.length;
      const { __mockSpeechHandlers: handlers } =
        globalThis as typeof globalThis & {
          __mockSpeechHandlers: {
            volumechange: (event: { value: number }) => void;
          };
        };
      act(() => handlers.volumechange({ value: 7 }));
      expect(timing).toHaveBeenLastCalledWith(
        expect.closeTo((0.75 - 0.08) / 0.92),
        expect.objectContaining({ duration: 100 })
      );
      act(() => handlers.volumechange({ value: -2 }));
      expect(timing).toHaveBeenLastCalledWith(
        0,
        expect.objectContaining({ duration: 280 })
      );
      expect(reducedMotion).toHaveBeenCalledTimes(renders);
    } finally {
      timing.mockRestore();
      reducedMotion.mockRestore();
    }
  });

  it('records and sends audio to the selected AI voice provider', async () => {
    voiceTestState.__mockVoiceServiceId = 'voice-svc-1';
    const { findByPlaceholderText, findByLabelText, getByLabelText } =
      renderScreen();
    await findByPlaceholderText('Message Sparky…');

    const audio = jest.requireMock('expo-audio');
    const { transcribeVoiceRecording } = jest.requireMock(
      '../../src/services/api/voiceTranscriptionApi'
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Dictate with AI'));
    });
    const recorder = audio.useAudioRecorder.mock.results[0].value;
    expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalled();
    expect(await findByLabelText('Listening')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByLabelText('Stop dictation'));
    });
    expect(recorder.stop).toHaveBeenCalled();
    expect(transcribeVoiceRecording).toHaveBeenCalledWith({
      uri: 'file:///voice.m4a',
      serviceConfigId: 'voice-svc-1',
      signal: expect.any(AbortSignal),
    });
    await waitFor(() => {
      expect(voiceTestState.__mockComposerSetText).toHaveBeenCalledWith(
        'Привет из Gemini'
      );
    });
  });

  it('shows a specific no-speech message instead of a generic failure', async () => {
    const { findByPlaceholderText, getByLabelText } = renderScreen();
    await findByPlaceholderText('Message Sparky…');
    await act(async () => {
      fireEvent.press(getByLabelText('Dictate message'));
    });
    act(() => {
      voiceTestState.__mockSpeechHandlers.error?.({
        error: 'no-speech',
        message: 'No speech input',
      });
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', text1: 'No speech detected' })
    );
  });

  it('hides the mic while a stream is running', async () => {
    voiceTestState.__mockChatIsRunning = true;
    const { queryByLabelText } = renderScreen();
    expect(queryByLabelText('Dictate message')).toBeNull();
    voiceTestState.__mockChatIsRunning = false;
  });

  it('keeps typed composer text local while forwarding it to assistant-ui', async () => {
    const { findByPlaceholderText, getByPlaceholderText } = renderScreen();
    await findByPlaceholderText('Message Sparky…');

    fireEvent.changeText(getByPlaceholderText('Message Sparky…'), 'hello');

    expect((global as any).__mockComposerSetText).toHaveBeenCalledWith('hello');
    expect(getByPlaceholderText('Message Sparky…').props.value).toBe('hello');
  });

  it('does not flicker to a stale value when backspacing to an earlier text before echoes catch up', async () => {
    (global as any).__mockComposerDeferEchoes = true;
    const queryClient = new QueryClient();
    const makeTree = () => (
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ChatScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    const { findByPlaceholderText, getByPlaceholderText, rerender } =
      render(makeTree());
    const input = await findByPlaceholderText('Message Sparky…');

    // Type "a" -> "ab" -> "abc", then backspace to "ab". Echoes are deferred, so
    // the queue accumulates ["a", "ab", "abc", "ab"] with a duplicate "ab".
    fireEvent.changeText(input, 'a');
    fireEvent.changeText(input, 'ab');
    fireEvent.changeText(input, 'abc');
    fireEvent.changeText(input, 'ab');

    expect(
      (global as any).__mockComposerSetText.mock.calls.map(
        (c: string[]) => c[0]
      )
    ).toEqual(['a', 'ab', 'abc', 'ab']);
    expect(getByPlaceholderText('Message Sparky…').props.value).toBe('ab');

    // Now let the deferred echoes arrive in order, one render at a time. The
    // input must stay "ab" throughout — never flickering to the stale "abc".
    const observed: string[] = [];
    for (const echo of ['a', 'ab', 'abc', 'ab']) {
      (global as any).__mockComposerText = echo;
      rerender(makeTree());
      observed.push(getByPlaceholderText('Message Sparky…').props.value);
    }

    expect(observed).toEqual(['ab', 'ab', 'ab', 'ab']);
    expect(observed).not.toContain('abc');
    expect(getByPlaceholderText('Message Sparky…').props.value).toBe('ab');
  });

  it('scrolls the message list to the bottom after the thread mounts', async () => {
    const scrollToEnd = jest.fn();
    const animationFrames: FrameRequestCallback[] = [];
    (global as any).__mockChatIsEmpty = false;
    (global as any).__mockMessagesScrollToEnd = scrollToEnd;
    const requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    const cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    const { findByTestId } = renderScreen();
    await findByTestId('thread-messages');

    await act(async () => {
      while (animationFrames.length > 0) {
        const callbacks = animationFrames.splice(0);
        callbacks.forEach((callback) => callback(0));
      }
    });

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it('defers composer focus to the push transitionEnd instead of autoFocus', async () => {
    const { findByPlaceholderText } = renderScreen();
    const input = await findByPlaceholderText('Message Sparky…');

    // Focusing mid-transition presents the keyboard over the still-sliding
    // screen, which flashes a dark-grey keyboard until the screen settles. So
    // the composer must not use autoFocus...
    expect(input.props.autoFocus).toBeFalsy();
    // ...it focuses on the screen's entering transitionEnd instead.
    expect(
      mockNavigation.addListener.mock.calls.some(
        ([event]: [string]) => event === 'transitionEnd'
      )
    ).toBe(true);
  });
});

describe('ChatScreen auto-scroll pinning', () => {
  const scrollEvent = (
    offsetY: number,
    contentHeight: number,
    viewportHeight = 600
  ) => ({
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      contentSize: { width: 390, height: contentHeight },
      layoutMeasurement: { width: 390, height: viewportHeight },
    },
  });

  let scrollToEnd: jest.Mock;
  let animationFrames: FrameRequestCallback[];
  let requestAnimationFrameSpy: jest.SpyInstance;
  let cancelAnimationFrameSpy: jest.SpyInstance;

  const flushAnimationFrames = async () => {
    await act(async () => {
      while (animationFrames.length > 0) {
        const callbacks = animationFrames.splice(0);
        callbacks.forEach((callback) => callback(0));
      }
    });
  };

  beforeEach(() => {
    scrollToEnd = jest.fn();
    animationFrames = [];
    (global as any).__mockChatIsEmpty = false;
    (global as any).__mockMessagesScrollToEnd = scrollToEnd;
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    cancelAnimationFrameSpy = jest
      .spyOn(global, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  const tree = (queryClient: QueryClient) => (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ChatScreen navigation={navigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );

  async function renderThread() {
    const queryClient = new QueryClient();
    const screen = render(tree(queryClient));
    const messages = await screen.findByTestId('thread-messages');
    await flushAnimationFrames();
    scrollToEnd.mockClear();
    return { ...screen, messages, queryClient };
  }

  it('follows content growth while the user is at the bottom (streaming)', async () => {
    const { messages } = await renderThread();

    fireEvent(messages, 'scroll', scrollEvent(1400, 2000));
    fireEvent(messages, 'contentSizeChange', 390, 2100);
    await flushAnimationFrames();

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('does not snap back to the bottom when content resizes while the user is scrolled up (#2276)', async () => {
    const { messages } = await renderThread();

    // Scroll well away from the bottom, then let the list re-measure — as it
    // does while old messages mount during a scroll-back through history.
    fireEvent(messages, 'scroll', scrollEvent(100, 2000));
    fireEvent(messages, 'contentSizeChange', 390, 2100);
    fireEvent(messages, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 600 } },
    });
    await flushAnimationFrames();

    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it('resumes following once the user scrolls back to the bottom', async () => {
    const { messages } = await renderThread();

    fireEvent(messages, 'scroll', scrollEvent(100, 2000));
    fireEvent(messages, 'scroll', scrollEvent(1400, 2000));
    fireEvent(messages, 'contentSizeChange', 390, 2100);
    await flushAnimationFrames();

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });

  it('re-pins to the bottom when a new run starts, even if the user scrolled up', async () => {
    const { messages, queryClient, rerender } = await renderThread();

    fireEvent(messages, 'scroll', scrollEvent(100, 2000));

    // Send and retry both append at the bottom, and both flip the thread to
    // running — that is the signal the user wants to see the new reply.
    (global as any).__mockChatIsRunning = true;
    rerender(tree(queryClient));
    await flushAnimationFrames();

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });

    // And the pin is restored: subsequent content growth keeps following.
    scrollToEnd.mockClear();
    fireEvent(messages, 'contentSizeChange', 390, 2100);
    await flushAnimationFrames();
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
  });
});

interface MockRecorder {
  prepareToRecordAsync: jest.Mock<Promise<void>>;
  record: jest.Mock;
  stop: jest.Mock<Promise<void>>;
}
const voiceTestState = globalThis as typeof globalThis & {
  __mockVoiceServiceId: string | null;
  __mockComposerText: string;
  __mockComposerSetText: jest.Mock;
  __mockChatIsRunning: boolean;
  __mockSpeechHandlers: Record<string, (event: unknown) => void>;
};
const mockTranscribe = jest.mocked(transcribeVoiceRecording);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function startAiRecording() {
  voiceTestState.__mockVoiceServiceId = 'voice-svc-1';
  const screen = renderScreen();
  await screen.findByPlaceholderText('Message Sparky…');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Dictate with AI'));
  });
  return screen;
}

describe('voice recording lifecycle', () => {
  it('locks editing and Send until the transcript has been appended to the original draft', async () => {
    voiceTestState.__mockComposerText = 'For lunch';
    const pending = deferred<{ text: string; model: string }>();
    mockTranscribe.mockReturnValueOnce(pending.promise);
    const screen = await startAiRecording();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop dictation'));
    });
    expect(screen.getByPlaceholderText('Message Sparky…').props.editable).toBe(
      false
    );
    expect(
      screen.getByTestId('composer-send').props.accessibilityState.disabled
    ).toBe(true);
    await act(async () => {
      pending.resolve({ text: 'an apple', model: 'voice-model' });
    });
    expect(voiceTestState.__mockComposerSetText).toHaveBeenCalledWith(
      'For lunch an apple'
    );
    expect(screen.getByPlaceholderText('Message Sparky…').props.editable).toBe(
      true
    );
    expect(
      screen.getByTestId('composer-send').props.accessibilityState.disabled
    ).toBe(false);
  });

  it('aborts upload and ignores a late transcript after the screen unmounts', async () => {
    const pending = deferred<{ text: string; model: string }>();
    mockTranscribe.mockReturnValueOnce(pending.promise);
    const screen = await startAiRecording();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Stop dictation'));
    });
    const signal = mockTranscribe.mock.calls[0]?.[0].signal;
    screen.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ text: 'late transcript', model: 'voice-model' });
    });
    expect(voiceTestState.__mockComposerSetText).not.toHaveBeenCalled();
  });

  it('stops the recorder and restores playback mode when navigating away', async () => {
    const audio = jest.requireMock<{
      useAudioRecorder: jest.Mock<MockRecorder>;
      setAudioModeAsync: jest.Mock;
    }>('expo-audio');
    const screen = await startAiRecording();
    const recorder = audio.useAudioRecorder.mock.results[0]
      ?.value as MockRecorder;
    screen.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(recorder.stop).toHaveBeenCalled();
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: false,
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('does not re-request granted microphone permission on Android', async () => {
    const audio = jest.requireMock<{
      getRecordingPermissionsAsync: jest.Mock;
      requestRecordingPermissionsAsync: jest.Mock;
    }>('expo-audio');
    audio.getRecordingPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const screen = await startAiRecording();
    expect(screen.getByLabelText('Stop dictation')).toBeTruthy();
    expect(audio.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    screen.unmount();
    await act(async () => {});
  });

  it('does not re-request granted system speech permissions', async () => {
    const { ExpoSpeechRecognitionModule: speech } = jest.requireMock<{
      ExpoSpeechRecognitionModule: {
        getPermissionsAsync: jest.Mock;
        requestPermissionsAsync: jest.Mock;
      };
    }>('expo-speech-recognition');
    speech.getPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const screen = renderScreen();
    await screen.findByPlaceholderText('Message Sparky…');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dictate message'));
    });
    expect(screen.getByLabelText('Stop dictation')).toBeTruthy();
    expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not start recording if microphone permission arrives after unmount', async () => {
    const pending = deferred<{ granted: boolean }>();
    const audio = jest.requireMock<{
      requestRecordingPermissionsAsync: jest.Mock<
        Promise<{ granted: boolean }>
      >;
      useAudioRecorder: jest.Mock<MockRecorder>;
    }>('expo-audio');
    audio.requestRecordingPermissionsAsync.mockReturnValueOnce(pending.promise);
    const screen = await startAiRecording();
    const recorder = audio.useAudioRecorder.mock.results[0]
      ?.value as MockRecorder;
    screen.unmount();
    await act(async () => {
      pending.resolve({ granted: true });
    });
    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('cancels system recognition when the app backgrounds', async () => {
    const appState = jest.mocked(AppState.addEventListener);
    const screen = renderScreen();
    await screen.findByPlaceholderText('Message Sparky…');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Dictate message'));
    });
    act(() =>
      appState.mock.calls
        .filter(([event]) => event === 'change')
        .forEach(([, handler]) => handler('background'))
    );
    const speech = jest.requireMock<{
      ExpoSpeechRecognitionModule: { abort: jest.Mock };
    }>('expo-speech-recognition');
    expect(speech.ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
    expect(screen.queryByLabelText('Listening')).toBeNull();
    expect(
      screen.getByTestId('composer-send').props.accessibilityState.disabled
    ).toBe(false);
  });
});

describe('ChatScreen history seeding', () => {
  it('seeds the runtime with the loaded history messages', async () => {
    const seed = [
      {
        id: 'm1',
        role: 'user',
        content: 'hi',
        parts: [{ type: 'text', text: 'hi' }],
      },
      {
        id: 'm2',
        role: 'assistant',
        content: 'hey',
        parts: [{ type: 'text', text: 'hey' }],
      },
    ];
    mockUseChatHistory.mockReturnValue({ data: seed, isLoading: false } as any);

    const { findByTestId } = renderScreen();
    await findByTestId('composer-send');

    expect((global as any).__mockCapturedMessages).toBe(seed);
  });

  it('holds the loading gate (no thread) while history is loading', async () => {
    mockUseChatHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);

    const { queryByText, queryByTestId } = renderScreen();
    // Flush the async server-config load so only the history gate remains.
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryByTestId('composer-send')).toBeNull();
    expect(
      queryByText(
        'Ask Sparky anything about your nutrition, exercise, or goals.'
      )
    ).toBeNull();
  });
});
