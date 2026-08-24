import { tool } from 'ai';
import { log } from '../../config/logging.js';
import AllergenPreferenceService from '../../services/allergenPreferenceService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageAllergensSchema,
  manageAllergensInput,
  type ManageAllergensInput,
} from './schemas/allergens.js';
import { normalizeActionArgs } from './dates.js';
import { normalizePagination } from './pagination.js';

const VALID_ACTIONS = ['list_allergens', 'add_allergen', 'remove_allergen'];

// Shape of a row returned by AllergenPreferenceService. Only the fields the
// tool renders are declared; extra columns are ignored.
interface AllergenPreferenceRow {
  id: string;
  allergen_name: string;
}

export function buildAllergenTools(userId: string, tz: string) {
  return {
    sparky_manage_allergens: tool({
      description: `Allergen preferences: list, add, and remove the allergens a user tracks.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_allergens' — returns every allergen the user tracks (with each one's ID)
- action: 'add_allergen' (fields: allergen_name) — starts tracking an allergen (idempotent; adding an existing one is a no-op)
- action: 'remove_allergen' (fields: id) — stops tracking the allergen with the given ID`,
      inputSchema: manageAllergensInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (args.id !== undefined) {
              return 'remove_allergen';
            }
            if (args.allergen_name !== undefined) {
              return 'add_allergen';
            }
            return 'list_allergens';
          }
        );
        const parsed = manageAllergensSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageAllergensInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_allergens': {
              const rows =
                (await AllergenPreferenceService.getAllergenPreferences(
                  userId
                )) as AllergenPreferenceRow[];
              const { limit, offset } = normalizePagination(
                args.limit,
                args.offset
              );
              const page = rows.slice(offset, offset + limit);
              const list = formatList(
                page,
                'Tracked Allergens',
                (row) => `**${row.allergen_name}**\n  ID: ${row.id}`
              );
              const shownEnd = offset + page.length;
              if (rows.length > page.length || offset > 0) {
                return `${list}\n\n_Showing ${page.length === 0 ? 0 : offset + 1}-${shownEnd} of ${rows.length}. Use limit/offset to page._`;
              }
              return list;
            }

            case 'add_allergen': {
              const row =
                (await AllergenPreferenceService.addAllergenPreference(
                  userId,
                  args.allergen_name
                )) as AllergenPreferenceRow;
              return formatConfirmation(
                `Now tracking allergen "${row.allergen_name}" (ID: ${row.id}).`
              );
            }

            case 'remove_allergen': {
              const removed =
                await AllergenPreferenceService.deleteAllergenPreference(
                  userId,
                  args.id
                );
              if (!removed) {
                return ERRORS.NOT_FOUND('Allergen preference', args.id);
              }
              return formatConfirmation('Allergen preference removed.');
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageAllergensInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Allergen Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
