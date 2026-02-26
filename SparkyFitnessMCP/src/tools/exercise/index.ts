import * as database from "./database.js";
import { log } from "../food/utils.js"; // Reuse logging helper

export const exerciseTools = [
  {
    name: "manage_exercise",
    description: "Primary tool for fitness tracking. Use this to search for exercises, log workouts (multi-set support), manage routines, and view your exercise history. If an exercise is missing, it will be automatically created. Supports providing details across multiple turns.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "search_exercises", 
            "create_exercise", 
            "log_exercise", 
            "list_exercise_diary", 
            "get_workout_presets", 
            "log_workout_preset",
            "delete_exercise_entry"
          ],
          description: "The exercise-related action to perform.",
        },
        // Common fields
        entry_date: { type: "string", description: "The absolute date of the record in 'YYYY-MM-DD' format. The AI must calculate this date based on the user's relative time and the current reference date." },
        
        // Search/Create fields
        searchTerm: { type: "string", description: "Name or part of exercise name." },
        muscleGroup: { type: "string", description: "Muscle group to filter by (e.g., Chest, Biceps)." },
        equipment: { type: "string", description: "Equipment to filter by (e.g., Dumbbell, None)." },
        name: { type: "string", description: "Full name for a new exercise." },
        category: { type: "string", description: "Category (Strength, Cardio, etc)." },
        calories_per_hour: { type: "number" },
        description: { type: "string" },
        
        // Log fields
        exercise_id: { type: "string", description: "UUID of the exercise." },
        exercise_name: { type: "string", description: "Name of the exercise to log (alternative to ID)." },
        duration_minutes: { type: "number" },
        calories_burned: { type: "number" },
        notes: { type: "string" },
        sets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              reps: { type: "number" },
              weight: { type: "number", description: "Weight in kg (if applicable)." },
              duration: { type: "number", description: "Duration in seconds (if applicable)." },
              rest_time: { type: "number", description: "Rest time in seconds." },
              set_type: { type: "string", enum: ["Working Set", "Warmup", "Drop Set", "Failure"] }
            }
          }
        },

        // Preset fields
        preset_id: { type: "string", description: "UUID of the workout preset." },
        preset_name: { type: "string", description: "Name of the preset to log." },

        // Entry management
        entry_id: { type: "string", description: "UUID of the exercise entry to delete." }
      },
      required: ["action"],
      additionalProperties: true
    },
  },
];

export const handleExerciseTool = async (name: string, args: any) => {
  if (name !== "manage_exercise") return null;

  const { action } = args;

  try {
    switch (action) {
      case "search_exercises": return await database.searchExercises(args);
      case "create_exercise": return await database.createExercise(args);
      case "log_exercise": return await database.logExercise(args);
      case "list_exercise_diary": return await database.listExerciseDiary(args);
      case "get_workout_presets": return await database.getWorkoutPresets();
      case "log_workout_preset": return await database.logWorkoutPreset(args);
      
      case "delete_exercise_entry":
        // Direct deletion implementation
        const { entry_id } = args;
        // Logic will be added to database.ts if needed, but for now we can do simple queries
        return { content: [{ type: "text", text: "Delete action acknowledged. (Database logic for delete pending full expansion)" }] };

      default:
        return {
          content: [{ type: "text", text: `Action ${action} not implemented.` }],
          isError: true
        };
    }
  } catch (error: any) {
    log(`Error executing exercise action ${action}:`, error);
    return {
      content: [{ type: "text", text: `Error executing ${action}: ${error.message}` }],
      isError: true
    };
  }
};
