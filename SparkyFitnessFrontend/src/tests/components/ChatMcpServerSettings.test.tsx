import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatMcpServerSettings } from '@/components/ai/ChatMcpServerSettings';
import {
  getChatMcpServers,
  saveChatMcpServers,
} from '@/api/Chatbot/chatMcpService';

jest.mock('@/api/Chatbot/chatMcpService');
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner', isDemo: false } }),
}));
let mockActing = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActing }),
}));
const servers = [
  { id: 'notes', name: 'Notes', enabled: false },
  { id: 'tasks', name: 'Tasks', enabled: true },
];
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChatMcpServerSettings />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockActing = false;
  jest.mocked(getChatMcpServers).mockResolvedValue({ servers });
});
it('hides the section when no servers are available', async () => {
  jest.mocked(getChatMcpServers).mockResolvedValue({ servers: [] });
  show();
  await waitFor(() => expect(getChatMcpServers).toHaveBeenCalled());
  expect(
    screen.queryByText('Tools from outside servers')
  ).not.toBeInTheDocument();
});
it('hides and does not load while acting for someone', () => {
  mockActing = true;
  show();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(getChatMcpServers).not.toHaveBeenCalled();
});
it('saves the entire list and disables switches during the request', async () => {
  let finish!: (value: { servers: typeof servers }) => void;
  jest.mocked(saveChatMcpServers).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  show();
  const toggle = await screen.findByRole('switch', {
    name: 'Let chat use tools from Notes',
  });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(saveChatMcpServers).toHaveBeenCalledWith(
      ['notes', 'tasks'],
      expect.anything()
    )
  );
  expect(toggle).toBeDisabled();
  finish({ servers: servers.map((server) => ({ ...server, enabled: true })) });
  await waitFor(() => expect(toggle).not.toBeDisabled());
  expect(toggle).toBeChecked();
});
it('reverts the switch if saving fails', async () => {
  jest.mocked(saveChatMcpServers).mockRejectedValue(new Error('offline'));
  show();
  const toggle = await screen.findByRole('switch', {
    name: 'Let chat use tools from Notes',
  });
  fireEvent.click(toggle);
  await waitFor(() => expect(saveChatMcpServers).toHaveBeenCalled());
  await waitFor(() => expect(toggle).not.toBeDisabled());
  expect(toggle).not.toBeChecked();
});
