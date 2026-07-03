import { tool } from 'ai';
import { log } from '../../config/logging.js';
import habitRepository from '../../models/habitRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { dayString, formatConfirmation, formatList } from './formatting.js';
import {
  manageHabitsSchema,
  manageHabitsInput,
  type ManageHabitsInput,
} from './schemas/habits.js';

const VALID_ACTIONS = ['list_habits', 'log_habit', 'get_habit_history'];

export function buildHabitTools(userId: string) {
  return {
    sparky_manage_habits: tool({
      description: `Habit tracking: list habits, log completions, and view history.
      
Actions:
- list_habits() — returns all habits (custom categories with boolean type)
- log_habit(habit_id, entry_date, completed) — logs whether a habit was done on a specific date
- get_habit_history(habit_id, start_date?, end_date?) — returns completion history for a habit`,
      inputSchema: manageHabitsInput,
      execute: async (rawArgs) => {
        const parsed = manageHabitsSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageHabitsInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_habits': {
              const habits = await habitRepository.listHabits(userId);
              return formatList(
                habits,
                'Available Habits',
                (h: any) => `**${h.display_name || h.name}**\n  ID: ${h.id}`
              );
            }

            case 'log_habit': {
              await habitRepository.upsertHabitLog(
                userId,
                args.habit_id,
                args.entry_date,
                args.completed ? 'true' : 'false'
              );
              return formatConfirmation(
                `Habit ${args.completed ? 'completed' : 'not completed'} for ${args.entry_date}.`
              );
            }

            case 'get_habit_history': {
              const rows = await habitRepository.getHabitHistory(
                userId,
                args.habit_id,
                args.start_date,
                args.end_date
              );
              const history = rows.map((row: any) => ({
                id: row.id,
                completed: row.value === 'true',
                entry_date: dayString(row.entry_date),
                created_at: row.created_at,
              }));
              return formatList(
                history,
                'Habit History',
                (h: any) =>
                  `${h.entry_date}: ${h.completed ? '✅ Completed' : '❌ Missed'}`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Habit Tool] Error:', error);
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}
