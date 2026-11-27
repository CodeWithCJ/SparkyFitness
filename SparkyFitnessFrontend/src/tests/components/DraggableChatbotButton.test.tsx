import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DraggableChatbotButton from '@/components/DraggableChatbotButton';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const toggleChat = jest.fn();
const openCoachChat = jest.fn();
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({
    toggleChat,
    openCoachChat,
    isChatOpen: false,
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

let mockProvider: object | null = { id: 'svc' };
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: mockProvider }),
}));

let mockCoaches = false;
let mockUnread: {
  total: number;
  by_coach: { coach_id: string; count: number; latest_at: string }[];
} = { total: 0, by_coach: [] };
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useCoachesAvailable: () => mockCoaches,
  useCoachUnread: () => ({ data: mockUnread }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  localStorage.clear();
  mockProvider = { id: 'svc' };
  mockCoaches = false;
  mockUnread = { total: 0, by_coach: [] };
});
afterEach(() => jest.useRealTimers());

const open = () => screen.getByRole('button', { name: 'Open AI Chat' });

describe('DraggableChatbotButton', () => {
  it('has no badge without unread coach messages', () => {
    mockCoaches = true;
    render(<DraggableChatbotButton />);
    expect(
      screen.queryByTestId('chatbot-unread-badge')
    ).not.toBeInTheDocument();
  });

  it('shows the unread count while coaches are on', () => {
    mockCoaches = true;
    mockUnread = {
      total: 2,
      by_coach: [
        { coach_id: 'c1', count: 2, latest_at: '2026-11-25T18:00:00Z' },
      ],
    };
    render(<DraggableChatbotButton />);
    expect(screen.getByTestId('chatbot-unread-badge')).toHaveTextContent('2');
  });

  it('never shows a badge while coaches are off', () => {
    mockUnread = {
      total: 3,
      by_coach: [
        { coach_id: 'c1', count: 3, latest_at: '2026-11-25T18:00:00Z' },
      ],
    };
    render(<DraggableChatbotButton />);
    expect(
      screen.queryByTestId('chatbot-unread-badge')
    ).not.toBeInTheDocument();
  });

  it('opens on the coach with the newest unread message', () => {
    mockCoaches = true;
    mockUnread = {
      total: 3,
      by_coach: [
        { coach_id: 'old', count: 1, latest_at: '2026-11-25T08:00:00Z' },
        { coach_id: 'new', count: 2, latest_at: '2026-11-25T19:00:00Z' },
      ],
    };
    render(<DraggableChatbotButton />);
    fireEvent.click(open());
    expect(openCoachChat).toHaveBeenCalledWith('new');
    expect(toggleChat).not.toHaveBeenCalled();
  });

  it('opens the ordinary chat when nothing is unread', () => {
    render(<DraggableChatbotButton />);
    fireEvent.click(open());
    expect(toggleChat).toHaveBeenCalled();
    expect(openCoachChat).not.toHaveBeenCalled();
  });

  it('shows without an AI provider only while coaches are on', () => {
    mockProvider = null;
    const { unmount } = render(<DraggableChatbotButton />);
    expect(screen.queryByRole('button', { name: 'Open AI Chat' })).toBeNull();
    unmount();
    mockCoaches = true;
    render(<DraggableChatbotButton />);
    expect(open()).toBeInTheDocument();
  });
});
