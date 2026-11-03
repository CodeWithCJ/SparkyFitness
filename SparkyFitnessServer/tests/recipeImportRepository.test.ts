import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
  createMeal: vi.fn(),
  getMealById: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({ getClient: m.getClient }));
vi.mock('../models/mealRepository.js', () => ({
  default: { createMeal: m.createMeal, getMealById: m.getMealById },
}));
import repository from '../models/recipeImportRepository.js';
beforeEach(() => {
  vi.clearAllMocks();
  m.getClient.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockResolvedValue({ rows: [] });
  m.createMeal.mockResolvedValue({ id: 'meal' });
  m.getMealById.mockResolvedValue({ id: 'meal', foods: [] });
});
describe('recipe import persistence', () => {
  it('rolls back the meal when provenance persistence fails', async () => {
    m.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO recipe_imports'))
        throw new Error('write failed');
      return { rows: [] };
    });
    await expect(
      repository.save(
        'owner',
        { name: 'Recipe', foods: [] },
        {
          providerId: 'provider',
          recipeSlug: 'rice',
          recipeId: 'recipe',
          name: 'Rice',
          sourceFingerprint: 'hash',
          recipeServings: 4,
          ingredients: [],
          syncWarnings: [],
          mappings: [],
          syncEligible: true,
        },
        []
      )
    ).rejects.toThrow('write failed');
    expect(m.query).toHaveBeenCalledWith('ROLLBACK');
    expect(m.query).not.toHaveBeenCalledWith('COMMIT');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('always scopes provenance reads to the actor and requested owner', async () => {
    await repository.getSource('owner', 'meal');
    expect(m.getClient).toHaveBeenCalledWith('owner', 'owner');
    const [sql, params] = m.query.mock.calls[0];
    expect(sql).toContain('user_id = $1');
    expect(params).toEqual(['owner', 'meal']);
  });
});
