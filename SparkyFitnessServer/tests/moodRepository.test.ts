import { beforeEach, describe, expect, it, vi } from 'vitest';
import moodRepository, { hasMoodContent } from '../models/moodRepository.js';

const query = vi.fn();
const release = vi.fn();

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({ query, release })),
}));

describe('moodRepository', () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    query.mockResolvedValue({ rows: [{ id: 'm1' }] });
  });

  describe('hasMoodContent', () => {
    it('is false for blank notes and empty tags', () => {
      expect(hasMoodContent({ notes: '  ', moodTags: [] })).toBe(false);
      expect(hasMoodContent({})).toBe(false);
    });

    it('matches the CHECK on whitespace: tabs and newlines are not notes, a blank tag is not a tag', () => {
      expect(hasMoodContent({ notes: '\n\t' })).toBe(false);
      expect(hasMoodContent({ moodTags: [''] })).toBe(false);
      expect(hasMoodContent({ moodTags: [' ', '\t'] })).toBe(false);
      expect(hasMoodContent({ moodTags: ['', 'calm'] })).toBe(true);
    });

    it('is true when any single field carries content', () => {
      expect(hasMoodContent({ energyValue: 2 })).toBe(true);
      expect(hasMoodContent({ moodValue: 0 })).toBe(true);
      expect(hasMoodContent({ focusValue: 1 })).toBe(true);
      expect(hasMoodContent({ notes: 'ok' })).toBe(true);
      expect(hasMoodContent({ moodTags: ['calm'] })).toBe(true);
    });
  });

  describe('createCheckin', () => {
    it('always inserts a manual row and never uses ON CONFLICT', async () => {
      await moodRepository.createCheckin('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: 3,
      });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('INSERT INTO mood_entries');
      expect(sql).not.toContain('ON CONFLICT');
      expect(sql).toContain("'manual'");
      expect(sql).toContain('COALESCE($8::timestamptz, now())');
      expect(params[0]).toBe('u1');
      expect(params[1]).toBe(60);
      expect(params[4]).toBe('2026-10-20');
      expect(params[5]).toBe(3);
      expect(params[7]).toBeNull();
    });
  });

  describe('upsertDerivedMood', () => {
    it('upserts on the derived-source partial unique index', async () => {
      await moodRepository.upsertDerivedMood('u1', 'garmin', {
        moodValue: 70,
        entryDate: '2026-10-20',
        entryTimestamp: '2026-10-20T08:00:00Z',
      });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain(
        "ON CONFLICT (user_id, entry_date, source) WHERE source <> 'manual'"
      );
      expect(sql).toContain('DO UPDATE');
      expect(params).toContain('garmin');
      expect(params).toContain('2026-10-20T08:00:00Z');
    });
  });

  describe('legacy reads', () => {
    it('prefers the latest manual row with a mood and falls back to derived', async () => {
      await moodRepository.getLegacyMoodEntryForDate('u1', '2026-10-20');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('mood_value IS NOT NULL');
      expect(sql).toMatch(
        /ORDER BY \(source = 'manual'\) DESC, \(source = 'garmin'\) DESC, entry_timestamp DESC, created_at DESC\s+LIMIT 1/
      );
      expect(params).toEqual(['u1', '2026-10-20']);
    });

    it('returns one row per day in a range, newest day first', async () => {
      await moodRepository.getLegacyMoodEntriesInRange(
        'u1',
        '2026-10-01',
        '2026-10-31'
      );
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('DISTINCT ON (entry_date)');
      expect(sql).toContain('mood_value IS NOT NULL');
      expect(sql).toContain(
        "ORDER BY entry_date DESC, (source = 'manual') DESC, (source = 'garmin') DESC, entry_timestamp DESC, created_at DESC"
      );
      expect(params).toEqual(['u1', '2026-10-01', '2026-10-31']);
    });
  });

  describe('hasManualCheckinAt', () => {
    it('looks for a manual check-in at that exact instant', async () => {
      query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const at = '2026-10-20T16:00:00.000Z';
      await expect(moodRepository.hasManualCheckinAt('u1', at)).resolves.toBe(
        true
      );
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("source = 'manual'");
      expect(sql).toContain('entry_timestamp = $2::timestamptz');
      expect(params).toEqual(['u1', at]);
    });

    it('is false when there is none', async () => {
      query.mockResolvedValueOnce({ rows: [] });
      await expect(
        moodRepository.hasManualCheckinAt('u1', '2026-10-20T16:00:00.000Z')
      ).resolves.toBe(false);
    });
  });

  describe('upsertLegacyMoodEntry', () => {
    it('updates the existing manual mood row in place', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1', mood_value: 60 }] });
      const row = await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: null,
      });
      expect(query).toHaveBeenCalledTimes(2);
      const [lookupSql, lookupParams] = query.mock.calls[0];
      expect(lookupSql).toContain("source = 'manual'");
      expect(lookupSql).toContain('mood_value IS NOT NULL');
      expect(lookupSql).toContain(
        'ORDER BY entry_timestamp DESC, created_at DESC'
      );
      expect(lookupParams).toEqual(['u1', '2026-10-20']);
      const [updateSql, updateParams] = query.mock.calls[1];
      expect(updateSql).toContain('UPDATE mood_entries');
      expect(updateSql).not.toContain('INSERT');
      expect(updateParams[0]).toBe('legacy-1');
      expect(updateParams[1]).toBe('u1');
      expect(row).toEqual({ id: 'legacy-1', mood_value: 60 });
    });

    it('keeps the stored journal when no notes are sent', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 70,
        entryDate: '2026-10-20',
      });
      const [updateSql, updateParams] = query.mock.calls[1];
      expect(updateSql).toContain('notes = COALESCE($5, notes)');
      expect(updateParams[4]).toBeNull();
    });

    it('inserts a manual row when no legacy row exists', async () => {
      const noon = new Date('2026-10-20T16:00:00.000Z');
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'new-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        entryTimestamp: noon,
      });
      expect(query).toHaveBeenCalledTimes(2);
      const [sql, params] = query.mock.calls[1];
      expect(sql).toContain('INSERT INTO mood_entries');
      expect(sql).toContain("'manual'");
      expect(sql).not.toContain('ON CONFLICT');
      expect(sql).toContain('COALESCE($8::timestamptz, now())');
      expect(params[7]).toBe(noon);
    });

    it("keeps the updated row's own time", async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      const noon = new Date('2026-10-20T16:00:00.000Z');
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        entryTimestamp: noon,
      });
      const [sql, params] = query.mock.calls[1];
      expect(sql).toContain('UPDATE mood_entries');
      expect(sql).not.toMatch(/entry_timestamp\s*=/);
      expect(params).not.toContain(noon);
    });

    it('keeps stored ratings when the caller sends none', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
      });
      const [sql, params] = query.mock.calls[1];
      expect(sql).toMatch(/energy_value = CASE WHEN \$\d+ THEN/);
      expect(params.slice(-4)).toEqual([null, false, null, false]);
    });

    it('clears a rating the caller explicitly nulls', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: null,
        focusValue: 3,
      });
      expect(query.mock.calls[1][1].slice(-4)).toEqual([null, true, 3, true]);
    });
  });

  describe('getCheckinsForDate', () => {
    it('returns manual rows only, in time order', async () => {
      await moodRepository.getCheckinsForDate('u1', '2026-10-20');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("source = 'manual'");
      expect(sql).toContain('ORDER BY entry_timestamp ASC, created_at ASC');
      expect(params).toEqual(['u1', '2026-10-20']);
    });
  });

  describe('getMoodEntriesByUserId', () => {
    it('orders by day then check-in time, newest first', async () => {
      await moodRepository.getMoodEntriesByUserId(
        'u1',
        '2026-10-01',
        '2026-10-31'
      );
      expect(query.mock.calls[0][0]).toContain(
        'ORDER BY entry_date DESC, entry_timestamp DESC'
      );
    });
  });

  describe('updateMoodEntryFields', () => {
    it('sets flag false for every field when the patch is empty', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', {});
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('entry_date = CASE WHEN $15');
      expect(params).toEqual([
        'm1',
        'u1',
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
      ]);
    });

    it('clears a field with an explicit null and sets supplied ones', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', {
        notes: null,
        energyValue: 4,
        moodTags: ['calm'],
        entryTimestamp: '2026-10-20T10:00:00Z',
        entryDate: '2026-10-20',
      });
      const params = query.mock.calls[0][1];
      // [id, user, mood flag, mood, notes flag, notes, tags flag, tags,
      //  energy flag, energy, focus flag, focus, timestamp flag, timestamp, date flag, date]
      expect(params.slice(2)).toEqual([
        false,
        null,
        true,
        null,
        true,
        ['calm'],
        true,
        4,
        false,
        null,
        true,
        '2026-10-20T10:00:00Z',
        true,
        '2026-10-20',
      ]);
    });

    it('uses a CASE flag for all seven fields', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', { moodValue: 50 });
      const sql = query.mock.calls[0][0];
      for (const column of [
        'mood_value',
        'notes',
        'mood_tags',
        'energy_value',
        'focus_value',
        'entry_timestamp',
        'entry_date',
      ]) {
        expect(sql).toContain(`${column} = CASE WHEN $`);
        expect(sql).toContain(`ELSE ${column} END`);
      }
    });
  });

  it('returns energy, focus, timestamp and source from every read', async () => {
    await moodRepository.getLegacyMoodEntryForDate('u1', '2026-10-20');
    expect(query.mock.calls[0][0]).toContain('energy_value, focus_value');
    expect(query.mock.calls[0][0]).toContain('entry_timestamp, source');
  });
});
