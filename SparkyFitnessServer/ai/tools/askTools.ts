import { tool } from 'ai';
import { z } from 'zod';
import {
  ASK_USER_MODES,
  ASK_USER_TOOL_NAME,
  MAX_ASK_USER_OPTIONS,
  MAX_ASK_USER_OPTION_LENGTH,
  MIN_ASK_USER_OPTIONS,
} from '@workspace/shared';
import { formatZodError } from './errors.js';

const AskUserSchema = z.object({
  mode: z
    .enum(ASK_USER_MODES)
    .describe(
      "'choose' = a lookup returned several genuinely different candidates and the options are those candidates. " +
        "'ask' = a value is ambiguous and cannot be safely guessed (e.g. the weight of one pancake). " +
        'In BOTH cases you must NOT have logged anything yet — you are asking first.'
    ),
  question: z
    .string()
    .min(1)
    .describe(
      'The question or prompt shown above the options. Also state it in your normal reply text.'
    ),
  options: z
    .array(z.string().min(1).max(MAX_ASK_USER_OPTION_LENGTH))
    .min(MIN_ASK_USER_OPTIONS)
    .max(MAX_ASK_USER_OPTIONS)
    .describe(
      'The tappable answers, phrased exactly as the user would say them ("75g each", not "Tell me 75g"). ' +
        `${MIN_ASK_USER_OPTIONS}-${MAX_ASK_USER_OPTIONS} short options.`
    ),
});

/**
 * Chat-only clarification tool: renders the options as tappable quick-reply
 * chips in the chat UI (tapping one just sends that text as the user's next
 * message, so the model sees an ordinary reply).
 *
 * The agent loop is stopped as soon as this is called — see the
 * hasToolCall(ASK_USER_TOOL_NAME) stop condition in services/chatService.ts —
 * so the model cannot answer its own question. execute() is a stateless echo:
 * it exists only so the tool call always has a matching tool result (an
 * unanswered tool_use is rejected by Anthropic/OpenAI), and so the memoized
 * tool map stays shareable across requests. The chips are rendered from the
 * recorded tool call itself, not from this return value.
 *
 * Not part of the MCP surface: an MCP client has no chip UI and would just
 * receive a dead question.
 */
export function buildAskTools() {
  return {
    [ASK_USER_TOOL_NAME]: tool({
      description:
        'Asks the user a question with tappable options, BEFORE taking an action that a wrong guess would get wrong. ' +
        'Use it when a lookup returned several genuinely different matches, or when a value cannot be safely defaulted (e.g. the user gave a count like "5 pancakes" but the food is only measured in grams). ' +
        "Do NOT use it for details you can safely default (meal type, today's date, a single clear match) — just log those. " +
        'Do NOT use it for anything another tool can answer, or for a detail the user already gave you. Log nothing until they reply.',
      inputSchema: AskUserSchema,
      execute: async (rawArgs) => {
        const parsed = AskUserSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        return `Presented ${parsed.data.options.length} options to the user. Stop and wait for their reply — do not answer for them.`;
      },
    }),
  };
}
