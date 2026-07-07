import { vi, afterEach, describe, expect, it } from 'vitest';
import dashboardLayoutService from '../services/dashboardLayoutService.js';
import dashboardLayoutRepository from '../models/dashboardLayoutRepository.js';

vi.mock('../models/dashboardLayoutRepository', () => ({
  default: {
    getDashboardLayout: vi.fn(),
    upsertDashboardLayout: vi.fn(),
    deleteDashboardLayout: vi.fn(),
  },
}));

describe('dashboardLayoutService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('page key validation', () => {
    it('accepts the diary page key', async () => {
      vi.mocked(dashboardLayoutRepository.getDashboardLayout).mockResolvedValue(
        null
      );

      await expect(
        dashboardLayoutService.getDashboardLayout('user-1', 'diary')
      ).resolves.toBeNull();
    });

    it('accepts the reports-measurements page key', async () => {
      vi.mocked(dashboardLayoutRepository.getDashboardLayout).mockResolvedValue(
        null
      );

      await expect(
        dashboardLayoutService.getDashboardLayout(
          'user-1',
          'reports-measurements'
        )
      ).resolves.toBeNull();
    });

    it('rejects an unknown page key', async () => {
      await expect(
        dashboardLayoutService.getDashboardLayout('user-1', 'not-a-real-page')
      ).rejects.toThrow('Unknown dashboard page_key: not-a-real-page');
      expect(
        dashboardLayoutRepository.getDashboardLayout
      ).not.toHaveBeenCalled();
    });

    it('rejects an unknown page key on save', async () => {
      await expect(
        dashboardLayoutService.saveDashboardLayout('user-1', 'bogus', {
          layout: { lg: [] },
          hidden: [],
        })
      ).rejects.toThrow('Unknown dashboard page_key: bogus');
      expect(
        dashboardLayoutRepository.upsertDashboardLayout
      ).not.toHaveBeenCalled();
    });

    it('rejects an unknown page key on reset', async () => {
      await expect(
        dashboardLayoutService.resetDashboardLayout('user-1', 'bogus')
      ).rejects.toThrow('Unknown dashboard page_key: bogus');
      expect(
        dashboardLayoutRepository.deleteDashboardLayout
      ).not.toHaveBeenCalled();
    });
  });

  describe('getDashboardLayout', () => {
    it('returns null when no row is saved', async () => {
      vi.mocked(dashboardLayoutRepository.getDashboardLayout).mockResolvedValue(
        null
      );

      const result = await dashboardLayoutService.getDashboardLayout(
        'user-1',
        'diary'
      );

      expect(result).toBeNull();
    });

    it('returns the layout, hidden, and updated_at fields from the row', async () => {
      vi.mocked(dashboardLayoutRepository.getDashboardLayout).mockResolvedValue(
        {
          id: 'row-1',
          user_id: 'user-1',
          page_key: 'diary',
          layout: { lg: [] },
          hidden: ['water'],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }
      );

      const result = await dashboardLayoutService.getDashboardLayout(
        'user-1',
        'diary'
      );

      expect(result).toEqual({
        layout: { lg: [] },
        hidden: ['water'],
        updated_at: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('saveDashboardLayout', () => {
    it('rejects a non-object layout payload', async () => {
      await expect(
        dashboardLayoutService.saveDashboardLayout('user-1', 'diary', {
          layout: null,
          hidden: [],
        })
      ).rejects.toThrow('layout must be an object keyed by breakpoint');
    });

    it('rejects a non-array hidden payload', async () => {
      await expect(
        dashboardLayoutService.saveDashboardLayout('user-1', 'diary', {
          layout: { lg: [] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hidden: 'not-an-array' as any,
        })
      ).rejects.toThrow('hidden must be an array of widget keys');
    });

    it('upserts and returns the saved row', async () => {
      const layout = { lg: [{ i: 'weight', x: 0, y: 0, w: 3, h: 10 }] };
      const hidden = ['neck'];
      vi.mocked(
        dashboardLayoutRepository.upsertDashboardLayout
      ).mockResolvedValue({
        id: 'row-1',
        user_id: 'user-1',
        page_key: 'reports-measurements',
        layout,
        hidden,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      });

      const result = await dashboardLayoutService.saveDashboardLayout(
        'user-1',
        'reports-measurements',
        { layout, hidden }
      );

      expect(
        dashboardLayoutRepository.upsertDashboardLayout
      ).toHaveBeenCalledWith('user-1', 'reports-measurements', {
        layout,
        hidden,
      });
      expect(result).toEqual({
        layout,
        hidden,
        updated_at: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('resetDashboardLayout', () => {
    it('deletes the saved row', async () => {
      vi.mocked(
        dashboardLayoutRepository.deleteDashboardLayout
      ).mockResolvedValue(undefined);

      await dashboardLayoutService.resetDashboardLayout(
        'user-1',
        'reports-measurements'
      );

      expect(
        dashboardLayoutRepository.deleteDashboardLayout
      ).toHaveBeenCalledWith('user-1', 'reports-measurements');
    });
  });
});
