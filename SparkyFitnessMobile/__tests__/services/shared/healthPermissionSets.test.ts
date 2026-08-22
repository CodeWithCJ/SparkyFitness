import {
  enabledWritebackPermissions,
  enabledReadPermissionsForRecordType,
} from '../../../src/services/shared/healthPermissionSets';

describe('healthPermissionSets', () => {
  describe('enabledWritebackPermissions', () => {
    it('returns the write direction only for writeback metrics that are on', () => {
      const perms = enabledWritebackPermissions({ hydration: true, nutrition: false });
      expect(perms).toEqual([{ accessType: 'write', recordType: 'Hydration' }]);
    });

    it('returns nothing when no writeback metric is on', () => {
      expect(enabledWritebackPermissions({})).toEqual([]);
      expect(enabledWritebackPermissions({ hydration: false })).toEqual([]);
    });

    it('scopes to the requested record types', () => {
      const perms = enabledWritebackPermissions(
        { hydration: true, nutrition: true },
        new Set(['Hydration']),
      );
      expect(perms).toEqual([{ accessType: 'write', recordType: 'Hydration' }]);
    });
  });

  describe('enabledReadPermissionsForRecordType', () => {
    it('returns the read direction when that metric is on', () => {
      const perms = enabledReadPermissionsForRecordType(
        { isHydrationSyncEnabled: true },
        'Hydration',
      );
      expect(perms).toEqual([{ accessType: 'read', recordType: 'Hydration' }]);
    });

    it('returns nothing when the read metric is off — an off direction is never requested', () => {
      expect(
        enabledReadPermissionsForRecordType({ isHydrationSyncEnabled: false }, 'Hydration'),
      ).toEqual([]);
    });

    it('ignores metrics for other record types', () => {
      expect(
        enabledReadPermissionsForRecordType({ isHydrationSyncEnabled: true }, 'Nutrition'),
      ).toEqual([]);
    });
  });
});
