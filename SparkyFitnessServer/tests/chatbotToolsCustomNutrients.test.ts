import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi.fn(),
    getCustomNutrientById: vi.fn(),
    createCustomNutrient: vi.fn(),
    updateCustomNutrient: vi.fn(),
    deleteCustomNutrient: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import customNutrientService from '../services/customNutrientService.js';
import { buildCustomNutrientTools } from '../ai/tools/customNutrientTools.js';

const NUTRIENT_ID = '123e4567-e89b-12d3-a456-426614174000';
const opts = { toolCallId: 'tc-1', messages: [] };

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = customNutrientService as unknown as {
  getCustomNutrients: ReturnType<typeof vi.fn>;
  getCustomNutrientById: ReturnType<typeof vi.fn>;
  createCustomNutrient: ReturnType<typeof vi.fn>;
  updateCustomNutrient: ReturnType<typeof vi.fn>;
  deleteCustomNutrient: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildCustomNutrientTools('user-1', 'UTC');
  return tools.sparky_manage_custom_nutrients;
}

describe('sparky_manage_custom_nutrients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists custom nutrients', async () => {
    svc.getCustomNutrients.mockResolvedValue([
      { id: NUTRIENT_ID, name: 'Choline', unit: 'mg', aliases: ['Vit B4'] },
      {
        id: '223e4567-e89b-12d3-a456-426614174000',
        name: 'Boron',
        unit: 'mcg',
      },
    ]);
    const result = await getTool().execute!(
      { action: 'list_custom_nutrients' },
      opts
    );
    expect(result).toBe(
      `# Custom Nutrients\n\n**Choline** (mg) — aliases: Vit B4\n  ID: ${NUTRIENT_ID}\n\n**Boron** (mcg)\n  ID: 223e4567-e89b-12d3-a456-426614174000`
    );
  });

  it('renders no results when list is empty (inferred from {})', async () => {
    svc.getCustomNutrients.mockResolvedValue([]);
    const result = await getTool().execute!({}, opts);
    expect(result).toBe('# Custom Nutrients\n\nNo results found.');
  });

  it('gets a single custom nutrient', async () => {
    svc.getCustomNutrientById.mockResolvedValue({
      id: NUTRIENT_ID,
      name: 'Choline',
      unit: 'mg',
    });
    const result = await getTool().execute!(
      { action: 'get_custom_nutrient', id: NUTRIENT_ID },
      opts
    );
    expect(result).toBe(
      `# Custom Nutrient\n\n**Choline** (mg)\n  ID: ${NUTRIENT_ID}`
    );
  });

  it('returns NOT_FOUND when getting a missing nutrient', async () => {
    svc.getCustomNutrientById.mockResolvedValue(null);
    const result = await getTool().execute!(
      { action: 'get_custom_nutrient', id: NUTRIENT_ID },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Custom nutrient with ID '${NUTRIENT_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('creates a custom nutrient', async () => {
    svc.createCustomNutrient.mockResolvedValue({
      id: NUTRIENT_ID,
      name: 'Choline',
      unit: 'mg',
    });
    const result = await getTool().execute!(
      { action: 'create_custom_nutrient', name: 'Choline', unit: 'mg' },
      opts
    );
    expect(result).toBe(
      `✅ Custom nutrient **Choline** (mg) created (ID: ${NUTRIENT_ID}).`
    );
    expect(svc.createCustomNutrient).toHaveBeenCalledWith('user-1', {
      name: 'Choline',
      unit: 'mg',
      aliases: undefined,
      defaultTarget: undefined,
    });
  });

  it('rejects create with an empty name (VALIDATION)', async () => {
    const result = await getTool().execute!(
      { action: 'create_custom_nutrient', name: '   ', unit: 'mg' },
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
    expect(svc.createCustomNutrient).not.toHaveBeenCalled();
  });

  it('updates a custom nutrient', async () => {
    svc.updateCustomNutrient.mockResolvedValue({
      id: NUTRIENT_ID,
      name: 'Choline',
      unit: 'g',
    });
    const result = await getTool().execute!(
      { action: 'update_custom_nutrient', id: NUTRIENT_ID, unit: 'g' },
      opts
    );
    expect(result).toBe('✅ Custom nutrient **Choline** (g) updated.');
  });

  it('returns NOT_FOUND when updating a missing nutrient', async () => {
    svc.updateCustomNutrient.mockResolvedValue(null);
    const result = await getTool().execute!(
      { action: 'update_custom_nutrient', id: NUTRIENT_ID, unit: 'g' },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Custom nutrient with ID '${NUTRIENT_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('deletes a custom nutrient', async () => {
    svc.deleteCustomNutrient.mockResolvedValue(true);
    const result = await getTool().execute!(
      { action: 'delete_custom_nutrient', id: NUTRIENT_ID },
      opts
    );
    expect(result).toBe('✅ Custom nutrient deleted.');
    expect(svc.deleteCustomNutrient).toHaveBeenCalledWith(
      'user-1',
      NUTRIENT_ID,
      false
    );
  });

  it('returns NOT_FOUND when deleting a missing nutrient', async () => {
    svc.deleteCustomNutrient.mockResolvedValue(false);
    const result = await getTool().execute!(
      { action: 'delete_custom_nutrient', id: NUTRIENT_ID },
      opts
    );
    expect(result).toBe(
      `Error [NOT_FOUND]: Custom nutrient with ID '${NUTRIENT_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('rejects a non-UUID id (VALIDATION)', async () => {
    const result = await getTool().execute!(
      { action: 'get_custom_nutrient', id: 'not-a-uuid' },
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getCustomNutrients.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!(
      { action: 'list_custom_nutrients' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
