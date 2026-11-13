import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import i18n from '../../../src/localization/i18n';
import translations from '../../../src/localization/locales/en/translation.json';
import type { ToolCallMessagePart } from '@assistant-ui/react-native';
import ApprovalCard from '../../../src/components/chat/ApprovalCard';
import OutsideSourceLine from '../../../src/components/chat/OutsideSourceLine';
import { deleteChatMessage } from '../../../src/services/api/chatApi';

const mockRespond = jest.fn();
const mockRemove = jest.fn();
const mockPartSelector = jest.fn(() => ({
  respondToToolApproval: mockRespond,
}));
const source = {
  servers: ['Notes'],
  toolServers: { mcp_mail: 'Mail' },
  approvalSources: { call: ['Notes'] },
};
const mockState = {
  message: {
    role: 'assistant',
    metadata: {
      custom: {
        outsideSource: source,
        savedMessageId: 'saved-id' as string | undefined,
      },
    },
    content: [] as { type: string; toolName: string }[],
  },
  thread: { isRunning: false },
};
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    setQueriesData: jest.fn(),
  }),
}));
jest.mock('@assistant-ui/react-native', () => ({
  useAui: () => ({
    message: () => ({ part: mockPartSelector, delete: mockRemove }),
  }),
  useAuiState: (selector: (s: typeof mockState) => unknown) =>
    selector(mockState),
}));
jest.mock('../../../src/services/api/chatApi', () => ({
  deleteChatMessage: jest.fn(),
}));
const props = {
  toolName: 'sparky_write',
  toolCallId: 'call',
  args: { action: 'save', amount: 12 },
  argsText: '{}',
  approval: { id: 'approval', prompt: 'EVIL description' },
} as unknown as ToolCallMessagePart;
beforeAll(() =>
  i18n.addResourceBundle('en', 'translation', translations, true, true)
);
beforeEach(() => {
  jest.clearAllMocks();
  mockRespond.mockResolvedValue(undefined);
  mockRemove.mockResolvedValue(undefined);
  jest.mocked(deleteChatMessage).mockResolvedValue(undefined);
  mockState.message.role = 'assistant';
  mockState.message.metadata.custom.outsideSource = {
    ...source,
    servers: ['Notes'],
  };
  mockState.message.metadata.custom.savedMessageId = 'saved-id';
  mockState.message.content = [];
});
it('uses only app text and server/tool/action, with exact arguments in Details', () => {
  render(<ApprovalCard part={props} />);
  expect(screen.getByText('Allow this step?')).toBeTruthy();
  expect(screen.getByText('Notes')).toBeTruthy();
  expect(screen.getByText(/Write.*save/)).toBeTruthy();
  expect(screen.queryByText(/EVIL/)).toBeNull();
  fireEvent.press(screen.getByTestId('approval-details'));
  expect(screen.getByText(/"amount": 12/)).toBeTruthy();
});
it.each([
  ['Allow', true, 'Allowed'],
  ['Deny', false, 'Denied'],
] as const)(
  'sends %s through the approval API once',
  async (label, approved, answered) => {
    render(<ApprovalCard part={props} />);
    fireEvent.press(screen.getByText(label));
    expect(screen.getByText(answered)).toBeTruthy();
    await waitFor(() => expect(mockRespond).toHaveBeenCalledWith({ approved }));
    expect(mockPartSelector).toHaveBeenCalledWith({ toolCallId: 'call' });
    expect(mockRespond).toHaveBeenCalledTimes(1);
  }
);
it('shows the target row name for an outside call and no action suffix', () => {
  render(<ApprovalCard part={{ ...props, toolName: 'mcp_mail' }} />);
  expect(screen.getByText('Mail')).toBeTruthy();
  expect(screen.getByText(/Mcp mail/)).toBeTruthy();
  expect(screen.queryByText(/\(save\)/)).toBeNull();
});
it('renders a persisted answer', () => {
  render(
    <ApprovalCard
      part={{ ...props, approval: { id: 'approval', approved: false } }}
    />
  );
  expect(screen.getByText('Denied')).toBeTruthy();
  expect(screen.queryByText('Allow')).toBeNull();
});
it('deletes the saved row then removes it from the runtime, and uses the clear flow', async () => {
  const clear = jest.fn();
  render(<OutsideSourceLine onClearChat={clear} />);
  fireEvent.press(screen.getByText('clear the chat'));
  expect(clear).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Delete this message'));
  await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1));
  expect(deleteChatMessage).toHaveBeenCalledWith('saved-id');
});
it('hides delete before persistence', () => {
  mockState.message.metadata.custom.savedMessageId = undefined;
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(screen.queryByText('Delete this message')).toBeNull();
});
it('hides the line for local-only replies', () => {
  mockState.message.metadata.custom.outsideSource.servers = [];
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(screen.queryByTestId('outside-source-line')).toBeNull();
});
it('shows the line for legacy outside tool parts', () => {
  mockState.message.metadata.custom.outsideSource.servers = [];
  mockState.message.content = [{ type: 'tool-call', toolName: 'mcp_mail' }];
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(screen.getByText('Mail')).toBeTruthy();
});

it('uses plain wording and inline arguments without an outside result', () => {
  mockState.message.metadata.custom.outsideSource = {
    servers: [],
    toolServers: { mcp_mail: 'Mail' },
    approvalSources: { call: [] },
  };
  render(
    <ApprovalCard
      part={{
        ...props,
        toolName: 'sparky_manage_food',
        args: { action: 'delete_entry', entry_id: 'entry-1' },
      }}
    />
  );
  expect(screen.getByText(/Sparky wants to run/)).toBeTruthy();
  expect(screen.getByTestId('approval-arguments').props.children).toBe(
    '{"action":"delete_entry","entry_id":"entry-1"}'
  );
  expect(screen.queryByText(/After reading/)).toBeNull();
});
it('limits inline arguments and retains full details', () => {
  const args = { action: 'delete_entry', entry_id: 'x'.repeat(200) };
  render(<ApprovalCard part={{ ...props, args }} />);
  expect(screen.getByTestId('approval-arguments').props.children).toBe(
    JSON.stringify(args).slice(0, 120) + '…'
  );
  fireEvent.press(screen.getByTestId('approval-details'));
  expect(screen.getByText(JSON.stringify(args, null, 2))).toBeTruthy();
});
