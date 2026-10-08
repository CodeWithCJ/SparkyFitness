import { tool } from 'ai';
import { z } from 'zod';
import {
  createFoodAssistantTaskSchema,
  checkpointFoodAssistantTaskSchema,
  changeFoodAssistantTaskSchema,
  rememberFoodAssistantPreferenceSchema,
} from '@workspace/shared';
import * as service from '../../services/foodAssistantService.js';
import { FoodAssistantConflict } from '../../models/foodAssistantRepository.js';
import type { ToolBuildContext } from './index.js';
import { ERRORS, formatZodError } from './errors.js';

const actions = [
  'list_preferences',
  'remember_preference',
  'forget_preference',
  'list_tasks',
  'get_task',
  'start_task',
  'checkpoint_task',
  'cancel_task',
  'resume_task',
] as const;
const taskId = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_preferences') }).strict(),
  z
    .object({
      action: z.literal('remember_preference'),
      preference: rememberFoodAssistantPreferenceSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('forget_preference'),
      key: z.string().min(1).max(100),
      expected_version: z.number().int().positive(),
    })
    .strict(),
  z.object({ action: z.literal('list_tasks') }).strict(),
  z.object({ action: z.literal('get_task'), task_id: taskId }).strict(),
  z
    .object({
      action: z.literal('start_task'),
      task: createFoodAssistantTaskSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('checkpoint_task'),
      task_id: taskId,
      checkpoint: checkpointFoodAssistantTaskSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('cancel_task'),
      task_id: taskId,
      command: changeFoodAssistantTaskSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('resume_task'),
      task_id: taskId,
      command: changeFoodAssistantTaskSchema,
    })
    .strict(),
]);

export function buildFoodAssistantTools(
  userId: string,
  ctx?: ToolBuildContext
) {
  return {
    sparky_food_assistant_state: tool({
      description:
        'Read saved lasting food preferences and recover multi-step food tasks across chats. Start a task for recipes, meal planning, shopping or complex diary edits before doing work. Save checkpoints with selected food/variant IDs, source evidence, EVERY unresolved ingredient, and the next step. Unresolved nutrition is incomplete, never zero. Save before asking for input. A draft/checkpoint does not save a recipe, log diary food, or schedule a plan. Complete only through the relevant publication/mutation tool after persisted readback. Reuse operation_id and task creation id when retrying an identical request. Read current versions before changing existing state. Cancel stops future work; resume makes a draft available for explicit continuation and does not start background work. Remember only explicit enduring preferences quoted verbatim from the current user message; one-off requests override preferences for that request without changing memory. Forget only when requested.',
      inputSchema: z.object({
        action: z.enum(actions),
        task_id: taskId.optional(),
        task: createFoodAssistantTaskSchema.optional(),
        checkpoint: checkpointFoodAssistantTaskSchema.optional(),
        command: changeFoodAssistantTaskSchema.optional(),
        preference: rememberFoodAssistantPreferenceSchema.optional(),
        key: z.string().optional(),
        expected_version: z.number().optional(),
      }),
      execute: async (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return formatZodError(parsed.error);
        const args = parsed.data;
        try {
          switch (args.action) {
            case 'list_preferences':
              return JSON.stringify(await service.listPreferences(userId));
            case 'remember_preference':
              return JSON.stringify(
                await service.rememberPreference(
                  userId,
                  args.preference,
                  ctx?.latestUserText
                )
              );
            case 'forget_preference':
              await service.forgetPreference(
                userId,
                args.key,
                args.expected_version
              );
              return 'Preference forgotten.';
            case 'list_tasks':
              return JSON.stringify(await service.listTasks(userId));
            case 'get_task': {
              const task = await service.getTask(userId, args.task_id);
              return task
                ? JSON.stringify(task)
                : ERRORS.NOT_FOUND('Task', args.task_id);
            }
            case 'start_task':
              return JSON.stringify(
                await service.createTask(userId, args.task)
              );
            case 'checkpoint_task':
              return JSON.stringify(
                await service.checkpointTask(
                  userId,
                  args.task_id,
                  args.checkpoint
                )
              );
            case 'cancel_task':
              return JSON.stringify(
                await service.changeTask(
                  userId,
                  args.task_id,
                  'cancel',
                  args.command
                )
              );
            case 'resume_task':
              return JSON.stringify(
                await service.changeTask(
                  userId,
                  args.task_id,
                  'resume',
                  args.command
                )
              );
          }
        } catch (error) {
          return error instanceof FoodAssistantConflict
            ? ERRORS.VALIDATION(error.message)
            : ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
