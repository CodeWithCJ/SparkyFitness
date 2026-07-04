import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
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

jest.mock('@assistant-ui/react-ai-sdk', () => ({
  __esModule: true,
  AssistantChatTransport: class AssistantChatTransport {},
  useChatRuntime: (options: { onError?: (error: Error) => void; messages?: unknown }) => {
    (global as any).__mockCapturedOnError = options?.onError;
    (global as any).__mockCapturedMessages = options?.messages;
    return {};
  },
}));

jest.mock('@assistant-ui/react-native', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  const Box = ({ children, style }: any) => React.createElement(View, { style }, children);
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
      Messages: React.forwardRef(({ children: _children, ...props }: any, ref: any) => {
        React.useImperativeHandle(ref, () => ({
          scrollToEnd: (options: unknown) => (global as any).__mockMessagesScrollToEnd?.(options),
        }));
        return React.createElement(View, { testID: 'thread-messages', ...props });
      }),
      If: ({ children, running, empty }: any) => {
        if (running !== undefined) {
          return running === !!(global as any).__mockChatIsRunning ? children : null;
        }
        if (empty !== undefined) {
          return empty === ((global as any).__mockChatIsEmpty !== false) ? children : null;
        }
        return children;
      },
      Suggestion: ({ children, prompt }: any) =>
        React.createElement(Pressable, { testID: `suggestion-${prompt}` }, children),
    },
    ComposerPrimitive: {
      Root: Box,
      Input: () => React.createElement(View, { testID: 'composer-input' }),
      Send: ({ children }: any) => React.createElement(View, { testID: 'composer-send' }, children),
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
          typeof children === 'function' ? children({ isCopied: false }) : children
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

jest.mock('../../src/hooks', () => ({
  useActiveAiServiceSetting: jest.fn(),
  useChatHistory: jest.fn(),
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
const mockUseActiveAiServiceSetting = useActiveAiServiceSetting as jest.MockedFunction<
  typeof useActiveAiServiceSetting
>;
const mockUseChatHistory = useChatHistory as jest.MockedFunction<typeof useChatHistory>;

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

const SERVER_CONFIG = { id: 'srv-1', url: 'https://sparky.example', proxyHeaders: [] } as any;
const ACTIVE_SETTING = { id: 'svc-1', service_type: 'openai' } as any;

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).__mockChatIsRunning = false;
  (global as any).__mockChatIsEmpty = true;
  (global as any).__mockCapturedOnError = undefined;
  (global as any).__mockCapturedMessages = undefined;
  (global as any).__mockMessagesScrollToEnd = undefined;
  (global as any).__mockComposerText = '';
  (global as any).__mockComposerSetText = jest.fn();
  (global as any).__mockComposerDeferEchoes = false;
  mockGetActiveServerConfig.mockResolvedValue(SERVER_CONFIG);
  mockUseActiveAiServiceSetting.mockReturnValue({ data: ACTIVE_SETTING, isLoading: false } as any);
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
    mockUseActiveAiServiceSetting.mockReturnValue({ data: undefined, isLoading: false } as any);
    const { findByText } = renderScreen();
    expect(await findByText(/No active AI provider/i)).toBeTruthy();
  });
});

describe('ChatScreen thread', () => {
  it('renders the empty state with the configured starter suggestions', async () => {
    const { findByText, getByText } = renderScreen();
    expect(
      await findByText('Ask Sparky anything about your nutrition, exercise, or goals.')
    ).toBeTruthy();
    expect(getByText('Log two eggs and a banana for breakfast')).toBeTruthy();
    expect(getByText('Suggest a high-protein snack')).toBeTruthy();
  });

  it('shows the up-arrow send button while idle and swaps to a Stop button while running', async () => {
    const { findByTestId, getByTestId, queryByTestId, rerender } = renderScreen();
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

    const onError = (global as any).__mockCapturedOnError as ((e: Error) => void) | undefined;
    expect(onError).toBeDefined();
    act(() => {
      onError?.(new Error('bad config'));
    });

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Chat error', text2: 'bad config' })
    );
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
    const { findByPlaceholderText, getByPlaceholderText, rerender } = render(makeTree());
    const input = await findByPlaceholderText('Message Sparky…');

    // Type "a" -> "ab" -> "abc", then backspace to "ab". Echoes are deferred, so
    // the queue accumulates ["a", "ab", "abc", "ab"] with a duplicate "ab".
    fireEvent.changeText(input, 'a');
    fireEvent.changeText(input, 'ab');
    fireEvent.changeText(input, 'abc');
    fireEvent.changeText(input, 'ab');

    expect((global as any).__mockComposerSetText.mock.calls.map((c: string[]) => c[0])).toEqual([
      'a',
      'ab',
      'abc',
      'ab',
    ]);
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
      mockNavigation.addListener.mock.calls.some(([event]: [string]) => event === 'transitionEnd')
    ).toBe(true);
  });
});

describe('ChatScreen history seeding', () => {
  it('seeds the runtime with the loaded history messages', async () => {
    const seed = [
      { id: 'm1', role: 'user', content: 'hi', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'm2', role: 'assistant', content: 'hey', parts: [{ type: 'text', text: 'hey' }] },
    ];
    mockUseChatHistory.mockReturnValue({ data: seed, isLoading: false } as any);

    const { findByTestId } = renderScreen();
    await findByTestId('composer-send');

    expect((global as any).__mockCapturedMessages).toBe(seed);
  });

  it('holds the loading gate (no thread) while history is loading', async () => {
    mockUseChatHistory.mockReturnValue({ data: undefined, isLoading: true } as any);

    const { queryByText, queryByTestId } = renderScreen();
    // Flush the async server-config load so only the history gate remains.
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryByTestId('composer-send')).toBeNull();
    expect(
      queryByText('Ask Sparky anything about your nutrition, exercise, or goals.')
    ).toBeNull();
  });
});
