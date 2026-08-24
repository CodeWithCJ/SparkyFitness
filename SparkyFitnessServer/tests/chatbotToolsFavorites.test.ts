import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildFavoritesTools } from '../ai/tools/favoritesTools.js';
import favoritesService from '../services/favoritesService.js';

vi.mock('../services/favoritesService', () => ({
  default: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const FOOD_ID = '123e4567-e89b-12d3-a456-426614174000';
const MEAL_ID = '223e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildFavoritesTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildFavoritesTools('user-1', 'UTC');
});

describe('sparky_manage_favorites', () => {
  it('list_favorites renders favorite foods and meals with ids', async () => {
    vi.mocked(favoritesService.getFavorites).mockResolvedValue({
      favoriteFoods: [
        { id: 'f1', name: 'Greek Yogurt', brand: 'Fage' },
        { id: 'f2', name: 'Banana', brand: null },
      ],
      favoriteMeals: [{ id: 'm1', name: 'Overnight Oats' }],
    });

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'list_favorites' },
      opts
    );

    expect(result).toBe(
      '# Favorite Foods\n\n' +
        '**Greek Yogurt** (Fage)\n  ID: f1\n\n' +
        '**Banana**\n  ID: f2' +
        '\n\n' +
        '# Favorite Meals\n\n' +
        '**Overnight Oats**\n  ID: m1'
    );
    expect(favoritesService.getFavorites).toHaveBeenCalledWith('user-1');
  });

  it('list_favorites reports when there are none', async () => {
    vi.mocked(favoritesService.getFavorites).mockResolvedValue({
      favoriteFoods: [],
      favoriteMeals: [],
    });

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'list_favorites' },
      opts
    );

    expect(result).toBe(
      '# Favorite Foods\n\nNo results found.\n\n# Favorite Meals\n\nNo results found.'
    );
  });

  it('infers list_favorites when no action or fields are provided', async () => {
    vi.mocked(favoritesService.getFavorites).mockResolvedValue({
      favoriteFoods: [],
      favoriteMeals: [],
    });

    const result = await tools.sparky_manage_favorites.execute!({}, opts);

    expect(result).toBe(
      '# Favorite Foods\n\nNo results found.\n\n# Favorite Meals\n\nNo results found.'
    );
  });

  it('add_favorite confirms a favorited food', async () => {
    vi.mocked(favoritesService.addFavorite).mockResolvedValue({
      type: 'food',
      id: FOOD_ID,
      is_favorite: true,
    });

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'add_favorite', type: 'food', id: FOOD_ID },
      opts
    );

    expect(result).toBe(`✅ Added food to favorites (ID: ${FOOD_ID}).`);
    expect(favoritesService.addFavorite).toHaveBeenCalledWith(
      'user-1',
      'food',
      FOOD_ID
    );
  });

  it('remove_favorite confirms an unfavorited meal', async () => {
    vi.mocked(favoritesService.removeFavorite).mockResolvedValue({
      type: 'meal',
      id: MEAL_ID,
      is_favorite: false,
    });

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'remove_favorite', type: 'meal', id: MEAL_ID },
      opts
    );

    expect(result).toBe(`✅ Removed meal from favorites (ID: ${MEAL_ID}).`);
    expect(favoritesService.removeFavorite).toHaveBeenCalledWith(
      'user-1',
      'meal',
      MEAL_ID
    );
  });

  it('add_favorite rejects a missing type', async () => {
    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'add_favorite', id: FOOD_ID },
      opts
    );

    expect(result).toContain('Error [VALIDATION]: type');
    expect(favoritesService.addFavorite).not.toHaveBeenCalled();
  });

  it('add_favorite rejects a non-UUID id', async () => {
    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'add_favorite', type: 'food', id: 'nope' },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: id: Must be a valid UUID');
    expect(favoritesService.addFavorite).not.toHaveBeenCalled();
  });

  it('maps a "Meal not found." throw to NOT_FOUND', async () => {
    vi.mocked(favoritesService.addFavorite).mockRejectedValue(
      new Error('Meal not found.')
    );

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'add_favorite', type: 'meal', id: MEAL_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Meal with ID '${MEAL_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('returns DB_ERROR when the service throws unexpectedly', async () => {
    vi.mocked(favoritesService.getFavorites).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_manage_favorites.execute!(
      { action: 'list_favorites' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
