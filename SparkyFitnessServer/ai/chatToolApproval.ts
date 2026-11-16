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

export const DESTRUCTIVE_ACTIONS: Readonly<Record<string, readonly string[]>> =
  {
    sparky_manage_allergens: ['remove_allergen'],
    sparky_manage_custom_nutrients: ['delete_custom_nutrient'],
    sparky_manage_exercise: ['delete_exercise_entry', 'delete_workout_preset'],
    sparky_manage_favorites: ['remove_favorite'],
    sparky_manage_food: ['delete_entry', 'delete_food'],
    sparky_food_assistant_state: ['forget_preference'],
    sparky_manage_meal_plans: ['delete_meal_plan'],
    sparky_manage_medications: [
      'delete_entry',
      'delete_medication',
      'delete_schedule',
    ],
    sparky_manage_progress_photos: ['delete_photo'],
    sparky_manage_run_program: ['start_run_program', 'realign_run_program'],
    sparky_manage_symptoms: ['delete_definition'],
    sparky_manage_water_containers: ['delete_water_container'],
    sparky_manage_workout_plans: ['delete_workout_plan'],
  };

export function isDestructiveToolCall(name: string, input: unknown): boolean {
  if (!Object.hasOwn(DESTRUCTIVE_ACTIONS, name)) return false;
  if (!input || typeof input !== 'object') return false;
  const args: Record<string, unknown> = { ...input };
  // Only action wrappers are lifted by the handlers. Ordinary nested data must
  // not replace the outer action and bypass a destructive-call approval.
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (DESTRUCTIVE_ACTIONS[name].includes(key)) return true;
      const nested: Record<string, unknown> = { ...value };
      if (nested.mode === 'delete' || nested.mode === 'delete_with_history')
        return true;
      if (
        [
          'set_food_notes',
          'update_entry',
          'update_medication',
          'set_run_program_schedule',
        ].includes(key)
      ) {
        Object.assign(args, nested);
        args.action = key;
      }
    }
  }
  if (args.mode === 'delete' || args.mode === 'delete_with_history')
    return true;
  // With no action the handler infers one, and an id alone can mean delete.
  if (!args.action) return true;
  if (typeof args.action !== 'string') return false;
  return (
    DESTRUCTIVE_ACTIONS[name].includes(args.action) ||
    (name === 'sparky_manage_food' &&
      args.action === 'set_food_notes' &&
      typeof args.notes === 'string' &&
      args.notes.trim() === '') ||
    (name === 'sparky_manage_medications' &&
      ['update_entry', 'update_medication'].includes(args.action) &&
      (args.notes === null || args.notes === '')) ||
    (name === 'sparky_manage_run_program' &&
      args.action === 'set_run_program_schedule' &&
      args.end_date === null)
  );
}

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
    return isDestructiveToolCall(toolCall.toolName, toolCall.input) ||
      (outsideResultSeen(messages, steps) &&
        needsOutsideApproval(toolCall.toolName, toolCall.input))
      ? 'user-approval'
      : 'not-applicable';
  };
  return {
    toolApproval,
    prepareStep: (options: { steps: readonly ResultStep[] }) => {
      steps = options.steps;
    },
    restrictActiveTools: (names: readonly string[]) =>
      outsideResultSeen(messages, steps)
        ? names.filter((name) => name !== 'web_search')
        : [...names],
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
