import { z } from 'zod';
import { uuidSchema } from './common.js';

// Favorites span two item kinds: saved foods and saved meals. Add/remove take
// the kind plus the item's UUID; list returns both groups.
const favoriteTypeSchema = z
  .enum(['food', 'meal'])
  .describe('Kind of favorite: "food" or "meal"');

const listFavoritesSchema = z
  .object({
    action: z.literal('list_favorites'),
  })
  .strict();

const addFavoriteSchema = z
  .object({
    action: z.literal('add_favorite'),
    type: favoriteTypeSchema,
    id: uuidSchema.describe('UUID of the food or meal to favorite'),
  })
  .strict();

const removeFavoriteSchema = z
  .object({
    action: z.literal('remove_favorite'),
    type: favoriteTypeSchema,
    id: uuidSchema.describe('UUID of the food or meal to unfavorite'),
  })
  .strict();

export const manageFavoritesSchema = z.discriminatedUnion('action', [
  listFavoritesSchema,
  addFavoriteSchema,
  removeFavoriteSchema,
]);

export type ManageFavoritesInput = z.infer<typeof manageFavoritesSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via `manageFavoritesSchema.safeParse`.
export const manageFavoritesInput = z.object({
  action: z
    .enum(['list_favorites', 'add_favorite', 'remove_favorite'])
    .optional()
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  type: favoriteTypeSchema
    .optional()
    .describe('add_favorite/remove_favorite: "food" or "meal"'),
  id: uuidSchema
    .optional()
    .describe('add_favorite/remove_favorite: UUID of the food or meal'),
});
