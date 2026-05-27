import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageExerciseSchema, manageExerciseInput, type ManageExerciseInput } from "../schemas/exercise.js";
import * as exerciseService from "../services/exerciseService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation } from "../utils/formatting.js";
import type { ToolResponse, Exercise, ExerciseEntry, ExerciseSet } from "../types.js";

const VALID_ACTIONS = ["search_exercises", "create_exercise", "log_exercise", "list_exercise_diary", "get_workout_presets", "log_workout_preset", "delete_exercise_entry", "get_exercise_details", "create_workout_preset", "get_exercise_progress"];

export function registerExerciseTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_exercise",
    {
      title: "Manage Exercise",
      description: `Fitness tracking: search exercises, log workouts with sets, manage presets.

Actions:
- search_exercises(searchTerm, muscleGroup?, equipment?, limit?, offset?)
- create_exercise(name, category?, calories_per_hour?, description?)
- log_exercise(entry_date, exercise_id?|exercise_name?, duration_minutes?, calories_burned?, notes?, sets?:JSON string or array of [{reps,weight,duration,rest_time,set_type}])
- list_exercise_diary(entry_date)
- get_workout_presets()
- log_workout_preset(entry_date, preset_id?|preset_name?)
- delete_exercise_entry(entry_id)
- get_exercise_details(exercise_id?|exercise_name?)
- create_workout_preset(name, exercise_ids)
- get_exercise_progress(exercise_id?|exercise_name?, start_date?, end_date?) — returns performance history`,
      // Publish the flat shape so MCP clients see the available fields.
      // The SDK cannot serialize z.discriminatedUnion; manageExerciseSchema
      // is still used below via safeParse for strict per-action validation.
      inputSchema: manageExerciseInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const parsed = manageExerciseSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ERRORS.VALIDATION(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      const args: ManageExerciseInput = parsed.data;
      try {
        switch (args.action) {
          case "search_exercises": {
            const result = await exerciseService.searchExercises(
              userId, args.searchTerm, args.muscleGroup, args.equipment, args.limit, args.offset
            );
            return formatList(
              result.data,
              `Exercise Search: "${args.searchTerm}"`,
              (e: Exercise) => `**${e.name}** (${e.category || "Uncategorized"})\n  Muscles: ${e.muscle_groups?.join(", ") || "N/A"} | Equipment: ${e.equipment?.join(", ") || "None"}\n  ID: ${e.id}`,
              { total_count: result.total_count, has_more: result.has_more, next_offset: result.next_offset }
            );
          }

          case "create_exercise": {
            const exercise = await exerciseService.createExercise(
              userId, args.name, args.category, args.calories_per_hour, args.description
            );
            return formatConfirmation(`Exercise "${exercise.name}" created.`, { exercise });
          }

          case "log_exercise": {
            if (!args.exercise_id && !args.exercise_name) {
              return ERRORS.VALIDATION("Either exercise_id or exercise_name must be provided");
            }
            // Parse sets if it arrives as a JSON string (MCP serialisation quirk)
            let parsedSets: ExerciseSet[] | undefined;
            if (typeof args.sets === "string") {
              try { parsedSets = JSON.parse(args.sets); } catch { parsedSets = undefined; }
            } else {
              parsedSets = args.sets as ExerciseSet[] | undefined;
            }
            const entry = await exerciseService.logExercise(userId, {
              exercise_id: args.exercise_id,
              exercise_name: args.exercise_name,
              entry_date: args.entry_date,
              duration_minutes: args.duration_minutes,
              calories_burned: args.calories_burned,
              notes: args.notes,
              sets: parsedSets,
            });
            return formatConfirmation(
              `Exercise logged for ${args.entry_date}.`,
              { entry_id: entry.id, exercise_name: entry.exercise_name, sets_count: entry.sets.length }
            );
          }

          case "list_exercise_diary": {
            const entries = await exerciseService.listExerciseDiary(userId, args.entry_date);
            return formatList(
              entries,
              `Exercise Diary: ${args.entry_date}`,
              (e: ExerciseEntry) => {
                let text = `**${e.exercise_name}**`;
                if (e.sets.length > 0) text += ` — ${e.sets.length} sets`;
                if (e.duration_minutes) text += ` | ${e.duration_minutes} min`;
                if (e.calories_burned) text += ` | ${e.calories_burned} kcal`;
                if (e.notes) text += `\n  Notes: ${e.notes}`;
                text += `\n  ID: ${e.id}`;
                return text;
              }
            );
          }

          case "get_workout_presets": {
            const presets = await exerciseService.getWorkoutPresets(userId);
            return formatList(
              presets,
              "Workout Presets",
              (p) => `**${p.name}** — ${p.exercises.length} exercises\n  ID: ${p.id}`
            );
          }

          case "log_workout_preset": {
            if (!args.preset_id && !args.preset_name) {
              return ERRORS.VALIDATION("Either preset_id or preset_name must be provided");
            }
            const entries = await exerciseService.logWorkoutPreset(userId, {
              preset_id: args.preset_id,
              preset_name: args.preset_name,
              entry_date: args.entry_date,
            });
            return formatConfirmation(
              `Workout preset logged for ${args.entry_date}. ${entries.length} exercises added.`,
              { entries_count: entries.length, entry_date: args.entry_date }
            );
          }

          case "delete_exercise_entry": {
            const deleted = await exerciseService.deleteExerciseEntry(userId, args.entry_id);
            if (!deleted) return ERRORS.NOT_FOUND("Exercise Entry", args.entry_id);
            return formatConfirmation(`Exercise entry deleted.`, { entry_id: args.entry_id });
          }

          case "get_exercise_details": {
            const exercise = await exerciseService.getExerciseDetails(userId, {
              exercise_id: args.exercise_id,
              exercise_name: args.exercise_name,
            });
            let text = `### ${exercise.name}\n\n`;
            if (exercise.description) text += `*${exercise.description}*\n\n`;
            text += `**Category:** ${exercise.category}\n`;
            text += `**Equipment:** ${exercise.equipment?.join(", ") || "None"}\n`;
            text += `**Muscles:** ${exercise.muscle_groups?.join(", ") || "N/A"}\n\n`;
            
            if (exercise.instructions && exercise.instructions.length > 0) {
              text += `#### Instructions\n`;
              exercise.instructions.forEach((ins, i) => {
                text += `${i + 1}. ${ins}\n`;
              });
            }
            
            return {
              content: [{ type: "text", text }],
              structuredContent: { exercise },
            };
          }

          case "create_workout_preset": {
            const preset = await exerciseService.createWorkoutPreset(userId, {
              name: args.name,
              exercise_ids: args.exercise_ids,
            });
            return formatConfirmation(
              `Workout preset "${preset.name}" created with ${preset.exercises.length} exercises.`,
              { preset_id: preset.id, name: preset.name, exercises_count: preset.exercises.length }
            );
          }

          case "get_exercise_progress": {
            const progress = await exerciseService.getExerciseProgress(userId, {
              exercise_id: args.exercise_id,
              exercise_name: args.exercise_name,
              start_date: args.start_date,
              end_date: args.end_date,
            });
            return formatList(
              progress,
              `Exercise Progress: ${args.exercise_name || args.exercise_id}`,
              (p: any) => `**${p.entry_date}**: Max Weight: ${p.max_weight}kg | Max Reps: ${p.max_reps} | Volume: ${p.total_volume}kg`
            );
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }
      } catch (error) {
        console.error("[Exercise Tool] Error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          return ERRORS.NOT_FOUND("Resource", "unknown");
        }
        return ERRORS.DB_ERROR();
      }
    }
  );
}
