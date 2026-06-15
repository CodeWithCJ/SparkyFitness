import { z } from 'zod';
import { dateSchema, optionalDateSchema, uuidSchema } from './common.js';

const listHabitsSchema = z
  .object({
    action: z.literal('list_habits'),
  })
  .strict();

const logHabitSchema = z
  .object({
    action: z.literal('log_habit'),
    habit_id: uuidSchema.describe('UUID of the habit'),
    entry_date: dateSchema.describe('Date to log the habit for'),
    completed: z.boolean().describe('Whether the habit was completed'),
  })
  .strict();

const getHabitHistorySchema = z
  .object({
    action: z.literal('get_habit_history'),
    habit_id: uuidSchema.describe('UUID of the habit'),
    start_date: optionalDateSchema,
    end_date: optionalDateSchema,
  })
  .strict();

export const manageHabitsSchema = z.discriminatedUnion('action', [
  listHabitsSchema,
  logHabitSchema,
  getHabitHistorySchema,
]);

export type ManageHabitsInput = z.infer<typeof manageHabitsSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via `manageHabitsSchema.safeParse`.
export const manageHabitsInput = z.object({
  action: z
    .enum(['list_habits', 'log_habit', 'get_habit_history'])
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  habit_id: uuidSchema
    .optional()
    .describe('log_habit / get_habit_history: UUID of the habit'),
  entry_date: dateSchema
    .optional()
    .describe('log_habit: date to log the habit for'),
  completed: z
    .boolean()
    .optional()
    .describe('log_habit: whether the habit was completed'),
  start_date: optionalDateSchema.describe(
    'get_habit_history: range start date'
  ),
  end_date: optionalDateSchema.describe('get_habit_history: range end date'),
});
