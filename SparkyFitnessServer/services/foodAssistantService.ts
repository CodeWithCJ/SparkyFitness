import {
  createFoodAssistantTaskSchema,
  checkpointFoodAssistantTaskSchema,
  changeFoodAssistantTaskSchema,
  rememberFoodAssistantPreferenceSchema,
  type CheckpointFoodAssistantTask,
} from '@workspace/shared';
import * as repository from '../models/foodAssistantRepository.js';

export {
  listPreferences,
  listTasks,
  getTask,
  listOperations,
} from '../models/foodAssistantRepository.js';

export function createTask(userId: string, input: unknown) {
  return repository.createTask(
    userId,
    createFoodAssistantTaskSchema.parse(input)
  );
}

export function checkpointTask(
  userId: string,
  taskId: string,
  input: CheckpointFoodAssistantTask
) {
  const data = checkpointFoodAssistantTaskSchema.parse(input);
  return repository.mutateTask(
    userId,
    {
      taskId,
      operationId: data.operation_id,
      expectedVersion: data.expected_version,
      kind: 'checkpoint',
      request: data,
    },
    async (task) => ({
      ...task,
      status: data.status,
      checkpoint: data.checkpoint,
    })
  );
}

export function changeTask(
  userId: string,
  taskId: string,
  action: 'cancel' | 'resume',
  input: unknown
) {
  const data = changeFoodAssistantTaskSchema.parse(input);
  return repository.mutateTask(
    userId,
    {
      taskId,
      operationId: data.operation_id,
      expectedVersion: data.expected_version,
      kind: action,
      request: data,
      allowCancelled: action === 'resume',
    },
    async (task) => ({
      ...task,
      status: action === 'cancel' ? 'cancelled' : 'draft',
    })
  );
}

export async function rememberPreference(
  userId: string,
  input: unknown,
  latestUserText: string | undefined,
  fromSettings = false
) {
  const data = rememberFoodAssistantPreferenceSchema.parse(input);
  const explicitMemory = /\b(remember|from now on|my preference)\b/i.test(
    data.source_quote
  );
  const enduring =
    /\b(always|never|i prefer|i (?:do not|don't) eat|i(?: am|'m) allergic)\b/i.test(
      data.source_quote
    );
  const oneOff =
    /\b(today|tonight|this (?:meal|time|week)|for (?:lunch|dinner|breakfast)|just (?:this|for))\b/i.test(
      preferenceSentence(latestUserText ?? '', data.source_quote)
    );
  if (
    !fromSettings &&
    (!latestUserText?.includes(data.source_quote) ||
      oneOff ||
      (!explicitMemory && !enduring))
  ) {
    throw new repository.FoodAssistantConflict(
      'Only an explicit lasting preference in the current user message can be remembered. Ask the user to state what to remember.'
    );
  }
  return repository.rememberPreference(userId, data);
}

function preferenceSentence(message: string, quote: string): string {
  const index = message.indexOf(quote);
  if (index < 0) return message;
  const start = message.slice(0, index).search(/[^.!?;\n]*$/);
  const end = message.slice(index + quote.length).search(/[.!?;\n]/);
  return message.slice(start, end < 0 ? undefined : index + quote.length + end);
}

/** Settings deletion is an explicit authenticated action; model calls must quote
 * a removal request from the independently captured current user message. */
export function forgetPreference(
  userId: string,
  key: string,
  expectedVersion: number,
  sourceQuote?: string,
  latestUserText?: string,
  fromSettings = false
) {
  // A bounded command grammar binds the request to this saved key. A recipe's
  // removal instruction or an arbitrary quote containing "delete" is not consent.
  const quote = sourceQuote
    ?.normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/_/g, ' ')
    .trim();
  const message = latestUserText?.normalize('NFKC').replace(/[’‘]/g, "'");
  const namedKey = key.replace(/_/g, ' ').toLowerCase();
  const removal =
    /^(?:(?:please|can you|could you|would you|will you|i want you to)\s+)*(?:forget|remove|delete|clear|erase|stop remembering)\s+(?:(?:my|the)\s+)?(.+?)(?:,?\s+please)?[.!?]?$/i.exec(
      quote ?? ''
    );
  const targets = [
    `${namedKey} preference`,
    `${namedKey} food preference`,
    `preference ${namedKey}`,
    `saved preference ${namedKey}`,
    ...['for', 'about', 'named', 'called'].map(
      (word) => `preference ${word} ${namedKey}`
    ),
  ];
  if (
    !fromSettings &&
    (!sourceQuote?.trim() ||
      !latestUserText?.includes(sourceQuote) ||
      !quote ||
      !targets.includes(removal?.[1].toLowerCase() ?? '') ||
      /\b(don't|do not|never|not to)\b[^.!?\n]{0,80}\b(forget|remove|delete|clear|erase|stop remembering)\b/i.test(
        message ?? ''
      ))
  ) {
    throw new repository.FoodAssistantConflict(
      `Forgetting a preference needs an explicit current user request naming it, such as "Forget my ${key} preference". Use Food preferences to remove it directly.`
    );
  }
  return repository.forgetPreference(userId, key, expectedVersion);
}
