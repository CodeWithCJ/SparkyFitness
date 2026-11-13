import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkoutPlanTemplateById,
  updatePlannedSetWeights,
} from '../models/workoutPlanTemplateRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const changes = [
  { setId: 2, weightKg: 102.5 },
  { setId: 3, weightKg: 102.5 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('updatePlannedSetWeights', () => {
  it('stamps the touched assignments and commits when every set matched', async () => {
    query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [{ assignment_id: 7 }, { assignment_id: 7 }],
      })
      .mockResolvedValue({});
    expect(await updatePlannedSetWeights('user-1', 42, changes)).toBe(2);
    const sql = query.mock.calls.map((call) => String(call[0]));
    expect(sql[2]).toContain('proposals_applied_at');
    expect(query.mock.calls[2]![1]).toEqual([[7]]);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('rolls back without stamping when a set did not match', async () => {
    query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ assignment_id: 7 }] })
      .mockResolvedValue({});
    await expect(
      updatePlannedSetWeights('user-1', 42, changes)
    ).rejects.toThrow('1 of 2');
    const sql = query.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => text.includes('proposals_applied_at'))).toBe(
      false
    );
    expect(sql).not.toContain('COMMIT');
    expect(sql.at(-1)).toBe('ROLLBACK');
  });

  it('does nothing for an empty change list', async () => {
    expect(await updatePlannedSetWeights('user-1', 42, [])).toBe(0);
    expect(getClient).not.toHaveBeenCalled();
  });
});

describe('getWorkoutPlanTemplateById', () => {
  it('selects the assignment proposals_applied_at', async () => {
    query.mockResolvedValue({ rows: [{ id: 42, assignments: [] }] });
    await getWorkoutPlanTemplateById(42, 'user-1');
    expect(String(query.mock.calls[0]![0])).toContain('a.proposals_applied_at');
  });
});
