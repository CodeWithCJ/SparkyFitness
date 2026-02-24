import { query } from "../db.js";
import { MOCK_USER_ID } from "../config.js";

export const fitnessTools = [
  {
    name: "manage_exercise",
    description: "Log and manage exercises and workouts. Supports sets, reps, weight, and distance.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["log", "create_preset"], description: "The action to perform." },
        name: { type: "string", description: "The name of the exercise." },
        sets: { type: "number", description: "Number of sets performed." },
        reps: { type: "number", description: "Number of repetitions per set." },
        weight: { type: "number", description: "Weight used (if applicable)." },
        distance: { type: "number", description: "Distance covered (if applicable)." },
        date: { type: "string", description: "The date of the exercise (YYYY-MM-DD)." },
      },
      required: ["action", "name"],
    },
  },
];

export const handleFitnessTool = async (name: string, args: any) => {
  if (name !== "manage_exercise") return null;

  const { action, name: exName, sets, reps, weight, distance, date } = args;

  switch (action) {
    case "log":
      const entryDate = date || new Date().toISOString().split('T')[0];
      
      // 1. Find or create exercise ID
      let exRes = await query("SELECT id FROM exercises WHERE name ILIKE $1 LIMIT 1", [exName]);
      let exId;
      
      if (exRes.rows.length === 0) {
        const newEx = await query("INSERT INTO exercises (name) VALUES ($1) RETURNING id", [exName]);
        exId = newEx.rows[0].id;
      } else {
        exId = exRes.rows[0].id;
      }

      // 2. Insert exercise entry
      await query(
        "INSERT INTO exercise_entries (user_id, exercise_id, entry_date) VALUES ($1, $2, $3)",
        [MOCK_USER_ID, exId, entryDate]
      );
      
      return {
        content: [{ type: "text", text: `✅ Logged ${exName} for ${entryDate}. Database entry created.` }],
      };

    default:
      return {
        content: [{ type: "text", text: `Action ${action} for Fitness not implemented yet.` }],
        isError: true
      };
  }
};
