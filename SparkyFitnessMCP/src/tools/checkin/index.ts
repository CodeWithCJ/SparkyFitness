import * as database from "./database.js";
import { log } from "../food/utils.js";

export const checkinTools = [
  {
    name: "manage_checkin",
    description: "Primary tool for health tracking. Use this to log your WEIGHT, daily step count, height, body measurements (waist, neck, hips), mood, sleep duration/quality, and fasting windows. Supports providing health details across multiple turns.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "log_biometrics", 
            "log_custom_metric", 
            "list_categories", 
            "create_category", 
            "log_mood", 
            "log_fasting", 
            "log_sleep",
            "list_checkin_diary"
          ],
          description: "The health-related action to perform.",
        },
        // Common fields
        entry_date: { type: "string", description: "The absolute date of the record in 'YYYY-MM-DD' format. The AI must calculate this date based on the user's relative time (e.g., 'yesterday', '3 days ago') and the current reference date." },
        
        // Biometrics fields
        weight: { type: "number", description: "Weight value." },
        weight_unit: { type: "string", enum: ["kg", "lbs", "lb", "g"], description: "The unit for the weight (defaults to kg)." },
        steps: { type: "number", description: "Step count." },
        height: { type: "number", description: "Height value." },
        height_unit: { type: "string", enum: ["cm", "in", "inch", "ft"], description: "The unit for height." },
        neck: { type: "number", description: "Neck measurement." },
        waist: { type: "number", description: "Waist measurement." },
        hips: { type: "number", description: "Hips measurement." },
        measurements_unit: { type: "string", enum: ["cm", "in", "inch"], description: "The unit for body measurements." },
        body_fat: { type: "number", description: "Body fat percentage." },

        // Custom Metric fields
        category_name: { type: "string", description: "Name of the custom category (e.g., Blood Pressure)." },
        value: { type: ["string", "number"], description: "The value to record." },
        unit: { type: "string", description: "Unit for the new category." },
        notes: { type: "string", description: "Optional notes." },

        // Mood fields
        mood_value: { type: "number", description: "Mood score (typically 1-10)." },

        // Fasting fields
        start_time: { type: "string", description: "Start timestamp (ISO 8601)." },
        end_time: { type: "string", description: "End timestamp (ISO 8601)." },
        fasting_status: { type: "string", enum: ["ACTIVE", "COMPLETED", "CANCELLED"] },
        fasting_type: { type: "string" },

        // Sleep fields
        duration_seconds: { type: "number", description: "Total sleep duration in seconds." },
        sleep_score: { type: "number", description: "Sleep quality score (0-100)." },
        bedtime: { type: "string", description: "Bedtime timestamp (ISO 8601)." },
        wake_time: { type: "string", description: "Wake up timestamp (ISO 8601)." },
        source: { type: "string", description: "Source of data (e.g., manual, Garmin, Fitbit)." }
      },
      required: ["action"],
      additionalProperties: true
    },
  },
];

export const handleCheckinTool = async (name: string, args: any) => {
  if (name !== "manage_checkin") return null;

  const { action } = args;

  try {
    switch (action) {
      case "log_biometrics": return await database.upsertBiometrics(args);
      case "list_categories": return await database.manageCustomMetrics({ ...args, action: "list_categories" });
      case "create_category": return await database.manageCustomMetrics({ ...args, action: "create_category" });
      case "log_custom_metric": return await database.manageCustomMetrics({ ...args, action: "log_value" });
      case "log_mood": return await database.logMood({ ...args, value: args.mood_value });
      case "log_fasting": return await database.logFasting({ ...args, status: args.fasting_status, type: args.fasting_type });
      case "log_sleep": return await database.logSleep({ ...args, score: args.sleep_score });
      case "list_checkin_diary": return await database.listHealthDiary(args);

      default:
        return {
          content: [{ type: "text", text: `Action ${action} not implemented.` }],
          isError: true
        };
    }
  } catch (error: any) {
    log(`Error executing check-in action ${action}:`, error);
    return {
      content: [{ type: "text", text: `Error executing ${action}: ${error.message}` }],
      isError: true
    };
  }
};
