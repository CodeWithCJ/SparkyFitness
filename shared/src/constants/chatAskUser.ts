/**
 * The chat-only `sparky_ask_user` tool: how Sparky offers tappable quick-reply
 * chips instead of making the user retype an answer.
 *
 * Shared source of truth so the server (which publishes the tool schema) and
 * the frontend (which registers the assistant-ui renderer for this tool name)
 * cannot drift.
 *
 * These chips are always asked BEFORE the action, never after it. An
 * "we logged it, tap to correct" flow is not viable here: correcting an entry
 * needs its id, which came back in a previous turn's tool result, and tool
 * results are stripped from the LLM window (see toCoreMessages in
 * services/chatService.ts) — so the model cannot reliably perform the fix it
 * would be offering. Get the value right before writing to the diary.
 */
export const ASK_USER_TOOL_NAME = 'sparky_ask_user';

/**
 * - `choose`: a lookup returned several genuinely different candidates, so the
 *   options are those real candidates and picking one is the only way forward.
 * - `ask`: a value is genuinely ambiguous and cannot be safely defaulted (e.g.
 *   how much one pancake weighs, when the food is only sold by the gram), and a
 *   wrong guess would write a bad diary entry.
 *
 * Neither mode logs anything. Details that CAN be safely defaulted (meal type
 * from the time of day, today's date, a single clear food match) are never
 * asked about — they are just logged.
 */
export const ASK_USER_MODES = ['choose', 'ask'] as const;

export type AskUserMode = (typeof ASK_USER_MODES)[number];

/** Chips stop being scannable past a handful; also caps model verbosity. */
export const MAX_ASK_USER_OPTIONS = 4;
export const MIN_ASK_USER_OPTIONS = 2;
export const MAX_ASK_USER_OPTION_LENGTH = 48;

export interface AskUserInput {
  mode: AskUserMode;
  question: string;
  options: string[];
}
