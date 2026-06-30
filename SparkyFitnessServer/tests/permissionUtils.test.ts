import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { getClient, getSystemClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

describe('permissionUtils - canAccessUserData read/write segregation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSystemClient: any;

  const OWNER_ID = 'owner-uuid';
  const DELEGATE_ID = 'delegate-uuid';

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockSystemClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { target_email: 'owner@test.com', auth_email: 'delegate@test.com' },
        ],
      }),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): mockResolvedValue
    getClient.mockResolvedValue(mockClient);
    // @ts-expect-error TS(2339): mockResolvedValue
    getSystemClient.mockResolvedValue(mockSystemClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to set up the mock to simulate family_access with specific permissions
  function setupFamilyAccess(hasAccess: boolean) {
    mockClient.query.mockResolvedValue({
      rowCount: hasAccess ? 1 : 0,
      rows: hasAccess ? [{ '?column?': 1 }] : [],
    });
  }

  // ----------------------------------------------------------------
  // Self-access always allowed
  // ----------------------------------------------------------------
  it('should always allow self-access regardless of permission type', async () => {
    const result = await canAccessUserData(OWNER_ID, 'diary', OWNER_ID);
    expect(result).toBe(true);
    // Should not even query family_access
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // Write-level permissions should NOT inherit from reports
  // ----------------------------------------------------------------
  describe('write-level permissions do NOT inherit from reports', () => {
    it('diary write permission should not be granted by reports-only delegate', async () => {
      setupFamilyAccess(false);
      const result = await canAccessUserData(OWNER_ID, 'diary', DELEGATE_ID);
      expect(result).toBe(false);

      // Verify the SQL query does NOT include 'diary' in the reports inheritance list
      const queryArg = mockClient.query.mock.calls[0][0];
      // The reports inheritance line should NOT include 'diary' in the IN clause
      expect(queryArg).not.toMatch(
        /\$3 IN \([^)]*'diary'[^)]*\).*can_view_reports/s
      );
    });

    it('checkin write permission should not be granted by reports-only delegate', async () => {
      setupFamilyAccess(false);
      const result = await canAccessUserData(OWNER_ID, 'checkin', DELEGATE_ID);
      expect(result).toBe(false);

      const queryArg = mockClient.query.mock.calls[0][0];
      expect(queryArg).not.toMatch(
        /\$3 IN \([^)]*'checkin'[^)]*\).*can_view_reports/s
      );
    });

    it('medications write permission should not be granted by reports-only delegate', async () => {
      setupFamilyAccess(false);
      const result = await canAccessUserData(
        OWNER_ID,
        'medications',
        DELEGATE_ID
      );
      expect(result).toBe(false);

      const queryArg = mockClient.query.mock.calls[0][0];
      expect(queryArg).not.toMatch(
        /\$3 IN \([^)]*'medications'[^)]*\).*can_view_reports/s
      );
    });
  });

  // ----------------------------------------------------------------
  // Read-level permissions should be checked correctly
  // ----------------------------------------------------------------
  describe('read-level permissions', () => {
    it('diary_read should be satisfied by can_manage_diary delegate', async () => {
      setupFamilyAccess(true);
      const result = await canAccessUserData(
        OWNER_ID,
        'diary_read',
        DELEGATE_ID
      );
      expect(result).toBe(true);
    });

    it('diary_read permission mapping exists in the SQL query', async () => {
      setupFamilyAccess(false);
      await canAccessUserData(OWNER_ID, 'diary_read', DELEGATE_ID);
      const queryArg = mockClient.query.mock.calls[0][0];
      expect(queryArg).toContain("$3 = 'diary_read'");
      expect(queryArg).toContain('can_manage_diary');
      expect(queryArg).toContain('can_view_reports');
      expect(queryArg).toContain('can_view_food_library');
    });

    it('checkin_read should be satisfied by can_manage_checkin delegate', async () => {
      setupFamilyAccess(true);
      const result = await canAccessUserData(
        OWNER_ID,
        'checkin_read',
        DELEGATE_ID
      );
      expect(result).toBe(true);
    });

    it('medications_read should be satisfied by can_manage_medications delegate', async () => {
      setupFamilyAccess(true);
      const result = await canAccessUserData(
        OWNER_ID,
        'medications_read',
        DELEGATE_ID
      );
      expect(result).toBe(true);
    });

    it('reports permission mapping includes can_view_reports, can_manage_diary, can_manage_checkin', async () => {
      setupFamilyAccess(false);
      await canAccessUserData(OWNER_ID, 'reports', DELEGATE_ID);
      const queryArg = mockClient.query.mock.calls[0][0];
      expect(queryArg).toContain("$3 = 'reports'");
      expect(queryArg).toContain('can_view_reports');
      expect(queryArg).toContain('can_manage_diary');
      expect(queryArg).toContain('can_manage_checkin');
    });
  });

  // ----------------------------------------------------------------
  // Read-only permission types should still inherit from reports
  // ----------------------------------------------------------------
  describe('read-only permission types inherit from reports', () => {
    const readOnlyTypes = [
      'mood',
      'goals',
      'exercise',
      'fasting',
      'sleep',
      'water',
      'symptoms',
    ];

    for (const permType of readOnlyTypes) {
      it(`${permType} should be in the reports inheritance list`, async () => {
        setupFamilyAccess(false);
        await canAccessUserData(OWNER_ID, permType, DELEGATE_ID);
        const queryArg = mockClient.query.mock.calls[0][0];
        expect(queryArg).toContain(`'${permType}'`);
        // Verify it's in the IN clause that checks can_view_reports
        expect(queryArg).toMatch(/\$3 IN \([^)]*\).*can_view_reports/s);
      });
    }
  });

  // ----------------------------------------------------------------
  // Verify write-level permission types are NOT in the inheritance IN list
  // ----------------------------------------------------------------
  describe('write-level types excluded from reports inheritance IN list', () => {
    it('the reports inheritance IN list should not contain diary, checkin, or medications', async () => {
      setupFamilyAccess(false);
      await canAccessUserData(OWNER_ID, 'mood', DELEGATE_ID);
      const queryArg = mockClient.query.mock.calls[0][0];

      // Extract the IN clause from the reports inheritance block
      const inMatch = queryArg.match(/\$3 IN \(([^)]+)\).*?can_view_reports/s);
      expect(inMatch).not.toBeNull();

      const inListContent = inMatch![1];
      expect(inListContent).not.toContain("'diary'");
      expect(inListContent).not.toContain("'checkin'");
      expect(inListContent).not.toContain("'medications'");
    });
  });
});
