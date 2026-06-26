import '@testing-library/jest-dom';
import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChatbotVisibilityProvider,
  useChatbotVisibility,
} from '@/contexts/ChatbotVisibilityContext';

const STORAGE_KEY = 'chat_token_stats';

const TokenStatsProbe = () => {
  const { showTokenStats, setShowTokenStats } = useChatbotVisibility();
  return (
    <div>
      <span data-testid="value">{String(showTokenStats)}</span>
      <button type="button" onClick={() => setShowTokenStats(true)}>
        enable
      </button>
      <button type="button" onClick={() => setShowTokenStats(false)}>
        disable
      </button>
    </div>
  );
};

const renderProbe = () =>
  render(
    <ChatbotVisibilityProvider>
      <TokenStatsProbe />
    </ChatbotVisibilityProvider>
  );

describe('ChatbotVisibilityContext showTokenStats', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to false when nothing is persisted', () => {
    renderProbe();
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });

  it('initializes from a persisted "true"', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    renderProbe();
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('treats any non-"true" stored value as false', () => {
    localStorage.setItem(STORAGE_KEY, 'yes');
    renderProbe();
    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });

  it('persists the toggle to localStorage on change', () => {
    renderProbe();

    act(() => {
      fireEvent.click(screen.getByText('enable'));
    });
    expect(screen.getByTestId('value')).toHaveTextContent('true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    act(() => {
      fireEvent.click(screen.getByText('disable'));
    });
    expect(screen.getByTestId('value')).toHaveTextContent('false');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});
