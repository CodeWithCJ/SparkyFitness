import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageExerciseSchema, manageExerciseInput, type ManageExerciseInput } from "../schemas/exercise.js";
import * as exerciseService from "../services/exerciseService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation } from "../utils/formatting.js";
import type { ToolResponse, Exercise, ExerciseEntry, ExerciseSet } from "../types.js";
import { z } from "zod";

const VALID_ACTIONS = ["search_exercises", "create_exercise", "log_exercise", "list_exercise_diary", "get_workout_presets", "log_workout_preset", "update_exercise_entry", "delete_exercise_entry", "get_exercise_details", "create_workout_preset", "get_exercise_progress"];

export function registerExerciseTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_exercise",
    {
      title: "Manage Exercise",
      description: `Fitness tracking: search exercises, log workouts with sets, manage presets.

Actions:
- search_exercises(searchTerm, muscleGroup?, equipment?, limit?, offset?)
- create_exercise(name, category?, calories_per_hour?, description?)
- log_exercise(entry_date, exercise_id?|exercise_name?, duration_minutes?, calories_burned?, notes?, distance?, avg_heart_rate?, steps?, sets?:JSON string or array of [{reps,weight,duration,rest_time,set_type,rpe,notes}]) — distance/avg_heart_rate/steps are for cardio
- list_exercise_diary(entry_date)
- get_workout_presets()
- log_workout_preset(entry_date, preset_id?|preset_name?)
- update_exercise_entry(entry_id, entry_date?, duration_minutes?, calories_burned?, notes?, distance?, avg_heart_rate?, steps?, sets?) — only the provided fields change; sets, when provided, replace all existing sets
- delete_exercise_entry(entry_id)
- get_exercise_details(exercise_id?|exercise_name?)
- create_workout_preset(name, exercise_ids)
- get_exercise_progress(exercise_id?|exercise_name?, start_date?, end_date?, limit?, offset?) — returns paginated performance history`,
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
              distance: args.distance,
              avg_heart_rate: args.avg_heart_rate,
              steps: args.steps,
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
                if (e.distance != null) text += ` | ${e.distance} dist`;
                if (e.avg_heart_rate != null) text += ` | ${e.avg_heart_rate} bpm`;
                if (e.steps != null) text += ` | ${e.steps} steps`;
                if (e.sets.length > 0) {
                  const setLine = e.sets
                    .map((s) => {
                      const parts: string[] = [];
                      if (s.reps != null) parts.push(`${s.reps}r`);
                      if (s.weight != null) parts.push(`${s.weight}kg`);
                      if (s.duration != null) parts.push(`${s.duration}s`);
                      if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
                      let str = parts.join("×");
                      if (s.rest_time != null) str += ` (rest ${s.rest_time}s)`;
                      if (s.notes) str += ` (${s.notes})`;
                      return str;
                    })
                    .filter(Boolean)
                    .join("; ");
                  if (setLine) text += `\n  Sets: ${setLine}`;
                }
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

          case "update_exercise_entry": {
            // Parse sets if it arrives as a JSON string (MCP serialisation quirk), matching log_exercise.
            let parsedSets: ExerciseSet[] | undefined;
            if (typeof args.sets === "string") {
              try {
                parsedSets = JSON.parse(args.sets);
              } catch {
                return ERRORS.VALIDATION("Invalid JSON format for sets");
              }
            } else {
              parsedSets = args.sets as ExerciseSet[] | undefined;
            }
            const updated = await exerciseService.updateExerciseEntry(userId, {
              entry_id: args.entry_id,
              entry_date: args.entry_date,
              duration_minutes: args.duration_minutes,
              calories_burned: args.calories_burned,
              notes: args.notes,
              distance: args.distance,
              avg_heart_rate: args.avg_heart_rate,
              steps: args.steps,
              sets: parsedSets,
            });
            if (!updated) return ERRORS.NOT_FOUND("Exercise Entry", args.entry_id);
            return formatConfirmation(`Exercise entry updated.`, { entry_id: args.entry_id });
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
              limit: args.limit,
              offset: args.offset,
            });
            return formatList(
              progress.data,
              `Exercise Progress: ${args.exercise_name || args.exercise_id}`,
              (p: any) => `**${p.entry_date}**: Max Weight: ${p.max_weight}kg | Max Reps: ${p.max_reps} | Volume: ${p.total_volume}kg`,
              { total_count: progress.total_count, has_more: progress.has_more, next_offset: progress.next_offset }
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



  // Standalone domain tools.
  const exerciseDateRangeSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  const exercisePaginationSchema = z.object({
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).optional(),
  });

  const listExercisesSchema = exercisePaginationSchema.extend({
    search: z.string().optional(),
  });

  const getExerciseDetailsSchema = z.object({
    exercise_id: z.string().optional(),
    exercise_name: z.string().optional(),
  });

  const searchExercisesSchema = exercisePaginationSchema.extend({
    query: z.string().min(1),
    muscle_group: z.string().optional(),
    equipment: z.string().optional(),
  });

  const recentExerciseEntriesSchema = z.object({
    limit: z.number().int().min(1).max(200).optional(),
  });

  const exerciseUsageSchema = exerciseDateRangeSchema.merge(exercisePaginationSchema).extend({
    exercise_id: z.string().min(1),
  });

  const exerciseProgressSchema = exerciseDateRangeSchema.merge(exercisePaginationSchema).extend({
    exercise_id: z.string().optional(),
    exercise_name: z.string().optional(),
  });

  server.registerTool("sparky_list_exercises", {
    title: "List Exercises",
    description: "Returns a paginated exercise catalog for the authenticated user.",
    inputSchema: listExercisesSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = listExercisesSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.listExercises(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_list_exercises error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise", "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_exercise_details", {
    title: "Get Exercise Details",
    description: "Returns full details for one exercise by exercise_id or exercise_name.",
    inputSchema: getExerciseDetailsSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = getExerciseDetailsSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.getExerciseDetails(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_exercise_details error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise", parsed.data.exercise_id || parsed.data.exercise_name || "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_search_exercises", {
    title: "Search Exercises",
    description: "Searches exercises by name and optional filters.",
    inputSchema: searchExercisesSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = searchExercisesSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const args = parsed.data;
      const data = await exerciseService.searchExercises(userId, args.query, args.muscle_group, args.equipment, args.limit, args.offset);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_search_exercises error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise", parsed.data.query);
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_exercise_diary", {
    title: "Get Exercise Diary",
    description: "Returns entry-level exercise diary data for a specific date or date range.",
    inputSchema: exerciseDateRangeSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = exerciseDateRangeSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.getExerciseDiary(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_exercise_diary error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise diary", parsed.data.date || parsed.data.start_date || "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_daily_exercise_totals", {
    title: "Get Daily Exercise Totals",
    description: "Returns daily exercise totals for a date or range.",
    inputSchema: exerciseDateRangeSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = exerciseDateRangeSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.getDailyExerciseTotals(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_daily_exercise_totals error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise totals", parsed.data.date || parsed.data.start_date || "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_recent_exercise_entries", {
    title: "Get Recent Exercise Entries",
    description: "Returns recent entry-level exercise diary rows for the authenticated user.",
    inputSchema: recentExerciseEntriesSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = recentExerciseEntriesSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.getRecentExerciseEntries(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_recent_exercise_entries error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise entries", "recent");
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_exercise_usage", {
    title: "Get Exercise Usage",
    description: "Shows where a specific exercise_id was used in the exercise diary.",
    inputSchema: exerciseUsageSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = exerciseUsageSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const { exercise_id, ...query } = parsed.data;
      const data = await exerciseService.getExerciseUsage(userId, exercise_id, query);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_exercise_usage error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise", parsed.data.exercise_id);
      }
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_exercise_progress", {
    title: "Get Exercise Progress",
    description: "Returns paginated performance history for an exercise.",
    inputSchema: exerciseProgressSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (rawArgs): Promise<ToolResponse> => {
    const parsed = exerciseProgressSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
    }
    try {
      const data = await exerciseService.getExerciseProgress(userId, parsed.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Exercise Tool] sparky_get_exercise_progress error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return ERRORS.NOT_FOUND("Exercise", parsed.data.exercise_id || parsed.data.exercise_name || "unknown");
      }
      return ERRORS.DB_ERROR();
    }
  });
}
