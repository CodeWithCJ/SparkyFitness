import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SparkyChat from '@/pages/Chat/SparkyChat';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/pages/Chat/SparkyChatInterface', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({ isChatOpen: true, closeChat: jest.fn() }),
}));
jest.mock('@/hooks/AI/useSparkyChat', () => ({
  useClearChatHistoryMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/utils/chatConversationId', () => ({
  rotateChatConversationId: jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: mockActingOnBehalf ? 'family-member' : 'me',
    isActingOnBehalf: mockActingOnBehalf,
  }),
}));

const services = [
  { id: 'mine-1', service_name: 'Mine one', is_active: true },
  { id: 'mine-2', service_name: 'Mine two', is_active: true },
];
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useAIServices: () => ({ data: services }),
  useActiveAIService: () => ({ data: services[0] }),
  useUserAIPreferences: () => ({
    data: { active_ai_service_id: 'mine-1', auto_clear_history: 'never' },
  }),
  useUpdateUserAIPreferences: () => ({ mutate: jest.fn() }),
}));

describe('SparkyChat provider picker', () => {
  beforeEach(() => {
    mockActingOnBehalf = false;
  });

  it('offers a choice of provider in your own account', () => {
    render(<SparkyChat />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  // The picker saves to the account's preferences, which after a switch are the
  // family member's; chat keeps using your own active service.
  it("hides the picker in a family member's account but keeps the chat", () => {
    mockActingOnBehalf = true;

    render(<SparkyChat />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Sparky AI Coach')).toBeInTheDocument();
  });
});
