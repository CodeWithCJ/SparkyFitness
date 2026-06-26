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
  it('renders the per-message breakdown and omits cached at 0', () => {
    const { container } = render(
      <TokenUsageLine
        inputTokens={1240}
        outputTokens={380}
        totalTokens={1620}
        cachedInputTokens={0}
      />
    );
    expect(container.querySelector(LINE)?.textContent).toBe(
      `${(1240).toLocaleString()} in · ${(380).toLocaleString()} out · ${(1620).toLocaleString()} total`
    );
  });

  it('includes the cached segment when cached input is present', () => {
    const { container } = render(
      <TokenUsageLine
        inputTokens={1240}
        outputTokens={380}
        totalTokens={1620}
        cachedInputTokens={980}
      />
    );
    expect(container.querySelector(LINE)?.textContent).toBe(
      `${(1240).toLocaleString()} in · ${(380).toLocaleString()} out · ${(1620).toLocaleString()} total · ${(980).toLocaleString()} cached`
    );
  });

  it('renders the session label format when given a label', () => {
    const { container } = render(
      <TokenUsageLine label="this session" totalTokens={8420} />
    );
    expect(container.querySelector(LINE)?.textContent).toBe(
      `this session: ${(8420).toLocaleString()} tokens`
    );
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
      `${(1240).toLocaleString()} in · ${(380).toLocaleString()} out · ${(1620).toLocaleString()} total · ${(980).toLocaleString()} cached`
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
    // restored history); the wrapper's `?? 0` must tolerate that in the sum.
    mockedUsage.mockImplementation(
      (m) => (m as { usage?: { totalTokens?: number } })?.usage
    );
  });

  it('sums totals across messages, skipping ones without usage', () => {
    mockAuiState.current = {
      thread: {
        messages: [
          { usage: { totalTokens: 1240 } },
          {},
          { usage: { totalTokens: 380 } },
        ],
      },
    };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)?.textContent).toBe(
      `this session: ${(1620).toLocaleString()} tokens`
    );
  });

  it('renders null on a fresh thread with no usage yet', () => {
    mockAuiState.current = { thread: { messages: [{}, {}] } };
    const { container } = renderInProvider(<SessionTokenUsage />, true);
    expect(container.querySelector(LINE)).toBeNull();
  });
});
