import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SYNCED_SOURCE_TABLES,
  SYNCED_PROVIDER_TABLES,
  SYNCED_TABLE_COLUMNS,
  isUserOriginatedSource,
  deleteSyncedDataBySource,
} from '../models/syncedDataRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('syncedDataRepository', () => {
  describe('SYNCED_TABLE_COLUMNS', () => {
    it('pairs every `source`-column table from SYNCED_SOURCE_TABLES with the column "source"', () => {
      for (const table of SYNCED_SOURCE_TABLES) {
        expect(SYNCED_TABLE_COLUMNS).toContainEqual([table, 'source']);
      }
    });

    it('pairs every telemetry table with the column "source_provider"', () => {
      for (const table of SYNCED_PROVIDER_TABLES) {
        expect(SYNCED_TABLE_COLUMNS).toContainEqual([table, 'source_provider']);
      }
    });

    it('includes the telemetry tables that previously survived a by-source delete', () => {
      // Regression guard: health_metric_samples (the consolidated replacement for
      // heart_rate_entries/hrv_entries/respiration_entries/spo2_entries) has no FK
      // to exercise/sleep entries at all -- linkage is an in-sample plain ID, not a
      // cascading FK -- and daily_health_metrics has no FK either. Both were
      // previously left orphaned when deleting a provider via the diary tables
      // alone. See PLAN/telemetry_redesign_phase_1_database.md Step 3.
      expect(SYNCED_PROVIDER_TABLES).toEqual(
        expect.arrayContaining([
          'health_metric_samples',
          'vitals_entries',
          'daily_health_metrics',
        ])
      );
    });

    it('does not include exercise_entry_gps_points/laps/hr_zones, which cascade from exercise_entries and carry no provenance column', () => {
      const allTables = SYNCED_TABLE_COLUMNS.map(([table]) => table);
      expect(allTables).not.toContain('exercise_entry_gps_points');
      expect(allTables).not.toContain('exercise_entry_laps');
      expect(allTables).not.toContain('exercise_entry_hr_zones');
    });
  });

  describe('deleteSyncedDataBySource', () => {
    const mockQuery = vi.fn();
    const mockClient = { query: mockQuery, release: vi.fn() };

    beforeEach(() => {
      vi.clearAllMocks();
      (getClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
      mockQuery.mockResolvedValue({ rowCount: 0 });
    });

    it('deletes from every synced table using the correct column per table', async () => {
      await deleteSyncedDataBySource('user-1', 'garmin');

      for (const [table, column] of SYNCED_TABLE_COLUMNS) {
        expect(mockQuery).toHaveBeenCalledWith(
          `DELETE FROM ${table} WHERE user_id = $1 AND ${column} = $2`,
          ['user-1', 'garmin']
        );
      }
    });

    it('refuses to delete a user-originated source', async () => {
      await expect(
        deleteSyncedDataBySource('user-1', 'Manual')
      ).rejects.toThrow(/Refusing to bulk-delete/);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('isUserOriginatedSource', () => {
    it('is case-insensitive', () => {
      expect(isUserOriginatedSource('MANUAL')).toBe(true);
      expect(isUserOriginatedSource('Workout Preset')).toBe(true);
      expect(isUserOriginatedSource('garmin')).toBe(false);
    });
  });
});
