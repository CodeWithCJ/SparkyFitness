import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildAllergenTools } from '../ai/tools/allergenTools.js';
import AllergenPreferenceService from '../services/allergenPreferenceService.js';

vi.mock('../services/allergenPreferenceService', () => ({
  default: {
    getAllergenPreferences: vi.fn(),
    addAllergenPreference: vi.fn(),
    deleteAllergenPreference: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const ALLERGEN_ID = '123e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildAllergenTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildAllergenTools('user-1', 'UTC');
});

describe('sparky_manage_allergens', () => {
  it('list_allergens renders each allergen name and id', async () => {
    vi.mocked(
      AllergenPreferenceService.getAllergenPreferences
    ).mockResolvedValue([
      { id: 'a1', allergen_name: 'peanuts' },
      { id: 'a2', allergen_name: 'gluten' },
    ]);

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'list_allergens' },
      opts
    );

    expect(result).toBe(
      '# Tracked Allergens\n\n' +
        '**peanuts**\n  ID: a1\n\n' +
        '**gluten**\n  ID: a2'
    );
    expect(
      AllergenPreferenceService.getAllergenPreferences
    ).toHaveBeenCalledWith('user-1');
  });

  it('list_allergens reports when there are none', async () => {
    vi.mocked(
      AllergenPreferenceService.getAllergenPreferences
    ).mockResolvedValue([]);

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'list_allergens' },
      opts
    );

    expect(result).toBe('# Tracked Allergens\n\nNo results found.');
  });

  it('list_allergens paginates and appends a footer when truncated', async () => {
    const rows = Array.from({ length: 25 }, (_unused, i) => ({
      id: `id-${i}`,
      allergen_name: `a${i}`,
    }));
    vi.mocked(
      AllergenPreferenceService.getAllergenPreferences
    ).mockResolvedValue(rows);

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'list_allergens', limit: 2 },
      opts
    );

    expect(result).toBe(
      '# Tracked Allergens\n\n' +
        '**a0**\n  ID: id-0\n\n' +
        '**a1**\n  ID: id-1\n\n' +
        '_Showing 1-2 of 25. Use limit/offset to page._'
    );
  });

  it('infers list_allergens when no action or fields are provided', async () => {
    vi.mocked(
      AllergenPreferenceService.getAllergenPreferences
    ).mockResolvedValue([]);

    const result = await tools.sparky_manage_allergens.execute!({}, opts);

    expect(result).toBe('# Tracked Allergens\n\nNo results found.');
  });

  it('add_allergen confirms the tracked allergen with its id', async () => {
    vi.mocked(
      AllergenPreferenceService.addAllergenPreference
    ).mockResolvedValue({ id: 'a3', allergen_name: 'shellfish' });

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'add_allergen', allergen_name: 'shellfish' },
      opts
    );

    expect(result).toBe('✅ Now tracking allergen "shellfish" (ID: a3).');
    expect(
      AllergenPreferenceService.addAllergenPreference
    ).toHaveBeenCalledWith('user-1', 'shellfish');
  });

  it('add_allergen rejects an empty allergen name', async () => {
    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'add_allergen', allergen_name: '   ' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: allergen_name: Allergen name is required'
    );
    expect(
      AllergenPreferenceService.addAllergenPreference
    ).not.toHaveBeenCalled();
  });

  it('remove_allergen confirms deletion', async () => {
    vi.mocked(
      AllergenPreferenceService.deleteAllergenPreference
    ).mockResolvedValue(true);

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'remove_allergen', id: ALLERGEN_ID },
      opts
    );

    expect(result).toBe('✅ Allergen preference removed.');
    expect(
      AllergenPreferenceService.deleteAllergenPreference
    ).toHaveBeenCalledWith('user-1', ALLERGEN_ID);
  });

  it('remove_allergen returns NOT_FOUND when nothing was deleted', async () => {
    vi.mocked(
      AllergenPreferenceService.deleteAllergenPreference
    ).mockResolvedValue(false);

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'remove_allergen', id: ALLERGEN_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Allergen preference with ID '${ALLERGEN_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('remove_allergen rejects a non-UUID id', async () => {
    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'remove_allergen', id: 'nope' },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: id: Must be a valid UUID');
    expect(
      AllergenPreferenceService.deleteAllergenPreference
    ).not.toHaveBeenCalled();
  });

  it('returns DB_ERROR when the service throws', async () => {
    vi.mocked(
      AllergenPreferenceService.getAllergenPreferences
    ).mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_manage_allergens.execute!(
      { action: 'list_allergens' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
