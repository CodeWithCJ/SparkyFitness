import type { ToolApprovalConfiguration, ToolSet } from 'ai';
import { ERRORS } from './tools/errors.js';
import { isToolCallAllowedReadOnly } from './mcp/toolAccess.js';

export interface ApprovalMessage {
  id?: string;
  role: string;
  content?: unknown;
  parts?: ApprovalPart[];
}

export interface ApprovalPart {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  toolCallId?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
}

type ResultStep = {
  toolResults?: ReadonlyArray<{ toolName: string }>;
  content?: ReadonlyArray<{ type: string; toolName?: string }>;
};

export const CHAT_APPROVAL_EXEMPT_TOOLS = new Set([
  'sparky_ask_user', // Renders a question locally; sends nothing outside and changes no data.
  'sparky_enable_tools', // Widens this request's local tool selection only.
  'sparky_daily_checkin_wizard', // Returns a fixed question; persists nothing and makes no requests.
]);

export function needsOutsideApproval(name: string, input: unknown): boolean {
  return (
    name.startsWith('mcp_') ||
    (!CHAT_APPROVAL_EXEMPT_TOOLS.has(name) &&
      !isToolCallAllowedReadOnly(name, input))
  );
}

export function outsideResultSeen(
  messages: readonly ApprovalMessage[],
  steps: readonly ResultStep[] = []
): boolean {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.role === 'user' &&
      ((typeof message.content === 'string' && !!message.content.trim()) ||
        (
          message.parts ??
          (Array.isArray(message.content) ? message.content : [])
        ).some(
          (part: ApprovalPart) => part.type === 'text' && !!part.text?.trim()
        ))
    ) {
      lastUser = index;
      break;
    }
  }
  return (
    messages.slice(lastUser + 1).some(
      (message) =>
        message.role === 'assistant' &&
        (
          message.parts ??
          (Array.isArray(message.content) ? message.content : [])
        ).some(
          (part: ApprovalPart) =>
            part.type.startsWith('tool-mcp_') &&
            // An error's text came from the outside server too.
            ((Object.hasOwn(part, 'output') && part.output !== undefined) ||
              part.state === 'output-error')
        )
    ) ||
    steps.some(
      (step) =>
        step.toolResults?.some((result) =>
          result.toolName.startsWith('mcp_')
        ) ||
        // A tool error is not in toolResults, and its text is the server's.
        step.content?.some(
          (part) =>
            part.type === 'tool-error' && !!part.toolName?.startsWith('mcp_')
        )
    )
  );
}

export function createChatApprovalGate(messages: readonly ApprovalMessage[]) {
  let steps: readonly ResultStep[] = [];
  const toolApproval: ToolApprovalConfiguration<ToolSet, unknown> = ({
    toolCall,
    tools,
  }) => {
    if (!tools || !Object.hasOwn(tools, toolCall.toolName)) return 'denied';
    return outsideResultSeen(messages, steps) &&
      needsOutsideApproval(toolCall.toolName, toolCall.input)
      ? 'user-approval'
      : 'not-applicable';
  };
  return {
    toolApproval,
    prepareStep: (options: { steps: readonly ResultStep[] }) => {
      steps = options.steps;
    },
  };
}

export function refuseUnrenderableApprovals(
  tools: ToolSet,
  messages: readonly ApprovalMessage[]
): void {
  if (!outsideResultSeen(messages)) return;
  for (const [name, current] of Object.entries(tools)) {
    if (!current.execute) continue;
    const execute = current.execute;
    tools[name] = {
      ...current,
      execute: (input, options) =>
        needsOutsideApproval(name, input)
          ? ERRORS.FORBIDDEN(
              'This call requires approval in streaming chat with approval support.'
            )
          : execute(input, options),
    };
  }
}
