import { HttpApiError } from '@/api/api';
import i18n from 'i18next';
import translations from '../../../public/locales/en/translation.json';
beforeAll(() =>
  i18n.addResourceBundle('en', 'translation', translations, true, true)
);
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
  { id: 'notes', name: 'Notes', send_user_id: false, enabled: false },
  { id: 'tasks', name: 'Tasks', send_user_id: true, enabled: true },
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
  expect(screen.queryByText('Outside tools')).not.toBeInTheDocument();
});
it('hides and does not load while acting for someone', () => {
  mockActing = true;
  show();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(getChatMcpServers).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Outside tools are off while you view someone else's profile."
    )
  ).toBeInTheDocument();
});
it('sends separate choices for quick toggles while another save is pending', async () => {
  const finishes: ((value: { servers: typeof servers }) => void)[] = [];
  jest.mocked(saveChatMcpServers).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishes.push(resolve);
      })
  );
  show();
  const toggle = await screen.findByRole('switch', {
    name: 'Let Sparky use Notes',
  });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(saveChatMcpServers).toHaveBeenCalledWith(
      { server_id: 'notes', enabled: true, send_user_id: false },
      expect.anything()
    )
  );
  expect(toggle).toBeDisabled();
  const other = screen.getByRole('switch', { name: 'Let Sparky use Tasks' });
  expect(other).not.toBeDisabled();
  fireEvent.click(other);
  await waitFor(() =>
    expect(saveChatMcpServers).toHaveBeenNthCalledWith(
      2,
      { server_id: 'tasks', enabled: false, send_user_id: true },
      expect.anything()
    )
  );
  const saved = {
    servers: servers.map((server) => ({
      ...server,
      send_user_id: true,
      enabled: true,
    })),
  };
  jest.mocked(getChatMcpServers).mockResolvedValue(saved);
  // Both saves finish together; the list is still reloaded after them.
  for (const finish of finishes) finish(saved);
  await waitFor(() => expect(toggle).not.toBeDisabled());
  expect(toggle).toBeChecked();
  await waitFor(() =>
    expect(jest.mocked(getChatMcpServers).mock.calls.length).toBeGreaterThan(1)
  );
});
it('reverts the switch if saving fails', async () => {
  jest.mocked(saveChatMcpServers).mockRejectedValue(new Error('offline'));
  show();
  const toggle = await screen.findByRole('switch', {
    name: 'Let Sparky use Notes',
  });
  fireEvent.click(toggle);
  await waitFor(() => expect(saveChatMcpServers).toHaveBeenCalled());
  await waitFor(() => expect(toggle).not.toBeDisabled());
  expect(toggle).not.toBeChecked();
});

it('shows account ID sharing only for servers configured to send it', async () => {
  show();
  expect(await screen.findAllByText('Sees your account ID.')).toHaveLength(1);
});

it('reloads the list after a 409 instead of keeping the stale switch', async () => {
  const current = servers.map((server, index) => ({
    ...server,
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  }));
  jest
    .mocked(getChatMcpServers)
    .mockResolvedValueOnce({ servers: current })
    .mockResolvedValue({
      servers: current.map((server) => ({
        ...server,
        send_user_id: true,
        enabled: false,
      })),
    });
  jest
    .mocked(saveChatMcpServers)
    .mockRejectedValue(new HttpApiError('Conflict', 409));
  show();
  fireEvent.click(
    await screen.findByRole('switch', { name: 'Let Sparky use Notes' })
  );
  await waitFor(() =>
    expect(screen.getAllByText('Sees your account ID.')).toHaveLength(2)
  );
  expect(
    screen.getByRole('switch', { name: 'Let Sparky use Notes' })
  ).not.toBeChecked();
  expect(
    screen.getByRole('switch', { name: 'Let Sparky use Tasks' })
  ).not.toBeChecked();
});
