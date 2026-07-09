import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import injectionRepository from '../models/injectionRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('injectionRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();
  const medicationId = uuidv4();
  const penId = uuidv4();
  const injectionId = uuidv4();

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error mocked in the module mock above
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createInjection', () => {
    it('deducts the given pen inside the transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: injectionId, pen_id: penId }],
        }) // INSERT injection
        .mockResolvedValueOnce({
          rows: [{ id: penId, doses_used: 2, status: 'in_use' }],
        }) // UPDATE pen
        .mockResolvedValueOnce({}); // COMMIT

      const result = await injectionRepository.createInjection(userId, {
        medication_id: medicationId,
        pen_id: penId,
        dose_mg: 1,
        deduct_pen: true,
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO injection_entries'),
        expect.arrayContaining([medicationId, userId, penId, 1])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('doses_used = doses_used + 1'),
        [penId, userId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result.pen).toEqual({
        id: penId,
        doses_used: 2,
        status: 'in_use',
      });
      // No auto-pick lookup when a pen_id is given.
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        expect.anything()
      );
    });

    it('auto-picks a pen when deduct_pen is set without pen_id', async () => {
      const pickedPenId = uuidv4();
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: pickedPenId }] }) // auto-pick
        .mockResolvedValueOnce({
          rows: [{ id: injectionId, pen_id: pickedPenId }],
        }) // INSERT
        .mockResolvedValueOnce({
          rows: [{ id: pickedPenId, doses_used: 1, status: 'in_use' }],
        }) // UPDATE pen
        .mockResolvedValueOnce({}); // COMMIT

      const result = await injectionRepository.createInjection(userId, {
        medication_id: medicationId,
        dose_mg: 1,
        deduct_pen: true,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [userId, medicationId]
      );
      // The picked pen id is stored on the injection row (delete keys on it).
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO injection_entries'),
        expect.arrayContaining([pickedPenId])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('doses_used = doses_used + 1'),
        [pickedPenId, userId]
      );
      expect(result.pen?.id).toBe(pickedPenId);
    });

    it('does not record a pen_id when deduct_pen is false, even if one is passed', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: injectionId, pen_id: null }],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await injectionRepository.createInjection(userId, {
        medication_id: medicationId,
        pen_id: penId,
        dose_mg: 1,
        deduct_pen: false,
      });

      // No auto-pick and no deduction happen.
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        expect.anything()
      );
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('doses_used = doses_used + 1'),
        expect.anything()
      );
      // The persisted pen_id (INSERT param index 2) is null, so a later delete
      // won't wrongly credit a dose back.
      const insertCall = mockClient.query.mock.calls.find(
        ([sql]: [string]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO injection_entries')
      );
      expect(insertCall[1][2]).toBeNull();
    });

    it('logs without deduction when no candidate pen exists', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // auto-pick finds nothing
        .mockResolvedValueOnce({
          rows: [{ id: injectionId, pen_id: null }],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      const result = await injectionRepository.createInjection(userId, {
        medication_id: medicationId,
        dose_mg: 1,
        deduct_pen: true,
      });

      expect(result.pen).toBeNull();
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('doses_used = doses_used + 1'),
        expect.anything()
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('resolves a missing dose from titration/medication defaults', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ dose_mg: 0.5 }] }) // dose resolution
        .mockResolvedValueOnce({
          rows: [{ id: injectionId, dose_mg: 0.5 }],
        }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      await injectionRepository.createInjection(userId, {
        medication_id: medicationId,
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('medication_titration_steps'),
        [userId, medicationId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO injection_entries'),
        expect.arrayContaining([0.5])
      );
    });

    it('rolls back when a query fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('boom')); // INSERT fails

      await expect(
        injectionRepository.createInjection(userId, {
          medication_id: medicationId,
          dose_mg: 1,
        })
      ).rejects.toThrow('boom');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('deleteInjection', () => {
    it('credits the dose back to the pen the injection deducted', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: injectionId, pen_id: penId }],
        }) // DELETE
        .mockResolvedValueOnce({}) // UPDATE pen restore
        .mockResolvedValueOnce({}); // COMMIT

      const ok = await injectionRepository.deleteInjection(userId, injectionId);

      expect(ok).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING id, pen_id'),
        [injectionId, userId]
      );
      const restore = mockClient.query.mock.calls.find(
        ([sql]: [string]) =>
          typeof sql === 'string' && sql.includes('GREATEST(doses_used - 1, 0)')
      );
      expect(restore).toBeDefined();
      expect(restore[0]).toContain("THEN 'in_use'");
      expect(restore[0]).toContain('reorder_flag');
      expect(restore[1]).toEqual([penId, userId]);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('does not touch pens when the injection had no pen', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: injectionId, pen_id: null }],
        }) // DELETE
        .mockResolvedValueOnce({}); // COMMIT

      const ok = await injectionRepository.deleteInjection(userId, injectionId);

      expect(ok).toBe(true);
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('GREATEST(doses_used - 1, 0)'),
        expect.anything()
      );
    });

    it('returns false when nothing was deleted', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // DELETE
        .mockResolvedValueOnce({}); // COMMIT

      const ok = await injectionRepository.deleteInjection(userId, injectionId);
      expect(ok).toBe(false);
    });

    it('rolls back when the restore fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: injectionId, pen_id: penId }],
        }) // DELETE
        .mockRejectedValueOnce(new Error('restore failed')); // UPDATE fails

      await expect(
        injectionRepository.deleteInjection(userId, injectionId)
      ).rejects.toThrow('restore failed');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateInjection', () => {
    it('updates only provided fields scoped to the user', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: injectionId, site: 'right_thigh' }],
      });

      const result = await injectionRepository.updateInjection(
        userId,
        injectionId,
        { site: 'right_thigh', dose_mg: 0.5 }
      );

      const [sql, values] = mockClient.query.mock.calls[0];
      expect(sql).toContain('UPDATE injection_entries');
      expect(sql).toContain('site = $3');
      expect(sql).toContain('dose_mg = $4');
      expect(sql).toContain('WHERE id = $1 AND user_id = $2');
      expect(values).toEqual([injectionId, userId, 'right_thigh', 0.5]);
      expect(result).toEqual({ id: injectionId, site: 'right_thigh' });
    });

    it('returns null when the injection does not exist', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const result = await injectionRepository.updateInjection(
        userId,
        injectionId,
        { site: 'left_abdomen' }
      );
      expect(result).toBeNull();
    });

    it('returns the current row when no fields are provided', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: injectionId }],
      });
      const result = await injectionRepository.updateInjection(
        userId,
        injectionId,
        {}
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [injectionId, userId]
      );
      expect(result).toEqual({ id: injectionId });
    });
  });
});
