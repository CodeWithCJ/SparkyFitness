import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageHabitsSchema, manageHabitsInput, type ManageHabitsInput } from "../schemas/habits.js";
import * as habitService from "../services/habitService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation, formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

const VALID_ACTIONS = ["list_habits", "log_habit", "get_habit_history"];

export function registerHabitTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_habits",
    {
      title: "Manage Habits",
      description: `Habit tracking: list habits, log completions, and view history.
      
Actions:
- list_habits() — returns all habits (custom categories with boolean type)
- log_habit(habit_id, entry_date, completed) — logs whether a habit was done on a specific date
- get_habit_history(habit_id, start_date?, end_date?) — returns completion history for a habit`,
      inputSchema: manageHabitsInput,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const parsed = manageHabitsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
      }
      const args: ManageHabitsInput = parsed.data;
      try {
        switch (args.action) {
          case "list_habits": {
            const habits = await habitService.listHabits(userId);
            return formatList(
              habits,
              "Available Habits",
              (h: any) => `**${h.display_name || h.name}**\n  ID: ${h.id}`
            );
          }

          case "log_habit": {
            await habitService.logHabit(userId, {
              habit_id: args.habit_id,
              entry_date: args.entry_date,
              completed: args.completed,
            });
            return formatConfirmation(
              `Habit ${args.completed ? "completed" : "not completed"} for ${args.entry_date}.`,
              { habit_id: args.habit_id, entry_date: args.entry_date, completed: args.completed }
            );
          }

          case "get_habit_history": {
            const history = await habitService.getHabitHistory(userId, {
              habit_id: args.habit_id,
              start_date: args.start_date,
              end_date: args.end_date,
            });
            return formatList(
              history,
              "Habit History",
              (h: any) => `${h.entry_date}: ${h.completed ? "✅ Completed" : "❌ Missed"}`
            );
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }
      } catch (error) {
        console.error("[Habit Tool] Error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );
}
