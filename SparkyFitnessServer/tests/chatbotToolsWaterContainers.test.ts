import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/waterContainerService.js', () => ({
  default: {
    getWaterContainersByUserId: vi.fn(),
    createWaterContainer: vi.fn(),
    updateWaterContainer: vi.fn(),
    deleteWaterContainer: vi.fn(),
    setPrimaryWaterContainer: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import waterContainerService from '../services/waterContainerService.js';
import { buildWaterContainerTools } from '../ai/tools/waterContainerTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const svc = waterContainerService as unknown as {
  getWaterContainersByUserId: ReturnType<typeof vi.fn>;
  createWaterContainer: ReturnType<typeof vi.fn>;
  updateWaterContainer: ReturnType<typeof vi.fn>;
  deleteWaterContainer: ReturnType<typeof vi.fn>;
  setPrimaryWaterContainer: ReturnType<typeof vi.fn>;
};

function getTool() {
  const tools = buildWaterContainerTools('user-1', 'UTC');
  return tools.sparky_manage_water_containers;
}

describe('sparky_manage_water_containers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists water containers', async () => {
    svc.getWaterContainersByUserId.mockResolvedValue([
      {
        id: 1,
        name: 'Big Bottle',
        volume: 1000,
        unit: 'ml',
        is_primary: true,
        servings_per_container: 4,
      },
      {
        id: 2,
        name: 'Cup',
        volume: 250,
        unit: 'ml',
        is_primary: false,
        servings_per_container: 1,
      },
    ]);
    const result = await getTool().execute!(
      { action: 'list_water_containers' },
      opts
    );
    expect(result).toBe(
      '# Water Containers\n\n**Big Bottle** 1000 ml (4 servings) — primary\n  ID: 1\n\n**Cup** 250 ml\n  ID: 2'
    );
  });

  it('converts stored ml to the user unit when listing', async () => {
    svc.getWaterContainersByUserId.mockResolvedValue([
      {
        id: 3,
        name: 'Hydro Flask',
        volume: 709.764,
        unit: 'oz',
        is_primary: false,
        servings_per_container: 1,
      },
    ]);
    const result = await getTool().execute!(
      { action: 'list_water_containers' },
      opts
    );
    expect(result).toBe('# Water Containers\n\n**Hydro Flask** 24 oz\n  ID: 3');
  });

  it('renders no results when list is empty (inferred from {})', async () => {
    svc.getWaterContainersByUserId.mockResolvedValue([]);
    const result = await getTool().execute!({}, opts);
    expect(result).toBe('# Water Containers\n\nNo results found.');
  });

  it('gets a single water container', async () => {
    svc.getWaterContainersByUserId.mockResolvedValue([
      {
        id: 1,
        name: 'Big Bottle',
        volume: 1000,
        unit: 'ml',
        is_primary: false,
        servings_per_container: 1,
      },
    ]);
    const result = await getTool().execute!(
      { action: 'get_water_container', id: 1 },
      opts
    );
    expect(result).toBe('# Water Container\n\n**Big Bottle** 1000 ml\n  ID: 1');
  });

  it('returns NOT_FOUND when getting a missing container', async () => {
    svc.getWaterContainersByUserId.mockResolvedValue([]);
    const result = await getTool().execute!(
      { action: 'get_water_container', id: 9 },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Water container with ID '9' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('creates a water container', async () => {
    svc.createWaterContainer.mockResolvedValue({
      id: 5,
      name: 'Flask',
      volume: 500,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
    });
    const result = await getTool().execute!(
      {
        action: 'create_water_container',
        name: 'Flask',
        volume: 500,
        unit: 'ml',
      },
      opts
    );
    expect(result).toBe('✅ Water container **Flask** created (ID: 5).');
    expect(svc.createWaterContainer).toHaveBeenCalledWith('user-1', {
      name: 'Flask',
      volume: 500,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
    });
  });

  it('rejects create with an empty name (VALIDATION)', async () => {
    const result = await getTool().execute!(
      {
        action: 'create_water_container',
        name: '   ',
        volume: 500,
        unit: 'ml',
      },
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
    expect(svc.createWaterContainer).not.toHaveBeenCalled();
  });

  it('rejects create with an invalid unit (VALIDATION)', async () => {
    const result = await getTool().execute!(
      {
        action: 'create_water_container',
        name: 'Flask',
        volume: 500,
        unit: 'gallon',
      } as unknown as Record<string, unknown>,
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
    expect(svc.createWaterContainer).not.toHaveBeenCalled();
  });

  it('updates a water container', async () => {
    svc.updateWaterContainer.mockResolvedValue({
      id: 5,
      name: 'Flask',
      volume: 750,
      unit: 'ml',
      is_primary: false,
      servings_per_container: 1,
    });
    const result = await getTool().execute!(
      { action: 'update_water_container', id: 5, volume: 750, unit: 'ml' },
      opts
    );
    expect(result).toBe('✅ Water container **Flask** updated.');
  });

  it('returns NOT_FOUND when updating a missing container', async () => {
    svc.updateWaterContainer.mockResolvedValue(undefined);
    const result = await getTool().execute!(
      { action: 'update_water_container', id: 5, volume: 750, unit: 'ml' },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Water container with ID '5' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('deletes a water container', async () => {
    svc.deleteWaterContainer.mockResolvedValue({
      message: 'Water container deleted successfully.',
    });
    const result = await getTool().execute!(
      { action: 'delete_water_container', id: 5 },
      opts
    );
    expect(result).toBe('✅ Water container deleted.');
    expect(svc.deleteWaterContainer).toHaveBeenCalledWith(5, 'user-1');
  });

  it('maps a service "not found" error to NOT_FOUND on delete', async () => {
    svc.deleteWaterContainer.mockRejectedValue(
      new Error('Water container not found or not authorized to delete.')
    );
    const result = await getTool().execute!(
      { action: 'delete_water_container', id: 5 },
      opts
    );
    expect(result).toBe(
      "Error [NOT_FOUND]: Water container with ID '5' not found.\n\nSuggestion: Check the ID and try again."
    );
  });

  it('sets a primary water container', async () => {
    svc.setPrimaryWaterContainer.mockResolvedValue({
      id: 5,
      name: 'Flask',
      volume: 500,
      unit: 'ml',
      is_primary: true,
      servings_per_container: 1,
    });
    const result = await getTool().execute!(
      { action: 'set_primary_water_container', id: 5 },
      opts
    );
    expect(result).toBe('✅ Water container **Flask** set as primary.');
  });

  it('rejects a non-numeric id (VALIDATION)', async () => {
    const result = await getTool().execute!(
      {
        action: 'get_water_container',
        id: 'not-a-number',
      } as unknown as Record<string, unknown>,
      opts
    );
    expect(result).toContain('Error [VALIDATION]');
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getWaterContainersByUserId.mockRejectedValue(new Error('boom'));
    const result = await getTool().execute!(
      { action: 'list_water_containers' },
      opts
    );
    expect(result).toBe(DB_ERROR_TEXT);
  });
});
