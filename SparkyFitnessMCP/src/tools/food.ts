import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageFoodSchema, manageFoodInput, type ManageFoodInput } from "../schemas/food.js";
import * as foodService from "../services/foodService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation, formatSuccess } from "../utils/formatting.js";
import type { ToolResponse, FoodItem, FoodEntry, MealTemplate } from "../types.js";
import { z } from "zod";

const VALID_ACTIONS = [
  "search_food", "lookup_food_nutrition", "log_food", "create_food", "search_meal", "log_meal",
  "list_diary", "delete_entry", "delete_food", "update_entry", "update_food_variant", "copy_from_yesterday", "save_as_meal_template",
  "log_water", "get_nutritional_summary", "get_water_history",
];

export function registerFoodTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_food",
    {
      title: "Manage Food",
      description: `Nutrition tracking: search food, log meals, create foods, manage diary.

Actions:
- search_food(food_name, search_type:"exact"|"broad", limit?, offset?)
- lookup_food_nutrition(food_name, provider_type?) — AI MUST call this cascade lookup first before creating or estimating a food. Bypasses regular cascade to search specific provider (e.g. openfoodfacts, usda) if provider_type given.
- log_food(food_name, quantity, unit, meal_type:"breakfast"|"lunch"|"dinner"|"snacks", entry_date, food_id?, variant_id?)
- create_food(food_name, calories, protein, carbs, fat, brand?, quantity?, unit?, saturated_fat?, fiber?, sugar?, sodium?, ...) — AI clients should search the web and populate as many micro-nutrients, GI classification, and brand ('Homemade' or 'Traditional' if generic) as possible rather than just core macros. ONLY call this if lookup_food_nutrition returns source='ai_estimate'.
- search_meal(meal_name)
- log_meal(meal_type, entry_date, meal_id?, meal_name?, quantity?)
- list_diary(entry_date?)
- delete_entry(entry_id, entry_type:"food_entry"|"food_entry_meal")
- delete_food(food_id?|food_name?) — deletes food + variants + all diary entries referencing it
- update_entry(entry_id, entry_type, quantity, unit)
- update_food_variant(food_id?|variant_id?, serving_size?, serving_unit?, calories?, protein?, carbs?, fat?, saturated_fat?, fiber?, sugar?, sodium?, ..., update_existing_entries?) — updates an existing food variant without deleting the food. Defaults to updating existing diary entries referencing the variant.
- copy_from_yesterday(target_date?, source_date?, meal_type?)
- save_as_meal_template(entry_date, meal_type, meal_name, description?)
- log_water(amount_ml, entry_date)
- get_nutritional_summary(start_date, end_date) — returns macro breakdown for a range of dates
- get_water_history(start_date?, end_date?)`,
      // Publish the flat shape so MCP clients see the available fields.
      // The SDK cannot serialize z.discriminatedUnion; manageFoodSchema is
      // still used below via safeParse for strict per-action validation.
      inputSchema: manageFoodInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const parsed = manageFoodSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ERRORS.VALIDATION(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      const args: ManageFoodInput = parsed.data;
      try {
        switch (args.action) {
          case "search_food": {
            const result = await foodService.searchFood(
              userId, args.food_name, args.search_type, args.limit, args.offset
            );
            return formatList(
              result.data,
              `Food Search: "${args.food_name}" (${args.search_type})`,
              (f: FoodItem) => {
                const v = f.variants[0];
                let text = `**${f.name}**`;
                if (f.brand) text += ` (${f.brand})`;
                if (v) {
                  text += `\n  ${v.serving_size}${v.serving_unit}: ${v.calories} kcal | P: ${v.protein}g | C: ${v.carbs}g | F: ${v.fat}g`;
                }
                text += `\n  ID: ${f.id}`;
                if (v) text += ` | Variant: ${v.id}`;
                return text;
              },
              { total_count: result.total_count, has_more: result.has_more, next_offset: result.next_offset }
            );
          }

          case "lookup_food_nutrition": {
            const result = await foodService.lookupFoodNutrition(
              userId, args.food_name!, args.provider_type as any
            );

            if (result.source === "ai_estimate") {
              return {
                content: [{
                  type: "text",
                  text: `No matches found in internal DB or configured external databases/OpenFoodFacts for "${args.food_name}". You may estimate the nutrition using AI and save it using create_food.`
                }],
                structuredContent: result
              };
            }

            const f = result.food;
            let text = `### Found match in **${result.source}**:\n`;
            text += `**${f.name}**`;
            if (f.brand) text += ` (${f.brand})`;

            const v = f.default_variant || f.variants?.[0];
            if (v) {
              text += `\n  Serving Size: ${v.serving_size} ${v.serving_unit}`;
              text += `\n  Energy: ${v.calories ?? v.energy ?? 0} kcal`;
              text += `\n  Macros: Protein: ${v.protein}g | Carbs: ${v.carbs}g | Fat: ${v.fat}g`;
              if (v.saturated_fat != null || v.dietary_fiber != null || v.sugars != null || v.sodium != null) {
                text += `\n  Details: Fiber: ${v.dietary_fiber ?? 0}g | Sugar: ${v.sugars ?? 0}g | Sodium: ${v.sodium ?? 0}mg | SatFat: ${v.saturated_fat ?? 0}g`;
              }
              if (f.provider_external_id) {
                text += `\n  External ID: ${f.provider_external_id}`;
              }
            }

            if (result.alternatives && result.alternatives.length > 0) {
              text += `\n\n**Other Alternatives found:**`;
              result.alternatives.slice(0, 5).forEach((alt: any) => {
                const altV = alt.default_variant || alt.variants?.[0];
                text += `\n- **${alt.name}**`;
                if (alt.brand) text += ` (${alt.brand})`;
                if (altV) {
                  text += ` (${altV.serving_size}${altV.serving_unit}: ${altV.calories ?? altV.energy ?? 0} kcal)`;
                }
              });
            }

            return {
              content: [{ type: "text", text }],
              structuredContent: result
            };
          }

          case "log_food": {
            const entry = await foodService.logFood(userId, {
              food_name: args.food_name,
              food_id: args.food_id,
              variant_id: args.variant_id,
              quantity: args.quantity,
              unit: args.unit,
              meal_type: args.meal_type,
              entry_date: args.entry_date,
            });
            return formatConfirmation(
              `Logged "${entry.food_name}" (${entry.quantity} ${entry.unit}) for ${entry.meal_type} on ${entry.entry_date}.`,
              { entry_id: entry.id, food_name: entry.food_name }
            );
          }

          case "create_food": {
            const food = await foodService.createFood(userId, {
              food_name: args.food_name,
              brand: args.brand,
              macros: {
                calories: args.calories,
                protein: args.protein,
                carbs: args.carbs,
                fat: args.fat,
                saturated_fat: args.saturated_fat,
                polyunsaturated_fat: args.polyunsaturated_fat,
                monounsaturated_fat: args.monounsaturated_fat,
                trans_fat: args.trans_fat,
                cholesterol: args.cholesterol,
                sodium: args.sodium,
                potassium: args.potassium,
                fiber: args.fiber,
                sugar: args.sugar,
                vitamin_a: args.vitamin_a,
                vitamin_c: args.vitamin_c,
                calcium: args.calcium,
                iron: args.iron,
                gi: args.gi,
              },
              quantity: args.quantity,
              unit: args.unit,
              meal_type: args.meal_type,
              entry_date: args.entry_date,
            });
            const v = food.variants[0];
            let msg = `Food "${food.name}" created with ${v?.calories || 0} kcal per ${v?.serving_size || 100}${v?.serving_unit || "g"}.`;
            if (food.logged_entry) {
              msg += ` Also logged to ${food.logged_entry.meal_type} for ${food.logged_entry.entry_date}.`;
            }
            return formatConfirmation(msg, {
              food_id: food.id,
              food_name: food.name,
              variant_id: v?.id,
              entry_id: food.logged_entry?.id,
            });
          }

          case "search_meal": {
            const meals = await foodService.searchMeal(userId, args.meal_name);
            return formatList(
              meals,
              `Meal Search: "${args.meal_name}"`,
              (m: MealTemplate) => {
                let text = `**${m.name}**`;
                if (m.description) text += ` — ${m.description}`;
                text += `\n  Foods: ${m.foods.length} items`;
                if (m.foods.length > 0) {
                  text += ` (${m.foods.map((f) => f.food_name).join(", ")})`;
                }
                text += `\n  ID: ${m.id}`;
                return text;
              }
            );
          }

          case "log_meal": {
            if (!args.meal_id && !args.meal_name) {
              return ERRORS.VALIDATION("Either meal_id or meal_name must be provided");
            }
            const result = await foodService.logMeal(userId, {
              meal_id: args.meal_id,
              meal_name: args.meal_name,
              meal_type: args.meal_type,
              entry_date: args.entry_date,
              quantity: args.quantity,
              unit: args.unit,
            });
            return formatConfirmation(
              `Meal "${result.meal_name}" logged for ${args.meal_type} on ${result.entry_date}.`,
              { entry_id: result.id, meal_name: result.meal_name }
            );
          }

          case "list_diary": {
            const diary = await foodService.listDiary(userId, args.entry_date);
            const allEntries = [
              ...diary.food_entries.map((e) => ({ ...e, entry_type: "food_entry" as const })),
              ...diary.meal_entries.map((e: any) => ({ ...e, entry_type: "food_entry_meal" as const })),
            ];

            const eUnit = diary.energy_unit || "kcal";
            const dateLabel = args.entry_date || "Today";
            let text = `# Food Diary: ${dateLabel}\n\n`;

            if (allEntries.length === 0) {
              text += "No entries found for this date.";
            } else {
              // Group by meal type
              const grouped: Record<string, typeof allEntries> = {};
              for (const entry of allEntries) {
                const mt = (entry as any).meal_type || "other";
                if (!grouped[mt]) grouped[mt] = [];
                grouped[mt].push(entry);
              }

              let totalEnergy = 0;
              for (const [mealType, entries] of Object.entries(grouped)) {
                text += `## ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}\n`;
                for (const entry of entries) {
                  if (entry.entry_type === "food_entry") {
                    const fe = entry as FoodEntry;
                    text += `- **${fe.food_name}** — ${fe.quantity} ${fe.unit}`;
                    if (fe.nutritional_values?.calories) {
                      text += ` (${fe.nutritional_values.calories} ${eUnit})`;
                      totalEnergy += fe.nutritional_values.calories;
                    }
                    text += `\n  ID: ${fe.id} | Type: food_entry\n`;
                  } else {
                    const me = entry as any;
                    text += `- **${me.meal_name}** (meal template) — ${me.quantity}x`;
                    text += `\n  ID: ${me.id} | Type: food_entry_meal\n`;
                  }
                }
                text += "\n";
              }

              if (totalEnergy > 0) {
                text += `---\n**Total Energy:** ${totalEnergy} ${eUnit}`;
              }
            }


            return {
              content: [{ type: "text", text }],
              structuredContent: {
                date: dateLabel,
                food_entries: diary.food_entries,
                meal_entries: diary.meal_entries,
                total_entries: allEntries.length,
              },
            };
          }

          case "delete_entry": {
            const deleted = await foodService.deleteEntry(userId, args.entry_id, args.entry_type);
            if (!deleted) {
              return ERRORS.NOT_FOUND("Entry", args.entry_id);
            }
            return formatConfirmation(`Entry deleted.`, { entry_id: args.entry_id, entry_type: args.entry_type });
          }

          case "delete_food": {
            if (!args.food_id && !args.food_name) {
              return ERRORS.VALIDATION("Either food_id or food_name must be provided");
            }
            const result = await foodService.deleteFood(userId, args.food_id, args.food_name);
            if (!result.deleted) {
              return ERRORS.NOT_FOUND("Food", args.food_id || args.food_name || "unknown");
            }
            return formatConfirmation(`Food "${result.food_name}" deleted (including variants and diary entries).`, { food_name: result.food_name });
          }

          case "update_entry": {
            const updated = await foodService.updateEntry(
              userId, args.entry_id, args.entry_type, args.quantity, args.unit
            );
            if (!updated) {
              return ERRORS.NOT_FOUND("Entry", args.entry_id);
            }
            return formatConfirmation(
              `Entry updated to ${args.quantity} ${args.unit}.`,
              { entry_id: args.entry_id, quantity: args.quantity, unit: args.unit }
            );
          }

          case "update_food_variant": {
            if (!args.food_id && !args.variant_id) {
                throw new Error("Either food_id or variant_id is required");
            }

            const result = await foodService.updateFoodVariant(userId, {
              food_id: args.food_id,
              variant_id: args.variant_id,
              serving_size: args.serving_size,
              serving_unit: args.serving_unit,
              calories: args.calories,
              protein: args.protein,
              carbs: args.carbs,
              fat: args.fat,
              saturated_fat: args.saturated_fat,
              polyunsaturated_fat: args.polyunsaturated_fat,
              monounsaturated_fat: args.monounsaturated_fat,
              trans_fat: args.trans_fat,
              cholesterol: args.cholesterol,
              sodium: args.sodium,
              potassium: args.potassium,
              fiber: args.fiber,
              sugar: args.sugar,
              vitamin_a: args.vitamin_a,
              vitamin_c: args.vitamin_c,
              calcium: args.calcium,
              iron: args.iron,
              gi: args.gi,
              update_existing_entries: args.update_existing_entries,
            });
            const variant = result.variant as any;
            return formatConfirmation(
              `Food variant updated for "${result.food_name}" (${variant.calories ?? 0} kcal per ${variant.serving_size ?? "?"}${variant.serving_unit ?? ""}).`,
              {
                food_id: result.food_id,
                food_name: result.food_name,
                variant_id: variant.id,
                updated_existing_entries: result.updated_existing_entries,
                updated_entries_count: result.updated_entries_count,
              }
            );
          }


          case "copy_from_yesterday": {
            const result = await foodService.copyFromYesterday(userId, {
              target_date: args.target_date,
              source_date: args.source_date,
              meal_type: args.meal_type,
            });
            if (result.copied_count === 0) {
              return formatConfirmation(
                `No entries found to copy from the source date.`,
                { copied_count: 0, target_date: result.target_date }
              );
            }
            return formatConfirmation(
              `Copied ${result.copied_count} entries to ${result.target_date}.`,
              { copied_count: result.copied_count, target_date: result.target_date }
            );
          }

          case "save_as_meal_template": {
            const meal = await foodService.saveAsMealTemplate(userId, {
              entry_date: args.entry_date,
              meal_type: args.meal_type,
              meal_name: args.meal_name,
              description: args.description,
            });
            return formatConfirmation(
              `Meal template "${meal.name}" saved with ${meal.foods.length} food items.`,
              { meal_id: meal.id, meal_name: meal.name, foods_count: meal.foods.length }
            );
          }

          case "log_water": {
            const entry = await foodService.logWater(userId, {
              amount_ml: args.amount_ml,
              entry_date: args.entry_date,
            });
            return formatConfirmation(
              `Logged ${args.amount_ml}ml water for ${args.entry_date}.`,
              { entry_id: entry.id, amount_ml: args.amount_ml, entry_date: args.entry_date }
            );
          }

          case "get_nutritional_summary": {
            const summary = await foodService.getNutritionalSummary(userId, {
              start_date: args.start_date,
              end_date: args.end_date,
            });
            const eUnit = summary.length > 0 ? (summary[0] as any).energy_unit : "kcal";
            return formatList(
              summary,
              `Nutritional Summary (${args.start_date} to ${args.end_date})`,
              (s: any) => {
                let text = `**${s.entry_date}**:\n`;
                text += `  Macros: ${s.calories} ${eUnit} | P: ${s.protein}g | C: ${s.carbs}g | F: ${s.fat}g\n`;
                text += `  Fiber: ${s.fiber}g | Sugar: ${s.sugar}g | Sodium: ${s.sodium}mg\n`;
                if (s.saturated_fat || s.cholesterol || s.potassium) {
                  text += `  Other: SatFat: ${s.saturated_fat}g | Chol: ${s.cholesterol}mg | Potas: ${s.potassium}mg`;
                }
                return text;
              }
            );
          }



          case "get_water_history": {
            const history = await foodService.getWaterHistory(userId, {
              start_date: args.start_date,
              end_date: args.end_date,
            });
            return formatList(
              history,
              `Water Intake History`,
              (h: any) => `**${h.entry_date}**: ${h.amount} ${h.unit}`
            );
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }

      } catch (error) {
        console.error("[Food Tool] Error:", error);
        if (error instanceof Error && error.message.includes("not found")) {
          return ERRORS.VALIDATION(error.message);
        }
        return ERRORS.DB_ERROR();
      }
    }
  );


  // Standalone domain tools.
  server.registerTool("sparky_list_foods", {
    title: "List Foods",
    description: "Returns a paginated food catalog for the authenticated user, including variants.",
    inputSchema: { limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional(), search: z.string().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args): Promise<ToolResponse> => {
    try {
      const data = await foodService.listFoods(userId, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_list_foods error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_food_details", {
    title: "Get Food Details",
    description: "Returns full details for one food by food_id, including available variants.",
    inputSchema: { food_id: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ food_id }): Promise<ToolResponse> => {
    try {
      const data = await foodService.getFoodDetails(userId, food_id);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_get_food_details error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_search_foods", {
    title: "Search Foods",
    description: "Searches foods by name for the authenticated user.",
    inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args): Promise<ToolResponse> => {
    try {
      const data = await foodService.searchFoods(userId, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_search_foods error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_food_diary", {
    title: "Get Food Diary",
    description: "Returns entry-level food diary data for a specific date or date range.",
    inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args): Promise<ToolResponse> => {
    try {
      const data = await foodService.getFoodDiary(userId, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_get_food_diary error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_nutrition_summary", {
    title: "Get Nutrition Summary",
    description: "Returns nutrition summary rows for a specific date or date range.",
    inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args): Promise<ToolResponse> => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const start_date = args.date || args.start_date || today;
      const end_date = args.date || args.end_date || start_date;
      const data = await foodService.getNutritionalSummary(userId, { start_date, end_date });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_get_nutrition_summary error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_recent_food_entries", {
    title: "Get Recent Food Entries",
    description: "Returns recent entry-level food diary rows for the authenticated user.",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (args): Promise<ToolResponse> => {
    try {
      const data = await foodService.getRecentFoodEntries(userId, args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_get_recent_food_entries error:", error);
      return ERRORS.DB_ERROR();
    }
  });

  server.registerTool("sparky_get_food_usage", {
    title: "Get Food Usage",
    description: "Shows where a specific food_id was used in the diary.",
    inputSchema: { food_id: z.string().min(1), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ food_id, ...query }): Promise<ToolResponse> => {
    try {
      const data = await foodService.getFoodUsage(userId, food_id, query);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
    } catch (error) {
      console.error("[Food Tool] sparky_get_food_usage error:", error);
      return ERRORS.DB_ERROR();
    }
  });
}
