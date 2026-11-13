import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import i18n from 'i18next';
import { chatApprovalResponsesReady } from '@workspace/shared';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { ApprovalCard } from '@/components/ai/ApprovalCard';
import { OutsideSourceLine } from '@/components/ai/OutsideSourceLine';
import { deleteChatMessage } from '@/api/Chatbot/sparkyChatService';
import translations from '../../../public/locales/en/translation.json';

const respond = jest.fn();
const remove = jest.fn();
const partSelector = jest.fn(() => ({ respondToToolApproval: respond }));
const source = {
  servers: ['Notes'],
  toolServers: { mcp_mail: 'Mail' },
  approvalSources: { call: ['Notes'] },
};
const state = {
  message: {
    role: 'assistant',
    metadata: {
      custom: {
        outsideSource: source,
        savedMessageId: 'saved-id' as string | undefined,
      },
    },
    content: [] as Array<{ type: string; toolName: string }>,
  },
  thread: { isRunning: false },
};
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    setQueriesData: jest.fn(),
  }),
}));
jest.mock('@assistant-ui/react', () => ({
  useAui: () => ({ message: () => ({ part: partSelector, delete: remove }) }),
  useAuiState: (selector: (s: typeof state) => unknown) => selector(state),
}));
jest.mock('@/api/Chatbot/sparkyChatService', () => ({
  deleteChatMessage: jest.fn(),
}));
const props = {
  toolName: 'sparky_write',
  toolCallId: 'call',
  args: { action: 'save', amount: 12 },
  argsText: '{}',
  approval: { id: 'approval', prompt: 'EVIL description' },
} as unknown as ToolCallMessagePartProps;
beforeAll(() =>
  i18n.addResourceBundle('en', 'translation', translations, true, true)
);
beforeEach(() => {
  jest.clearAllMocks();
  respond.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  jest.mocked(deleteChatMessage).mockResolvedValue(undefined);
  state.message.role = 'assistant';
  state.message.metadata.custom.outsideSource = {
    ...source,
    servers: ['Notes'],
  };
  state.message.metadata.custom.savedMessageId = 'saved-id';
  state.message.content = [];
});
it('uses only app text and server/tool/action, with exact arguments in Details', () => {
  render(<ApprovalCard {...props} />);
  expect(screen.getByText('Allow this step?')).toBeInTheDocument();
  expect(screen.getByText('Notes')).toBeInTheDocument();
  expect(screen.getByText('sparky_write (save)')).toBeInTheDocument();
  expect(screen.queryByText(/EVIL/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Details'));
  expect(screen.getByText(/"amount": 12/)).toBeInTheDocument();
});
it.each([
  ['Allow', true, 'Allowed'],
  ['Deny', false, 'Denied'],
] as const)(
  'sends %s through the approval API once',
  async (label, approved, answered) => {
    render(<ApprovalCard {...props} />);
    fireEvent.click(screen.getByText(label));
    expect(screen.getByText(answered)).toBeInTheDocument();
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ approved }));
    expect(partSelector).toHaveBeenCalledWith({ toolCallId: 'call' });
    expect(respond).toHaveBeenCalledTimes(1);
  }
);
it('shows the target row name for an outside call and no action suffix', () => {
  render(<ApprovalCard {...props} toolName="mcp_mail" />);
  expect(screen.getByText('Mail')).toBeInTheDocument();
  expect(screen.getByText('mcp_mail')).toBeInTheDocument();
  expect(screen.queryByText(/\(save\)/)).not.toBeInTheDocument();
});
it('renders a persisted answer', () => {
  render(
    <ApprovalCard {...props} approval={{ id: 'approval', approved: false }} />
  );
  expect(screen.getByText('Denied')).toBeInTheDocument();
  expect(screen.queryByText('Allow')).not.toBeInTheDocument();
});
it('deletes the saved row then removes it from the runtime, and uses the clear flow', async () => {
  const clear = jest.fn();
  render(<OutsideSourceLine onClearChat={clear} />);
  fireEvent.click(screen.getByText('clear the chat'));
  expect(clear).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Delete this message'));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  expect(deleteChatMessage).toHaveBeenCalledWith('saved-id');
});
it('hides delete before persistence', () => {
  state.message.metadata.custom.savedMessageId = undefined;
  render(<OutsideSourceLine />);
  expect(screen.queryByText('Delete this message')).not.toBeInTheDocument();
});
it('hides the line for local-only replies', () => {
  state.message.metadata.custom.outsideSource.servers = [];
  const { container } = render(<OutsideSourceLine />);
  expect(container).toBeEmptyDOMElement();
});
it('shows the line for legacy outside tool parts', () => {
  state.message.metadata.custom.outsideSource.servers = [];
  state.message.content = [{ type: 'tool-call', toolName: 'mcp_mail' }];
  render(<OutsideSourceLine />);
  expect(screen.getByText('Mail')).toBeInTheDocument();
});

it('waits for every approval response, including earlier steps, without changing saved ids', () => {
  const messages = [
    {
      id: 'saved-id',
      role: 'assistant',
      parts: [
        { type: 'tool-one', state: 'approval-requested' },
        { type: 'step-start' },
        { type: 'tool-two', state: 'approval-responded' },
      ],
    },
  ];
  expect(chatApprovalResponsesReady({ messages })).toBe(false);
  messages[0]!.parts[0]!.state = 'approval-responded';
  expect(chatApprovalResponsesReady({ messages })).toBe(true);
  expect(messages[0]!.id).toBe('saved-id');
  messages[0]!.parts.push({ type: 'tool-three', state: 'input-available' });
  expect(chatApprovalResponsesReady({ messages })).toBe(false);
});

it('shows plain delete wording and compact arguments without outside sources', () => {
  state.message.metadata.custom.outsideSource = {
    servers: [],
    toolServers: { mcp_mail: 'Mail' },
    approvalSources: { call: [] },
  };
  render(
    <ApprovalCard
      {...props}
      toolName="sparky_manage_food"
      args={{ action: 'delete_entry', entry_id: 'entry-1' }}
    />
  );
  expect(screen.getByText(/Sparky wants to run/)).toBeInTheDocument();
  expect(
    screen.getByText('{"action":"delete_entry","entry_id":"entry-1"}')
  ).toBeInTheDocument();
  expect(screen.queryByText(/After reading/)).not.toBeInTheDocument();
});
it('limits the inline argument preview while keeping full details', () => {
  const args = { action: 'delete_entry', entry_id: 'x'.repeat(200) };
  render(<ApprovalCard {...props} args={args} />);
  expect(
    screen.getByText(JSON.stringify(args).slice(0, 120) + '…')
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText('Details'));
  expect(
    screen.getByText(
      (_text, node) =>
        node?.tagName === 'PRE' &&
        node.textContent === JSON.stringify(args, null, 2)
    )
  ).toBeInTheDocument();
});
