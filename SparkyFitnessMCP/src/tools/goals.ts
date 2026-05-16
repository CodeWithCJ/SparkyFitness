import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageGoalsSchema, type ManageGoalsInput } from "../schemas/goals.js";
import * as goalService from "../services/goalService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation, formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

const VALID_ACTIONS = ["get_goals", "set_goals", "list_goal_timeline"];

export function registerGoalTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_goals",
    {
      title: "Manage Goals",
      description: `Target management: set and view calorie, macro, water, and weight goals.
      
Actions:
- get_goals(target_date?) — returns the goals active on a specific date
- set_goals(start_date, calories?, protein?, carbs?, fat?, water_goal_ml?, weight?) — sets new goals from a start date
- list_goal_timeline() — lists all goal changes over time`,
      inputSchema: manageGoalsSchema,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as ManageGoalsInput;
      try {
        switch (args.action) {
          case "get_goals": {
            const goals = await goalService.getGoals(userId, args.target_date);
            let text = `### Goals for ${args.target_date || "today"}\n\n`;
            text += `- **Calories:** ${goals.calories || 2000} kcal\n`;
            text += `- **Protein:** ${goals.protein || 150}g\n`;
            text += `- **Carbs:** ${goals.carbs || 250}g\n`;
            text += `- **Fat:** ${goals.fat || 67}g\n`;
            text += `- **Water:** ${goals.water_goal_ml || 2000}ml\n`;
            
            return {
              content: [{ type: "text", text }],
              structuredContent: goals,
            };
          }

          case "set_goals": {
            await goalService.setGoals(userId, {
              start_date: args.start_date,
              calories: args.calories,
              protein: args.protein,
              carbs: args.carbs,
              fat: args.fat,
              water_goal_ml: args.water_goal_ml,
            });
            return formatConfirmation(`Goals set successfully starting from ${args.start_date}.`, { start_date: args.start_date });
          }

          case "list_goal_timeline": {
            const timeline = await goalService.listGoalTimeline(userId);
            return formatList(
              timeline,
              "Goal Timeline",
              (g: any) => `**${g.goal_date}**: ${g.calories} kcal | P: ${g.protein}g | C: ${g.carbs}g | F: ${g.fat}g | W: ${g.water_goal_ml}ml`
            );
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }
      } catch (error) {
        console.error("[Goal Tool] Error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );
}
