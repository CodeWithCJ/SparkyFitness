import { Alert, AccessibilityInfo } from 'react-native';
import {
  act,
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
  toolTitles: { mcp_mail: 'read_note' },
  approvalSummaries: {},
  approvalSources: { call: ['Notes'] },
};
const mockState = {
  message: {
    id: 'reply',
    role: 'assistant',
    status: { type: 'complete' },
    metadata: {
      custom: {
        outsideSource: source,
        savedMessageId: 'saved-id' as string | undefined,
      },
    },
    content: [] as { type: string; toolName: string }[],
  },
  thread: { isRunning: false, messages: [] as { id: string; role: string }[] },
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
  mockState.thread.messages = [];
  mockState.thread.isRunning = false;
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(jest.fn());
  jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
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
  expect(screen.getByText(/Tool.*save/)).toBeTruthy();
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
  expect(screen.getByText('read note')).toBeTruthy();
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
  fireEvent.press(screen.getByRole('button', { name: 'Clear chat' }));
  expect(clear).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('outside-delete-message'));
  expect(deleteChatMessage).not.toHaveBeenCalled();
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  await act(async () => {
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
  });
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
    toolTitles: { mcp_mail: 'read_note' },
    approvalSummaries: {},
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
  expect(
    screen.getByTestId('approval-arguments', { includeHiddenElements: true })
      .props.children
  ).toBe('Entry id: entry-1');
  expect(screen.queryByText(/After reading/)).toBeNull();
});
it('limits inline arguments and retains full details', () => {
  const args = { action: 'delete_entry', entry_id: 'x'.repeat(200) };
  render(<ApprovalCard part={{ ...props, args }} />);
  expect(
    screen.getByTestId('approval-arguments', { includeHiddenElements: true })
      .props.children
  ).toBe('Entry id: ' + 'x'.repeat(200));
  fireEvent.press(screen.getByTestId('approval-details'));
  expect(screen.getByText(JSON.stringify(args, null, 2))).toBeTruthy();
});

it.each([
  [{ approved: true }, undefined, false, 'Allowed', 'Working on it…'],
  [{ approved: true }, 'saved', false, 'Allowed', 'Done'],
  [
    { approved: true },
    'Error [EXTERNAL_TOOL_ERROR]: refused',
    false,
    "Allowed, but it didn't work",
    undefined,
  ],
  [
    { approved: true },
    'Could not save',
    true,
    "Allowed, but it didn't work",
    undefined,
  ],
  [{ approved: false }, undefined, false, 'Denied', 'Nothing was changed.'],
  [
    { resolution: 'cancelled' },
    undefined,
    false,
    'Not run',
    'You sent a new message first.',
  ],
  [
    { approved: false, reason: 'A new user message cancelled this call.' },
    undefined,
    false,
    'Not run',
    'You sent a new message first.',
  ],
] as const)(
  'renders approval result state %j',
  (approval, result, isError, title, status) => {
    render(
      <ApprovalCard
        part={{
          ...props,
          approval: { id: 'approval', ...approval },
          result,
          isError,
        }}
      />
    );
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
    expect(screen.queryByText('Allow')).toBeNull();
    if (status) expect(screen.getByText(status)).toBeTruthy();
  }
);
it('announces pending cards and marks Details expanded', () => {
  render(<ApprovalCard part={props} />);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    'Sparky needs your answer: Allow this step?'
  );
  fireEvent.press(screen.getByTestId('approval-details'));
  expect(
    screen.getByTestId('approval-details').props.accessibilityState.expanded
  ).toBe(true);
});
it('hides outside attribution during streaming', () => {
  mockState.message.status.type = 'running';
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(screen.queryByTestId('outside-source-line')).toBeNull();
  mockState.message.status.type = 'complete';
});
it('cancels live pending controls when a later user message arrives', () => {
  const view = render(<ApprovalCard part={props} />);
  mockState.thread.messages = [
    { id: 'reply', role: 'assistant' },
    { id: 'new', role: 'user' },
  ];
  view.rerender(<ApprovalCard part={props} />);
  expect(screen.getByRole('header', { name: 'Not run' })).toBeTruthy();
  expect(screen.queryByText('Allow')).toBeNull();
});
it('uses saved destructive summaries instead of argument previews', () => {
  mockState.message.metadata.custom.outsideSource = {
    ...source,
    approvalSummaries: {
      call: { text: 'Eggs, breakfast, Nov 13', kind: 'delete' },
    },
  };
  render(<ApprovalCard part={props} />);
  expect(screen.getByText('Eggs, breakfast, Nov 13')).toBeTruthy();
  expect(
    screen.queryByTestId('approval-arguments', { includeHiddenElements: true })
  ).toBeNull();
});

it('places separately accessible cleanup buttons below the attribution', () => {
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  const line = screen.getByText(/Used .*Something look wrong\?/);
  for (const [id, name] of [
    ['outside-delete-message', 'Delete this message'],
    ['outside-clear-chat', 'Clear chat'],
  ]) {
    const button = screen.getByRole('button', { name });
    expect(button).toBe(screen.getByTestId(id));
    expect(button.props.hitSlop).toEqual({
      top: 12,
      bottom: 12,
      left: 8,
      right: 8,
    });
    expect(button.parent).not.toBe(line);
  }
});
it('disables both cleanup actions while a reply is running', () => {
  mockState.thread.isRunning = true;
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(
    screen.getByRole('button', { name: 'Delete this message' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear chat' })).toBeDisabled();
});
it('shows only clear chat before the reply is saved', () => {
  mockState.message.metadata.custom.savedMessageId = undefined;
  render(<OutsideSourceLine onClearChat={jest.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Clear chat' })).toBeTruthy();
});
it('shows units after argument values', () => {
  render(<ApprovalCard part={{ ...props, args: { amount_ml: 250 } }} />);
  expect(
    screen.getByText('Amount: 250 ml', { includeHiddenElements: true })
  ).toBeTruthy();
});

it.each([
  // Allowed but not finished: nothing has changed yet.
  [true, undefined, false, /Sparky wants to run/],
  [true, 'done', false, /Sparky ran/],
  [true, 'Error [FAILED]: offline', true, /Sparky tried to run/],
  [false, undefined, false, /Sparky wanted to run/],
] as const)(
  'uses the answered tense (approved %s, result %s)',
  (approved, result, isError, text) => {
    render(
      <ApprovalCard
        part={{
          ...props,
          approval: { id: 'approval', approved },
          result,
          isError,
        }}
      />
    );
    expect(screen.getByText(text)).toBeTruthy();
    if (result !== undefined || !approved)
      expect(screen.queryByText(/wants to/)).toBeNull();
  }
);
it('formats inline calendar dates while preserving exact arguments in Details', () => {
  const date = `${new Date().getFullYear()}-01-02`;
  render(<ApprovalCard part={{ ...props, args: { entry_date: date } }} />);
  expect(
    screen.getByTestId('approval-arguments', { includeHiddenElements: true })
      .props.children
  ).toBe('Entry date: Jan 2');
  fireEvent.press(screen.getByTestId('approval-details'));
  expect(
    screen.getByText(JSON.stringify({ entry_date: date }, null, 2))
  ).toBeTruthy();
});
