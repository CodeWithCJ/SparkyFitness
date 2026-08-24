import { tool } from 'ai';
import { log } from '../../config/logging.js';
import favoritesService from '../../services/favoritesService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation, formatList } from './formatting.js';
import {
  manageFavoritesSchema,
  manageFavoritesInput,
  type ManageFavoritesInput,
} from './schemas/favorites.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = ['list_favorites', 'add_favorite', 'remove_favorite'];

// Only the fields the tool renders are declared; the repositories return many
// more columns that are intentionally ignored here.
interface FavoriteFoodRow {
  id: string;
  name: string;
  brand?: string | null;
}

interface FavoriteMealRow {
  id: string;
  name: string;
}

interface FavoritesResult {
  favoriteFoods: FavoriteFoodRow[];
  favoriteMeals: FavoriteMealRow[];
}

export function buildFavoritesTools(userId: string, tz: string) {
  return {
    sparky_manage_favorites: tool({
      description: `Favorites: list, add, and remove the foods and meals a user has saved as favorites for quick logging.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

Actions:
- action: 'list_favorites' — returns the user's favorite foods and favorite meals (each with its ID)
- action: 'add_favorite' (fields: type, id) — favorites a food or meal; type is 'food' or 'meal' (idempotent)
- action: 'remove_favorite' (fields: type, id) — removes a food or meal from favorites`,
      inputSchema: manageFavoritesInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            // Only infer the read action. Mutations (add/remove) must be
            // requested explicitly — inferring one from the presence of an
            // id/type would guess between add and remove and could favorite
            // an item the user meant to unfavorite (or vice versa).
            if (args.id === undefined && args.type === undefined) {
              return 'list_favorites';
            }
            return undefined;
          }
        );
        if ((normalized as Record<string, unknown>).action === undefined) {
          return ERRORS.VALIDATION(
            'action is required: use "add_favorite" or "remove_favorite" (with type and id), or "list_favorites".'
          );
        }
        const parsed = manageFavoritesSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageFavoritesInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_favorites': {
              const { favoriteFoods, favoriteMeals } =
                (await favoritesService.getFavorites(
                  userId
                )) as unknown as FavoritesResult;
              const foodList = formatList(
                favoriteFoods,
                'Favorite Foods',
                (row) =>
                  `**${row.name}**${row.brand ? ` (${row.brand})` : ''}\n  ID: ${row.id}`
              );
              const mealList = formatList(
                favoriteMeals,
                'Favorite Meals',
                (row) => `**${row.name}**\n  ID: ${row.id}`
              );
              return `${foodList}\n\n${mealList}`;
            }

            case 'add_favorite': {
              await favoritesService.addFavorite(userId, args.type, args.id);
              return formatConfirmation(
                `Added ${args.type} to favorites (ID: ${args.id}).`
              );
            }

            case 'remove_favorite': {
              await favoritesService.removeFavorite(userId, args.type, args.id);
              return formatConfirmation(
                `Removed ${args.type} from favorites (ID: ${args.id}).`
              );
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as ManageFavoritesInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          // The service throws a plain Error for an inaccessible/missing meal
          // and for an invalid type; surface those as actionable tool errors
          // instead of a generic DB failure.
          const message = error instanceof Error ? error.message : '';
          const itemId = 'id' in args ? args.id : '';
          if (message === 'Meal not found.') {
            return ERRORS.NOT_FOUND('Meal', itemId);
          }
          if (message === 'Invalid favorite type.') {
            return ERRORS.VALIDATION('type must be "food" or "meal".');
          }
          log('error', '[Favorites Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
