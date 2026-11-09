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
import {
  recipeImportSourceSchema,
  type RecipeImportStoredSource,
} from '@workspace/shared';

const syncedSource: RecipeImportStoredSource = {
  providerId: '00000000-0000-4000-a000-000000000001',
  recipeSlug: 'rice',
  recipeId: 'recipe',
  name: 'Rice',
  sourceFingerprint: 'a'.repeat(64),
  recipeServings: 4,
  ingredients: [],
  syncWarnings: [],
  mealId: '00000000-0000-4000-a000-000000000002',
  mappings: [],
  mealFingerprint: 'b'.repeat(64),
  syncEligible: true,
  lastSyncedAt: '2026-11-09T16:00:00.000Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  m.getClient.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockResolvedValue({ rows: [] });
  m.createMeal.mockResolvedValue({ id: 'meal' });
  m.getMealById.mockResolvedValue({ id: 'meal', foods: [] });
});
describe('recipe import persistence', () => {
  it.each([0, null])(
    'rejects a sync receipt when the provenance update affects %s rows',
    async (rowCount) => {
      m.query.mockResolvedValue({ rows: [], rowCount });
      await expect(
        repository.markSynced('owner', syncedSource)
      ).rejects.toThrow();
      expect(m.getClient).toHaveBeenCalledWith('owner', 'owner');
      expect(m.release).toHaveBeenCalledOnce();
    }
  );
  it('records a sync only after updating the existing owner provenance', async () => {
    m.query.mockResolvedValue({ rows: [], rowCount: 1 });
    await expect(
      repository.markSynced('owner', syncedSource)
    ).resolves.toBeUndefined();
    expect(m.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id=$1 AND meal_id=$2'),
      ['owner', syncedSource.mealId, JSON.stringify(syncedSource)]
    );
    expect(m.release).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'reads compatible provenance with private baseline present: %s',
    async (withBaseline) => {
      const id = '00000000-0000-4000-a000-000000000001';
      const source = {
        providerId: id,
        recipeSlug: 'rice',
        recipeId: 'recipe',
        name: 'Rice',
        sourceFingerprint: 'a'.repeat(64),
        recipeServings: 4,
        ingredients: [],
        syncWarnings: [],
        mealId: id,
        mappings: [],
        mealFingerprint: 'b'.repeat(64),
        syncEligible: true,
        lastSyncedAt: null,
        ...(withBaseline
          ? {
              syncBaseline: {
                version: 1,
                contentFingerprint: 'c'.repeat(64),
                nutritionFingerprint: 'd'.repeat(64),
              },
            }
          : {}),
      };
      m.query.mockResolvedValue({ rows: [{ source }] });
      expect(await repository.getSource(id, id)).toEqual(source);
      expect(recipeImportSourceSchema.safeParse(source).success).toBe(
        !withBaseline
      );
    }
  );
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
    const client = await m.getClient.mock.results[0].value;
    expect(m.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'owner' }),
      client
    );
    expect(m.getMealById).toHaveBeenCalledWith('meal', 'owner', client);
    expect(m.getClient).toHaveBeenCalledOnce();
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
