import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ChatbotVisibilityProvider } from '@/contexts/ChatbotVisibilityContext';

// thread.tsx imports assistant-ui ESM (plus markdown/attachment trees) that jest
// cannot load from node_modules. Mock just those boundaries so the pure
// token-usage pieces under test load in isolation. `mockAuiState` feeds the
// selector-based useAuiState the wrappers call.
const mockAuiState: { current: unknown } = { current: undefined };

jest.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector(mockAuiState.current),
}));
jest.mock('@assistant-ui/react-ai-sdk', () => ({
  getThreadMessageTokenUsage: jest.fn(),
}));
jest.mock('@/components/markdown-text', () => ({ MarkdownText: () => null }));
jest.mock('@/components/attachment', () => ({
  ComposerAddAttachment: () => null,
  ComposerAttachments: () => null,
  UserMessageAttachments: () => null,
}));

import { getThreadMessageTokenUsage } from '@assistant-ui/react-ai-sdk';
import {
  TokenUsageLine,
  MessageTokenUsage,
  SessionTokenUsage,
} from '@/components/thread';

const mockedUsage = getThreadMessageTokenUsage as jest.MockedFunction<
  typeof getThreadMessageTokenUsage
>;

const LINE = '[data-slot="aui_token-usage-line"]';

const renderInProvider = (ui: ReactElement, showTokenStats: boolean) => {
  localStorage.setItem('chat_token_stats', String(showTokenStats));
  return render(<ChatbotVisibilityProvider>{ui}</ChatbotVisibilityProvider>);
};

describe('TokenUsageLine', () => {
  const line = (container: HTMLElement) =>
    container.querySelector(LINE) as HTMLElement | null;

  it('splits input into cached and uncached so the parts add up to the total', () => {
    const { container } = render(
      <TokenUsageLine
        inputTokens={65890}
        outputTokens={1051}
        totalTokens={66941}
        cachedInputTokens={63990}
      />
    );
    expect(line(container)?.textContent).toBe(
      '66.9K total · 64K cached · 1.9K uncached · 1.1K out'
    );
    // Exact counts stay available on hover.
    expect(line(container)?.title).toBe(
      '66,941 total · 63,990 cached · 1,900 uncached · 1,051 out'
    );
  });

  it('keeps a single input segment when the provider reports no cache reads', () => {
    for (const cachedInputTokens of [0, undefined]) {
      const { container, unmount } = render(
        <TokenUsageLine
          inputTokens={1240}
          outputTokens={380}
          totalTokens={1620}
          cachedInputTokens={cachedInputTokens}
        />
      );
      expect(line(container)?.textContent).toBe(
        '1.6K total · 1.2K in · 380 out'
      );
      unmount();
    }
  });

  it('derives the total from input and output when it is missing', () => {
    const { container } = render(
      <TokenUsageLine inputTokens={900} outputTokens={35} />
    );
    expect(line(container)?.textContent).toBe('935 total · 900 in · 35 out');
  });

  it('never shows negative uncached input', () => {
    const { container } = render(
      <TokenUsageLine
        inputTokens={100}
        outputTokens={10}
        totalTokens={110}
        cachedInputTokens={150}
      />
    );
    expect(line(container)?.textContent).toBe(
      '110 total · 150 cached · 0 uncached · 10 out'
    );
  });

  it('prefixes the label for the session total', () => {
    const { container } = render(
      <TokenUsageLine label="this session" totalTokens={8420} />
    );
    expect(line(container)?.textContent).toBe('this session: 8.4K total');
  });
});

describe('MessageTokenUsage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedUsage.mockReset();
    mockAuiState.current = { message: { role: 'assistant' } };
  });

  it('renders null when usage is undefined (mid-stream / no provider usage)', () => {
    mockedUsage.mockReturnValue(undefined);
    const { container } = renderInProvider(<MessageTokenUsage />, true);
    expect(container.querySelector(LINE)).toBeNull();
  });

  it('renders the line when usage is present and the toggle is on', () => {
    mockedUsage.mockReturnValue({
      inputTokens: 1240,
      outputTokens: 380,
      totalTokens: 1620,
      cachedInputTokens: 980,
    });
    const { container } = renderInProvider(<MessageTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      '1.6K total · 980 cached · 260 uncached · 380 out'
    );
  });

  it('renders null when the toggle is off even with usage present', () => {
    mockedUsage.mockReturnValue({ totalTokens: 1620 });
    const { container } = renderInProvider(<MessageTokenUsage />, false);
    expect(container.querySelector(LINE)).toBeNull();
  });
});

describe('SessionTokenUsage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedUsage.mockReset();
    // The adapter helper returns undefined for messages without usage (e.g.
    // restored history); the wrapper must skip those in the sum.
    mockedUsage.mockImplementation((m) => (m as { usage?: object })?.usage);
  });

  it('sums every usage field across messages, skipping ones without usage', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          {
            usage: {
              inputTokens: 65890,
              outputTokens: 1051,
              totalTokens: 66941,
              cachedInputTokens: 63990,
            },
          },
          {},
          {
            usage: {
              inputTokens: 67400,
              outputTokens: 640,
              totalTokens: 68040,
              cachedInputTokens: 66100,
            },
          },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      'this session: 135K total · 130.1K cached · 3.2K uncached · 1.7K out'
    );
  });

  it('omits segments no message reported', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          { usage: { totalTokens: 1240 } },
          { usage: { totalTokens: 380 } },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      'this session: 1.6K total'
    );
  });

  it('derives a missing total from input and output', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          { usage: { inputTokens: 900, outputTokens: 100 } },
          { usage: { inputTokens: 400, outputTokens: 100, totalTokens: 500 } },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      'this session: 1.5K total · 1.3K in · 200 out'
    );
  });

  it('drops a breakdown that does not cover every counted message', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          { usage: { totalTokens: 1000 } },
          {
            usage: {
              inputTokens: 400,
              outputTokens: 100,
              totalTokens: 500,
              cachedInputTokens: 300,
            },
          },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      'this session: 1.5K total'
    );
  });

  it('counts a message without cache reads as fully uncached', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          {
            usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
          },
          {
            usage: {
              inputTokens: 1000,
              outputTokens: 100,
              totalTokens: 1100,
              cachedInputTokens: 900,
            },
          },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      'this session: 2.2K total · 900 cached · 1.1K uncached · 200 out'
    );
  });

  it('renders null on a fresh thread with no usage yet', () => {
    mockAuiState.current = { thread: { messages: [{}, {}] } };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)).toBeNull();
  });
});
