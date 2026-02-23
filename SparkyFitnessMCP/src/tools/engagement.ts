import { query } from "../db.js";

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
];

export const handleProactiveTool = async (name: string, args: any) => {
  if (name !== "check_engagement_triggers") return null;

  const { user_id = 1 } = args;

  // 1. Check for missed meals
  const lastMeal = await query(
    "SELECT entry_date, meal_type FROM food_entries WHERE user_id = $1 ORDER BY entry_date DESC, created_at DESC LIMIT 1",
    [user_id]
  );

  // 2. Logic to detect "nudge" moments
  // Simple example: if no meal today
  const today = new Date().toISOString().split('T')[0];
  if (lastMeal.rows.length === 0 || lastMeal.rows[0].entry_date !== today) {
      return {
          content: [{ type: "text", text: "TRIGGER_NUDGE: 'You haven't logged any food today. How are you doing with your goals?'" }]
      };
  }

  return {
    content: [{ type: "text", text: "No immediate nudges required." }],
  };
};
