import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import i18n from 'i18next';
import { chatApprovalResponsesReady, chatArgsPreview } from '@workspace/shared';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { ToolFallback } from '@/components/tool-fallback';
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
  toolTitles: { mcp_mail: 'read_note' },
  approvalSummaries: {},
  approvalSources: { call: ['Notes'] },
};
const state = {
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
    content: [] as Array<{ type: string; toolName: string }>,
  },
  thread: { isRunning: false, messages: [] as { id: string; role: string }[] },
};
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    setQueriesData: jest.fn(),
  }),
}));
jest.mock('@assistant-ui/react', () => ({
  useScrollLock: () => jest.fn(),
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
  state.thread.messages = [];
  state.thread.isRunning = false;
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
  expect(screen.getByText('Tool (save)')).toBeInTheDocument();
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
  expect(screen.getByText('read note')).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }));
  expect(clear).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Delete this message'));
  expect(deleteChatMessage).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Delete'));
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
    toolTitles: { mcp_mail: 'read_note' },
    approvalSummaries: {},
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
  expect(screen.getByText('Entry id: entry-1')).toBeInTheDocument();
  expect(screen.queryByText(/After reading/)).not.toBeInTheDocument();
});
it('limits the inline argument preview while keeping full details', () => {
  const args = { action: 'delete_entry', entry_id: 'x'.repeat(200) };
  render(<ApprovalCard {...props} args={args} />);
  expect(screen.getByText('Entry id: ' + 'x'.repeat(200))).toBeInTheDocument();
  fireEvent.click(screen.getByText('Details'));
  expect(
    screen.getByText(
      (_text, node) =>
        node?.tagName === 'PRE' &&
        node.textContent === JSON.stringify(args, null, 2)
    )
  ).toBeInTheDocument();
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
        {...props}
        approval={{ id: 'approval', ...approval }}
        result={result}
        isError={isError}
      />
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByText('Allow')).not.toBeInTheDocument();
    if (status) expect(screen.getByText(status)).toBeInTheDocument();
  }
);
it('moves focus to the answered status and labels the card group', () => {
  render(<ApprovalCard {...props} />);
  expect(
    screen.getByRole('group', { name: 'Allow this step?' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByText('Deny'));
  expect(screen.getByRole('status')).toHaveFocus();
});
it('hides outside attribution during streaming', () => {
  state.message.status.type = 'running';
  const { container } = render(<OutsideSourceLine />);
  expect(container).toBeEmptyDOMElement();
  state.message.status.type = 'complete';
});
it('uses a generic outside label when no server-owned tool title is available', () => {
  render(<ApprovalCard {...props} toolName="mcp_secret_hash" />);
  expect(screen.queryByText(/mcp_secret_hash/)).not.toBeInTheDocument();
  expect(screen.getAllByText('an outside tool').length).toBeGreaterThan(0);
});
it('confirms before deletion and can cancel', () => {
  render(<OutsideSourceLine />);
  fireEvent.click(screen.getByText('Delete this message'));
  expect(screen.getByText('Delete this reply?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancel'));
  expect(deleteChatMessage).not.toHaveBeenCalled();
});

it('shows failed outside results with an alert icon, cleaned text and no raw tool ID', () => {
  const result =
    '<outside_tool_result server="Mail" tool="read_note">\nError [EXTERNAL_TOOL_UNAVAILABLE]: offline\n\nSuggestion: retry\n</outside_tool_result>';
  const { container } = render(
    <ToolFallback
      {...props}
      approval={undefined}
      toolName="mcp_mail"
      result={result}
      status={{ type: 'complete' }}
    />
  );
  expect(screen.getByText('Mail: read note')).toBeInTheDocument();
  expect(
    container.querySelector('[data-slot="tool-fallback-trigger-icon"]')
  ).toHaveClass('text-destructive');
  fireEvent.click(screen.getByText('Mail: read note'));
  expect(
    screen.getByText('Mail did not answer. Try again later.')
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/outside_tool_result|Suggestion:/)
  ).not.toBeInTheDocument();
});
it('cancels live pending controls when a later user message arrives', () => {
  const view = render(<ApprovalCard {...props} />);
  state.thread.messages = [
    { id: 'reply', role: 'assistant' },
    { id: 'new', role: 'user' },
  ];
  view.rerender(<ApprovalCard {...props} />);
  expect(screen.getByRole('heading', { name: 'Not run' })).toBeInTheDocument();
  expect(screen.queryByText('Allow')).not.toBeInTheDocument();
});
it('uses saved destructive summaries instead of argument previews', () => {
  state.message.metadata.custom.outsideSource = {
    ...source,
    approvalSummaries: {
      call: { text: 'Eggs, breakfast, Nov 13', kind: 'delete' },
    },
  };
  render(<ApprovalCard {...props} />);
  expect(
    screen.getByText('Eggs, breakfast, Nov 13').parentElement
  ).toHaveTextContent(
    'After reading Notes, Sparky wants to delete Eggs, breakfast, Nov 13.'
  );
  expect(screen.queryByText('Amount: 12')).not.toBeInTheDocument();
});

it('places cleanup buttons below the attribution sentence', () => {
  render(<OutsideSourceLine />);
  const container = screen.getByTestId('outside-source-line');
  expect(container.firstElementChild).toHaveTextContent(
    'Used Notes. Something look wrong?'
  );
  const remove = screen.getByRole('button', { name: 'Delete this message' });
  const clear = screen.getByRole('button', { name: 'Clear chat' });
  expect(remove.parentElement).toBe(clear.parentElement);
  expect(remove.parentElement).not.toBe(container.firstElementChild);
});
it('disables both cleanup actions while a reply is running', () => {
  state.thread.isRunning = true;
  render(<OutsideSourceLine />);
  expect(
    screen.getByRole('button', { name: 'Delete this message' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear chat' })).toBeDisabled();
});
it('shows only clear chat before the reply is saved', () => {
  state.message.metadata.custom.savedMessageId = undefined;
  render(<OutsideSourceLine />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(
    screen.getByRole('button', { name: 'Clear chat' })
  ).toBeInTheDocument();
});
it('shows units after argument values', () => {
  render(<ApprovalCard {...props} args={{ amount_ml: 250 }} />);
  expect(screen.getByText('Amount: 250 ml')).toBeInTheDocument();
});

it.each([
  'ml',
  'g',
  'kg',
  'lbs',
  'lb',
  'oz',
  'km',
  'mi',
  'min',
  'minutes',
  'seconds',
  'kcal',
])('moves the %s suffix from the argument key to its value', (unit) => {
  expect(chatArgsPreview({ [`total_amount_${unit}`]: 250 })).toBe(
    `Total amount: 250 ${unit}`
  );
});
it('keeps other keys intact and retains preview filtering and limits', () => {
  expect(
    chatArgsPreview({
      action: 'save',
      nested: {},
      omitted: undefined,
      entry_id: 'x',
      amount_ml_extra: 3,
      amount_ml: 0,
      fourth: 4,
    })
  ).toBe('Entry id: x · Amount ml extra: 3 · Amount: 0 ml');
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
        {...props}
        approval={{ id: 'approval', approved }}
        result={result}
        isError={isError}
      />
    );
    expect(
      screen.getByText(
        (_text, node) =>
          node?.tagName === 'P' && text.test(node.textContent ?? '')
      )
    ).toBeInTheDocument();
    if (result !== undefined || !approved)
      expect(screen.queryByText(/wants to/)).not.toBeInTheDocument();
  }
);
it('formats inline calendar dates while preserving exact arguments in Details', () => {
  const date = `${new Date().getFullYear()}-01-02`;
  render(<ApprovalCard {...props} args={{ entry_date: date }} />);
  expect(screen.getByText('Entry date: Jan 2')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Details'));
  expect(screen.getByText(new RegExp(date))).toBeInTheDocument();
});
