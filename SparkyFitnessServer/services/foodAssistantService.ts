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
  forgetPreference,
} from '../models/foodAssistantRepository.js';

export function createTask(userId: string, input: unknown) {
  const data = createFoodAssistantTaskSchema.parse(input);
  if (data.origin.type !== 'user_draft')
    throw new repository.FoodAssistantConflict(
      'Source imports must use the recipe import actions so their original ingredient list is retained.'
    );
  return repository.createTask(userId, data);
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
    async (task) => {
      if (
        task.kind === 'recipe' &&
        task.checkpoint.ingredients.some(
          (ingredient) =>
            !data.checkpoint.ingredients.some(
              (next) => next.id === ingredient.id
            )
        )
      ) {
        throw new repository.FoodAssistantConflict(
          'A recipe checkpoint cannot silently drop ingredients. Use the explicit ingredient-removal action for a requested removal.'
        );
      }
      return { ...task, status: data.status, checkpoint: data.checkpoint };
    }
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
      latestUserText ?? ''
    );
  if (
    !fromSettings &&
    (!latestUserText?.includes(data.source_quote) ||
      (!explicitMemory && (!enduring || oneOff)))
  ) {
    throw new repository.FoodAssistantConflict(
      'Only an explicit lasting preference in the current user message can be remembered. Ask the user to state what to remember.'
    );
  }
  return repository.rememberPreference(userId, data);
}
