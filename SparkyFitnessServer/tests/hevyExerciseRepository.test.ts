import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({ getClient: db.getClient }));
import hevyExerciseRepository from '../integrations/hevy/hevyExerciseRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  db.getClient.mockResolvedValue(db);
  db.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Hevy exercise persistence', () => {
  it("finds only the owner's non-Hevy exercise as a name fallback", async () => {
    const row = {
      id: 'manual-1',
      user_id: 'u-1',
      source: null,
      source_id: null,
    };
    db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    expect(await hevyExerciseRepository.findOwnedByName('u-1', 'Row')).toEqual(
      row
    );
    const [sql, params] = db.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id = \$1\s+AND\s+name = \$2/);
    expect(sql).toContain("source IS DISTINCT FROM 'Hevy'");
    expect(params).toEqual(['u-1', 'Row']);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('checks linked metadata in one owner-scoped read for the requested identities', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ source_id: 'template-1' }],
      rowCount: 1,
    });
    expect(
      await hevyExerciseRepository.findTemplateIdsWithMuscles('u-1', [
        'template-1',
        'template-2',
      ])
    ).toEqual(['template-1']);
    const [sql, params] = db.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain("source = 'Hevy'");
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('source_id = ANY($2::text[])');
    expect(sql).toMatch(/primary_muscles/);
    expect(params).toEqual(['u-1', ['template-1', 'template-2']]);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('avoids a metadata lookup when no template identities were requested', async () => {
    expect(
      await hevyExerciseRepository.findTemplateIdsWithMuscles('u-1', [])
    ).toEqual([]);
    expect(db.getClient).not.toHaveBeenCalled();
  });

  it('looks up a stable template identity within the owning user and Hevy source', async () => {
    const row = {
      id: 'exercise-1',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: 'template-1',
    };
    db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    expect(
      await hevyExerciseRepository.findByTemplateId('u-1', 'template-1')
    ).toEqual(row);
    expect(db.getClient).toHaveBeenCalledWith('u-1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/source = 'Hevy'/),
      ['u-1', 'template-1']
    );
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('only looks up legacy names for the owning user, Hevy source and an unclaimed template', async () => {
    const row = {
      id: 'legacy-1',
      user_id: 'u-1',
      source: 'Hevy',
      source_id: null,
    };
    db.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    expect(await hevyExerciseRepository.findLegacyByName('u-1', 'Row')).toEqual(
      row
    );
    expect(db.getClient).toHaveBeenCalledWith('u-1');
    const [sql, params] = db.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toMatch(/WHERE\s+user_id = \$1\s+AND\s+name = \$2/);
    expect(sql).toContain("AND source = 'Hevy'");
    expect(sql).toMatch(/AND\s+\(source_id IS NULL OR source_id = ''\)/);
    expect(params).toEqual(['u-1', 'Row']);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('fills muscle columns atomically with explicit owner, source and template guards', async () => {
    await hevyExerciseRepository.fillMissingMuscles(
      'u-1',
      'exercise-1',
      'template-1',
      ['middle back'],
      ['biceps']
    );
    expect(db.getClient).toHaveBeenCalledWith('u-1');
    const [sql, params] = db.query.mock.calls[0]! as [string, unknown[]];
    expect(sql).toContain('CASE WHEN');
    expect(sql).toContain("source = 'Hevy'");
    expect(sql).toMatch(/user_id = \$\d/);
    expect(sql).toMatch(/id = \$\d/);
    expect(sql).toMatch(/AND\s+\(source_id IS NULL OR source_id = ''\s+OR/);
    expect(sql).toContain("$1::text <> '[]'");
    expect(sql).toContain("$2::text <> '[]'");
    expect(params).toEqual([
      '["middle back"]',
      '["biceps"]',
      'template-1',
      'exercise-1',
      'u-1',
    ]);
    expect(db.release).toHaveBeenCalledOnce();
  });

  it('releases the RLS-scoped client when the write fails', async () => {
    db.query.mockRejectedValueOnce(new Error('database write failed'));
    await expect(
      hevyExerciseRepository.fillMissingMuscles(
        'u-1',
        'exercise-1',
        'template-1',
        [],
        []
      )
    ).rejects.toThrow('database write failed');
    expect(db.release).toHaveBeenCalledOnce();
  });
});
