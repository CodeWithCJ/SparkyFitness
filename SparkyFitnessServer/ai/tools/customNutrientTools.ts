import { tool } from 'ai';
import { log } from '../../config/logging.js';
import customNutrientService from '../../services/customNutrientService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageCustomNutrientsSchema,
  manageCustomNutrientsInput,
  CUSTOM_NUTRIENT_ACTIONS,
  type ManageCustomNutrientsInput,
} from './schemas/customNutrients.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...CUSTOM_NUTRIENT_ACTIONS];

// Only the fields the tool renders are declared; the service returns additional
// columns (user_id, timestamps) that are intentionally ignored here.
interface CustomNutrientRow {
  id: string;
  name: string;
  unit: string;
  aliases?: string[] | null;
}

function formatNutrient(row: CustomNutrientRow): string {
  const aliases =
    Array.isArray(row.aliases) && row.aliases.length > 0
      ? ` — aliases: ${row.aliases.join(', ')}`
      : '';
  return `**${row.name}** (${row.unit})${aliases}\n  ID: ${row.id}`;
}

export function buildCustomNutrientTools(userId: string, tz: string) {
  return {
    sparky_manage_custom_nutrients: tool({
      description: `Custom nutrients: list, view, create, update, and delete a user's custom nutrient definitions (name + unit + aliases) that layer on top of the built-in nutrient catalog.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_custom_nutrients' — returns all of the user's custom nutrients (each with its ID)
- action: 'get_custom_nutrient' (fields: id) — returns a single custom nutrient
- action: 'create_custom_nutrient' (fields: name, unit, optional aliases, optional default_target) — defines a new custom nutrient
- action: 'update_custom_nutrient' (fields: id, optional name, unit, aliases) — edits an existing custom nutrient
- action: 'delete_custom_nutrient' (fields: id, optional delete_all_history) — removes a custom nutrient and cleans up its data`,
      inputSchema: manageCustomNutrientsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.name !== undefined) {
              return args.id !== undefined
                ? 'update_custom_nutrient'
                : 'create_custom_nutrient';
            }
            if (args.id !== undefined) {
              return 'get_custom_nutrient';
            }
            return 'list_custom_nutrients';
          }
        );
        const parsed = manageCustomNutrientsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageCustomNutrientsInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_custom_nutrients': {
              const rows = (await customNutrientService.getCustomNutrients(
                userId
              )) as unknown as CustomNutrientRow[];
              return formatList(rows, 'Custom Nutrients', formatNutrient);
            }

            case 'get_custom_nutrient': {
              const row = (await customNutrientService.getCustomNutrientById(
                userId,
                args.id
              )) as unknown as CustomNutrientRow | null;
              if (!row) {
                return ERRORS.NOT_FOUND('Custom nutrient', args.id);
              }
              return formatList([row], 'Custom Nutrient', formatNutrient);
            }

            case 'create_custom_nutrient': {
              const row = (await customNutrientService.createCustomNutrient(
                userId,
                {
                  name: args.name,
                  unit: args.unit,
                  aliases: args.aliases,
                  defaultTarget: args.default_target ?? undefined,
                }
              )) as unknown as CustomNutrientRow;
              return formatConfirmation(
                `Custom nutrient **${row.name}** (${row.unit}) created (ID: ${row.id}).`
              );
            }

            case 'update_custom_nutrient': {
              const row = (await customNutrientService.updateCustomNutrient(
                userId,
                args.id,
                {
                  name: args.name,
                  unit: args.unit,
                  aliases: args.aliases,
                }
              )) as unknown as CustomNutrientRow | null;
              if (!row) {
                return ERRORS.NOT_FOUND('Custom nutrient', args.id);
              }
              return formatConfirmation(
                `Custom nutrient **${row.name}** (${row.unit}) updated.`
              );
            }

            case 'delete_custom_nutrient': {
              const deleted = await customNutrientService.deleteCustomNutrient(
                userId,
                args.id,
                args.delete_all_history ?? false
              );
              if (!deleted) {
                return ERRORS.NOT_FOUND('Custom nutrient', args.id);
              }
              return formatConfirmation('Custom nutrient deleted.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageCustomNutrientsInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Custom Nutrients Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
