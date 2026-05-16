import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageCheckinSchema, type ManageCheckinInput } from "../schemas/checkin.js";
import * as checkinService from "../services/checkinService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation, formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

const VALID_ACTIONS = [
  "log_biometrics", "log_custom_metric", "list_categories", "create_category",
  "log_mood", "log_fasting", "log_sleep", "list_checkin_diary", "get_fasting_status", "get_biometrics_history",
];

export function registerCheckinTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_checkin",
    {
      title: "Manage Check-in",
      description: `Health tracking: weight, steps, body measurements, mood, sleep, fasting, custom metrics.

Actions:
- log_biometrics(entry_date, weight?, steps?, height?, neck?, waist?, hips?, body_fat?, weight_unit?:"kg"|"lbs", height_unit?:"cm"|"in", measurements_unit?:"cm"|"in")
- log_mood(entry_date, mood_value:1-10, notes?)
- log_sleep(entry_date, duration_seconds?, sleep_score?:0-100, bedtime?, wake_time?, source?)
- log_fasting(start_time:ISO8601, end_time?, fasting_status?:"ACTIVE"|"COMPLETED"|"CANCELLED", fasting_type?)
- log_custom_metric(entry_date, category_name, value:string|number, unit?, notes?)
- create_category(category_name, unit?)
- list_categories()
- list_checkin_diary(entry_date?)
- get_fasting_status() — returns the currently active fasting session if any
- get_biometrics_history(start_date?, end_date?) — returns weight and measurements history`,
      inputSchema: manageCheckinSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as ManageCheckinInput;
      try {
        switch (args.action) {
          case "log_biometrics": {
            const entry = await checkinService.logBiometrics(userId, {
              entry_date: args.entry_date,
              weight: args.weight,
              weight_unit: args.weight_unit,
              steps: args.steps,
              height: args.height,
              height_unit: args.height_unit,
              neck: args.neck,
              waist: args.waist,
              hips: args.hips,
              measurements_unit: args.measurements_unit,
              body_fat_percentage: args.body_fat,
            });
            const parts: string[] = [];
            if (args.weight != null) parts.push(`weight: ${args.weight}${args.weight_unit || "kg"}`);
            if (args.steps != null) parts.push(`steps: ${args.steps}`);
            if (args.height != null) parts.push(`height: ${args.height}${args.height_unit || "cm"}`);
            if (args.body_fat != null) parts.push(`body fat: ${args.body_fat}%`);
            if (args.neck != null) parts.push(`neck: ${args.neck}${args.measurements_unit || "cm"}`);
            if (args.waist != null) parts.push(`waist: ${args.waist}${args.measurements_unit || "cm"}`);
            if (args.hips != null) parts.push(`hips: ${args.hips}${args.measurements_unit || "cm"}`);
            const summary = parts.length > 0 ? parts.join(", ") : "no changes";
            return formatConfirmation(
              `Biometrics logged for ${args.entry_date} (${summary}).`,
              { entry_id: entry.id, entry_date: args.entry_date }
            );
          }

          case "log_custom_metric": {
            const entry = await checkinService.logCustomMetric(userId, {
              category_name: args.category_name,
              value: args.value,
              unit: args.unit,
              notes: args.notes,
              entry_date: args.entry_date,
            });
            return formatConfirmation(
              `Custom metric "${args.category_name}" logged: ${args.value}${args.unit ? " " + args.unit : ""} on ${args.entry_date}.`,
              { entry_id: entry.id, category_name: args.category_name }
            );
          }

          case "list_categories": {
            const categories = await checkinService.listCategories(userId);
            return formatList(
              categories,
              "Custom Measurement Categories",
              (c: Record<string, unknown>) => {
                let text = `**${c.category_name}**`;
                if (c.unit) text += ` (${c.unit})`;
                text += `\n  ID: ${c.id}`;
                return text;
              }
            );
          }

          case "create_category": {
            const category = await checkinService.createCategory(userId, {
              category_name: args.category_name,
              unit: args.unit,
              data_type: (args as any).data_type,
            });
            return formatConfirmation(
              `Category "${args.category_name}" created${args.unit ? ` with measurement type "${args.unit}"` : ""}.`,
              { category_id: category.id, category_name: args.category_name }
            );
          }

          case "log_mood": {
            const entry = await checkinService.logMood(userId, {
              mood_value: args.mood_value,
              notes: args.notes,
              entry_date: args.entry_date,
            });
            return formatConfirmation(
              `Mood logged for ${args.entry_date}: ${args.mood_value}/10${args.notes ? " — " + args.notes : ""}.`,
              { entry_id: entry.id, mood_value: args.mood_value, entry_date: args.entry_date }
            );
          }

          case "log_fasting": {
            const entry = await checkinService.logFasting(userId, {
              start_time: args.start_time,
              end_time: args.end_time,
              fasting_status: args.fasting_status,
              fasting_type: args.fasting_type,
            });
            const status = args.fasting_status || "ACTIVE";
            return formatConfirmation(
              `Fasting window logged (${status})${args.fasting_type ? " — " + args.fasting_type : ""}.`,
              { entry_id: entry.id, fasting_status: status }
            );
          }

          case "log_sleep": {
            const entry = await checkinService.logSleep(userId, {
              entry_date: args.entry_date,
              duration_seconds: args.duration_seconds,
              sleep_score: args.sleep_score,
              bedtime: args.bedtime,
              wake_time: args.wake_time,
              source: args.source,
            });
            const parts: string[] = [];
            if (args.duration_seconds != null) {
              const hours = Math.floor(args.duration_seconds / 3600);
              const mins = Math.floor((args.duration_seconds % 3600) / 60);
              parts.push(`${hours}h ${mins}m`);
            }
            if (args.sleep_score != null) parts.push(`score: ${args.sleep_score}/100`);
            if (args.source) parts.push(`source: ${args.source}`);
            const summary = parts.length > 0 ? parts.join(", ") : "recorded";
            return formatConfirmation(
              `Sleep logged for ${args.entry_date} (${summary}).`,
              { entry_id: entry.id, entry_date: args.entry_date }
            );
          }

          case "list_checkin_diary": {
            const diary = await checkinService.listCheckinDiary(userId, args.entry_date);
            const dateLabel = args.entry_date || "today";

            let text = `### Check-in Diary: ${dateLabel}\n\n`;

            // Biometrics
            const bio = (diary as any).biometrics;
            if (bio) {
              const b = bio;
              const wUnit = b.weight_unit || "kg";
              const mUnit = b.measurement_unit || "cm";
              
              text += `#### Biometrics\n`;
              if (b.weight) text += `- **Weight:** ${b.weight} ${wUnit}\n`;
              if (b.height) text += `- **Height:** ${b.height} ${mUnit}\n`;
              if (b.steps) text += `- **Steps:** ${b.steps}\n`;
              if (b.body_fat_percentage) text += `- **Body Fat:** ${b.body_fat_percentage}%\n`;
              if (b.neck) text += `- **Neck:** ${b.neck} ${mUnit}\n`;
              if (b.waist) text += `- **Waist:** ${b.waist} ${mUnit}\n`;
              if (b.hips) text += `- **Hips:** ${b.hips} ${mUnit}\n`;
              text += `\n`;
            }


            // Mood
            const moods = (diary as any).mood_entries || [];
            if (moods.length > 0) {
              text += "## Mood\n";
              for (const m of moods) {
                text += `- ${m.mood_value}/10`;
                if (m.notes) text += ` — ${m.notes}`;
                text += "\n";
              }
              text += "\n";
            }

            // Sleep
            const sleeps = (diary as any).sleep_entries || [];
            if (sleeps.length > 0) {
              text += "## Sleep\n";
              for (const s of sleeps) {
                const parts: string[] = [];
                if (s.duration_seconds != null) {
                  const hours = Math.floor(s.duration_seconds / 3600);
                  const mins = Math.floor((s.duration_seconds % 3600) / 60);
                  parts.push(`${hours}h ${mins}m`);
                }
                if (s.sleep_score != null) parts.push(`score: ${s.sleep_score}/100`);
                if (s.bedtime) parts.push(`bed: ${s.bedtime}`);
                if (s.wake_time) parts.push(`wake: ${s.wake_time}`);
                if (s.source) parts.push(`(${s.source})`);
                text += `- ${parts.join(" | ")}\n`;
              }
              text += "\n";
            }

            // Fasting
            const fasts = (diary as any).fasting_entries || [];
            if (fasts.length > 0) {
              text += "## Fasting\n";
              for (const f of fasts) {
                let line = `- ${f.fasting_status || "ACTIVE"}`;
                if (f.fasting_type) line += ` (${f.fasting_type})`;
                line += `: ${f.start_time}`;
                if (f.end_time) line += ` → ${f.end_time}`;
                text += line + "\n";
              }
              text += "\n";
            }

            // Custom metrics
            const customs = (diary as any).custom_metrics || [];
            if (customs.length > 0) {
              text += "## Custom Metrics\n";
              for (const c of customs) {
                let line = `- **${c.category_name}**: ${c.value}`;
                if (c.unit) line += ` ${c.unit}`;
                if (c.notes) line += ` — ${c.notes}`;
                text += line + "\n";
              }
              text += "\n";
            }

            // Check if empty
            if (!bio && moods.length === 0 && sleeps.length === 0 && fasts.length === 0 && customs.length === 0) {
              text += "No check-in data found for this date.\n";
            }

            return {
              content: [{ type: "text", text }],
              structuredContent: diary as Record<string, unknown>,
            };
          }

          case "get_biometrics_history": {
            const history = await checkinService.getBiometricsHistory(userId, {
              start_date: args.start_date,
              end_date: args.end_date,
            });
            return formatList(
              history,
              `Biometrics History`,
              (h: any) => {
                const wUnit = h.weight_unit || "kg";
                let text = `**${h.entry_date}**: `;
                if (h.weight) text += `Weight: ${h.weight}${wUnit} `;
                if (h.body_fat_percentage) text += `| BF: ${h.body_fat_percentage}% `;
                if (h.steps) text += `| Steps: ${h.steps}`;
                return text;
              }
            );
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }
      } catch (error) {
        console.error("[Checkin Tool] Error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          return ERRORS.VALIDATION(error.message);
        }
        return ERRORS.DB_ERROR();
      }
    }
  );
}
