import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";

export const proactiveTools = [
  {
    name: "check_engagement_triggers",
    description: "Scan the user's data for moments that require a proactive nudge (e.g., missed workout, plateau, achievement).",
    inputSchema: {
      type: "object",
      properties: {
        user_id: { type: "number", description: "The ID of the user to check (default 1)." }
      }
    },
  },
  {
    name: "get_logging_streak",
    description: "Get the user's current consecutive logging streak for any health or fitness data.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_contextual_nudge",
    description: "Generate a context-aware nudge based on recent user activity or inactivity.",
    inputSchema: { type: "object", properties: {} },
  },
];

export const handleProactiveTool = async (name: string, args: any) => {
  if (name !== "check_engagement_triggers" && name !== "get_logging_streak" && name !== "get_contextual_nudge") return null;

  switch (name) {
    case "check_engagement_triggers":
      const { user_id = MOCK_USER_ID } = args; // Use MOCK_USER_ID as default
      const lastMeal = await query(
        "SELECT entry_date, meal_type FROM food_entries WHERE user_id = $1 ORDER BY entry_date DESC, created_at DESC LIMIT 1",
        [user_id]
      );

      const today = new Date().toISOString().split('T')[0];
      if (lastMeal.rows.length === 0 || lastMeal.rows[0].entry_date !== today) {
        return {
          content: [{ type: "text", text: "TRIGGER_NUDGE: 'You haven't logged any food today. How are you doing with your goals?'" }]
        };
      }
      return {
        content: [{ type: "text", text: "No immediate nudges required." }],
      };

    case "get_logging_streak":
      // Placeholder for streak calculation logic
      return {
        content: [{ type: "text", text: "Logging streak calculation: Feature coming soon!" }]
      };

    case "get_contextual_nudge":
      // Placeholder for contextual nudge logic
      return {
        content: [{ type: "text", text: "Contextual nudge generation: Feature coming soon!" }]
      };

    default:
      return null;
  }
};
