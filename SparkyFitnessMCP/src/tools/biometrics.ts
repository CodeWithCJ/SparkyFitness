import { query } from "../db.js";
import { MOCK_USER_ID } from "../config.js";

export const biometricTools = [
  {
    name: "manage_biometrics",
    description: "Log health metrics like weight, steps, sleep, and fasting windows.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["weight", "steps", "sleep", "fasting"], description: "The type of biometric to log." },
        value: { type: "number", description: "The numeric value for the metric." },
        unit: { type: "string", description: "The unit (e.g., kg, lbs, hours, mins)." },
        date: { type: "string", description: "The date of the record (YYYY-MM-DD)." },
      },
      required: ["type", "value"],
    },
  },
];

export const handleBiometricTool = async (name: string, args: any) => {
  if (name !== "manage_biometrics") return null;

  const { type, value, unit, date } = args;
  const entryDate = date || new Date().toISOString().split('T')[0];

  switch (type) {
    case "weight":
      await query(
        "INSERT INTO check_in_measurements (user_id, weight, entry_date) VALUES ($1, $2, $3)",
        [MOCK_USER_ID, value, entryDate]
      );
      return { content: [{ type: "text", text: `✅ Logged weight: ${value}${unit || 'kg'} for ${entryDate}.` }] };

    case "steps":
      await query(
        "INSERT INTO step_entries (user_id, steps, entry_date) VALUES ($1, $2, $3)",
        [MOCK_USER_ID, value, entryDate]
      );
      return { content: [{ type: "text", text: `✅ Logged steps: ${value} for ${entryDate}.` }] };

    default:
      return {
        content: [{ type: "text", text: `Logging for ${type} is coming in the next step!` }],
      };
  }
};
