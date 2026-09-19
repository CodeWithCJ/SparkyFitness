import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/globalSettingsRepository.js', () => ({
  isMockDataEnabled: vi.fn(),
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdminByUserId: vi.fn(),
}));

import { isMockDataEnabled } from '../models/globalSettingsRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import { resolveMockDataOptions } from '../utils/mockDataOptions.js';

const mockIsEnabled = vi.mocked(isMockDataEnabled);
const mockIsAdmin = vi.mocked(resolveIsAdminByUserId);
const ADMIN = 'admin-user-1';

describe('resolveMockDataOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when the admin setting is off (the default)', () => {
    beforeEach(() => {
      mockIsEnabled.mockResolvedValue(false);
      mockIsAdmin.mockResolvedValue(true);
    });

    it('ignores a posted saveMockData, so nothing is written to disk', async () => {
      const options = await resolveMockDataOptions(
        { saveMockData: true },
        ADMIN
      );
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('ignores a posted dataSource, so the real provider is still called', async () => {
      const options = await resolveMockDataOptions(
        { dataSource: 'local' },
        ADMIN
      );
      expect(options.dataSource).toBeUndefined();
    });
  });

  describe('when the setting is on but the caller is not an admin', () => {
    beforeEach(() => {
      mockIsEnabled.mockResolvedValue(true);
      mockIsAdmin.mockResolvedValue(false);
    });

    // A captured bundle lives at mock_data/<provider>_raw.json, one file per
    // provider and not per user. Without this gate a non-admin could replay
    // another user's raw health data into their own account.
    it('refuses to replay a bundle for a non-admin', async () => {
      const options = await resolveMockDataOptions(
        { dataSource: 'local' },
        'regular-user-1'
      );
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('refuses to capture a bundle for a non-admin', async () => {
      const options = await resolveMockDataOptions(
        { saveMockData: true },
        'regular-user-1'
      );
      expect(options.saveMockData).toBe(false);
    });

    it('refuses when there is no authenticated actor at all', async () => {
      const options = await resolveMockDataOptions(
        { dataSource: 'local', saveMockData: true },
        undefined
      );
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });
  });

  describe('when an admin has turned it on and the caller is an admin', () => {
    beforeEach(() => {
      mockIsEnabled.mockResolvedValue(true);
      mockIsAdmin.mockResolvedValue(true);
    });

    it('honours both options', async () => {
      const options = await resolveMockDataOptions(
        { dataSource: 'local', saveMockData: true },
        ADMIN
      );
      expect(options).toEqual({ dataSource: 'local', saveMockData: true });
    });

    it('defaults to off for a body that asks for neither', async () => {
      const options = await resolveMockDataOptions(
        { startDate: '2026-01-01' },
        ADMIN
      );
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('only accepts a string dataSource and a literal true', async () => {
      const options = await resolveMockDataOptions(
        { dataSource: 123, saveMockData: 'true' },
        ADMIN
      );
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('tolerates a missing or non-object body', async () => {
      await expect(resolveMockDataOptions(undefined, ADMIN)).resolves.toEqual({
        dataSource: undefined,
        saveMockData: false,
      });
      await expect(resolveMockDataOptions(null, ADMIN)).resolves.toEqual({
        dataSource: undefined,
        saveMockData: false,
      });
    });
  });
});
