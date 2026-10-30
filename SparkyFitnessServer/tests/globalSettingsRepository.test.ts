import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { getSystemClient } from '../db/poolManager.js';
// Mock dependencies
vi.mock('../db/poolManager', () => ({
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
describe('globalSettingsRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getSystemClient.mockResolvedValue(mockClient);
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  describe('getGlobalSettings', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });
    it('should return global settings when found', async () => {
      const mockSettings = {
        id: 1,
        mfa_mandatory: true,
        allow_user_ai_config: false,
        is_oidc_active: true,
      };
      mockClient.query.mockResolvedValue({ rows: [mockSettings] });
      const result = await globalSettingsRepository.getGlobalSettings();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM global_settings WHERE id = 1'
      );
      expect(result).toEqual({
        ...mockSettings,
        is_mfa_mandatory: true, // mapped property
      });
      expect(mockClient.release).toHaveBeenCalled();
    });
    it('should return settings with default allow_user_ai_config = true if null', async () => {
      const mockSettings = {
        id: 1,
        mfa_mandatory: false,
        allow_user_ai_config: null,
      };
      mockClient.query.mockResolvedValue({ rows: [mockSettings] });
      const result = await globalSettingsRepository.getGlobalSettings();
      expect(result.allow_user_ai_config).toBe(true);
    });
    it.each([
      [false, undefined, undefined, false],
      [true, undefined, undefined, true],
      [null, undefined, undefined, true],
      [true, undefined, 'true', false],
      [false, 'true', undefined, true],
      [false, 'true', 'true', true],
    ])(
      'resolves email login from saved=%s FORCE=%s DISABLE=%s to %s',
      async (saved, force, disable, expected) => {
        vi.stubEnv('SPARKY_FITNESS_FORCE_EMAIL_LOGIN', force);
        vi.stubEnv('SPARKY_FITNESS_DISABLE_EMAIL_LOGIN', disable);
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, enable_email_password_login: saved }],
        });
        const result = await globalSettingsRepository.getGlobalSettings();
        expect(result.enable_email_password_login).toBe(expected);
      }
    );
    it.each([
      [true, undefined, undefined, true],
      [false, undefined, undefined, false],
      [null, undefined, undefined, true],
      [true, undefined, 'true', false],
      [false, undefined, 'false', false],
      [false, 'true', undefined, true],
      [true, 'true', 'true', true],
      [false, 'false', 'true', false],
    ])(
      'resolves passkey login from saved=%s FORCE=%s DISABLE=%s to %s',
      async (saved, force, disable, expected) => {
        vi.stubEnv('SPARKY_FITNESS_FORCE_PASSKEY_LOGIN', force);
        vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', disable);
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, enable_passkey_login: saved }],
        });
        const result = await globalSettingsRepository.getGlobalSettings();
        expect(result.enable_passkey_login).toBe(expected);
        expect(result.is_passkey_login_env_configured).toBe(
          force === 'true' || disable === 'true'
        );
      }
    );
    it.each([
      [true, true],
      [false, false],
      [undefined, false],
    ])(
      'reports the version check from saved=%s as %s',
      async (saved, expected) => {
        mockClient.query.mockResolvedValue({
          rows: [{ id: 1, enable_version_check: saved }],
        });
        const result = await globalSettingsRepository.getGlobalSettings();
        expect(result.enable_version_check).toBe(expected);
      }
    );
    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      mockClient.query.mockRejectedValue(error);
      await expect(
        globalSettingsRepository.getGlobalSettings()
      ).rejects.toThrow('DB Error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
  describe('saveGlobalSettings', () => {
    it.each([
      ['SPARKY_FITNESS_FORCE_EMAIL_LOGIN', 0],
      ['SPARKY_FITNESS_DISABLE_EMAIL_LOGIN', 0],
      ['SPARKY_FITNESS_OIDC_AUTH_ENABLED', 1],
    ])(
      'keeps the stored admin choice while %s forces it',
      async (envVar, param) => {
        vi.stubEnv(envVar, 'true');
        mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
        await globalSettingsRepository.saveGlobalSettings({
          enable_email_password_login: false,
          is_oidc_active: true,
          is_mfa_mandatory: false,
        });
        const [sql, params] = mockClient.query.mock.calls[0];
        expect(sql).toContain(
          'enable_email_password_login = COALESCE($1, enable_email_password_login)'
        );
        expect(sql).toContain('is_oidc_active = COALESCE($2, is_oidc_active)');
        expect(params[param]).toBeNull();
      }
    );

    it('saves the admin login choices when no env var forces them', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings({
        enable_email_password_login: false,
        is_oidc_active: true,
        is_mfa_mandatory: false,
      });
      const params = mockClient.query.mock.calls[0][1];
      expect(params[0]).toBe(false);
      expect(params[1]).toBe(true);
    });

    it.each([
      'SPARKY_FITNESS_FORCE_PASSKEY_LOGIN',
      'SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN',
    ])(
      'keeps the stored passkey setting while %s forces it',
      async (envVar) => {
        vi.stubEnv(envVar, 'true');
        mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
        await globalSettingsRepository.saveGlobalSettings({
          enable_email_password_login: true,
          is_oidc_active: false,
          is_mfa_mandatory: false,
          enable_passkey_login: false,
        });
        expect(mockClient.query.mock.calls[0][1][12]).toBeNull();
      }
    );

    it('saves the MCP OAuth feature switch', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings({
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        mcp_oauth_enabled: true,
      });
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('mcp_oauth_enabled = COALESCE($14');
      expect(params[13]).toBe(true);
    });

    it('saves the MCP OAuth redirect allowlist', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      const redirects = [
        'https://claude.ai/api/mcp/auth_callback',
        'http://localhost:*',
      ];
      await globalSettingsRepository.saveGlobalSettings({
        mcp_oauth_allowed_redirect_uris: redirects,
      });
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain('mcp_oauth_allowed_redirect_uris = COALESCE($16');
      expect(params[15]).toEqual(redirects);
    });

    it('saves the passkey login setting', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings({
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        enable_passkey_login: false,
      });
      const params = mockClient.query.mock.calls[0][1];
      expect(mockClient.query.mock.calls[0][0]).toContain(
        'enable_passkey_login = COALESCE($13'
      );
      expect(params[12]).toBe(false);
    });

    it('saves the version check setting', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings({
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        enable_version_check: false,
      });
      const [sql, params] = mockClient.query.mock.calls[0];
      expect(sql).toContain(
        'enable_version_check = COALESCE($15, enable_version_check, true)'
      );
      expect(params[14]).toBe(false);
    });
    it('should update and return global settings', async () => {
      const inputSettings = {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: true, // frontend property name
        allow_user_ai_config: false,
      };
      const savedSettings = {
        id: 1,
        enable_email_password_login: true,
        is_oidc_active: false,
        mfa_mandatory: true,
        allow_user_ai_config: false,
      };
      mockClient.query.mockResolvedValue({ rows: [savedSettings] });
      const result =
        await globalSettingsRepository.saveGlobalSettings(inputSettings);
      // 5th param is default_vision_ai_service_id (null when not supplied); the
      // 6th is the existence flag, false here so the CASE WHEN leaves it untouched.
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE global_settings'),
        [
          true,
          false,
          true,
          false,
          null,
          false,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ]
      );
      expect(result).toEqual({
        ...savedSettings,
        is_mfa_mandatory: true,
      });
    });
    it('persists the default_vision_ai_service_id pointer when supplied', async () => {
      const inputSettings = {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        allow_user_ai_config: true,
        default_vision_ai_service_id: 'vision-svc-1',
      };
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings(inputSettings);
      const params = mockClient.query.mock.calls[0][1];
      expect(params[4]).toBe('vision-svc-1');
      // Present in the payload, so the existence flag is true and the CASE WHEN
      // writes the supplied value.
      expect(params[5]).toBe(true);
      expect(params[6]).toBeNull();
      expect(mockClient.query.mock.calls[0][0]).toContain(
        'default_vision_ai_service_id = CASE WHEN $6 THEN $5 ELSE default_vision_ai_service_id END'
      );
    });
    it('leaves the default_vision_ai_service_id pointer untouched when omitted', async () => {
      const inputSettings = {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        allow_user_ai_config: true,
        // default_vision_ai_service_id intentionally omitted
      };
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings(inputSettings);
      // Existence flag false => the CASE WHEN keeps the stored value rather than
      // clobbering it with null.
      const params = mockClient.query.mock.calls[0][1];
      expect(params[5]).toBe(false);
    });
    it('clears the default_vision_ai_service_id pointer when set to null', async () => {
      const inputSettings = {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        allow_user_ai_config: true,
        default_vision_ai_service_id: null,
      };
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });
      await globalSettingsRepository.saveGlobalSettings(inputSettings);
      // Explicit null is present in the payload, so the existence flag is true
      // and the CASE WHEN clears the pointer ("None").
      const params = mockClient.query.mock.calls[0][1];
      expect(params[4]).toBeNull();
      expect(params[5]).toBe(true);
    });
    it('should default allow_user_ai_config to true if undefined in update', async () => {
      const inputSettings = {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: true,
        // allow_user_ai_config is missing
      };
      const savedSettings = {
        id: 1,
        allow_user_ai_config: true,
        mfa_mandatory: true,
      };
      mockClient.query.mockResolvedValue({ rows: [savedSettings] });
      await globalSettingsRepository.saveGlobalSettings(inputSettings);
      // Check the 4th parameter of the query call
      const queryCalls = mockClient.query.mock.calls[0];
      const params = queryCalls[1];
      expect(params[3]).toBe(true);
    });
    it('persists the server-wide Open Food Facts contribution gate when supplied', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ id: 1, allow_openfoodfacts_contributions: true }],
      });

      await globalSettingsRepository.saveGlobalSettings({
        allow_openfoodfacts_contributions: true,
      });

      const [query, params] = mockClient.query.mock.calls[0];
      expect(query).toContain(
        'allow_openfoodfacts_contributions = COALESCE($7'
      );
      expect(params[6]).toBe(true);
    });
  });
  describe('isUserAiConfigAllowed', () => {
    it('should return the value from the database', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ allow_user_ai_config: false }],
      });
      const result = await globalSettingsRepository.isUserAiConfigAllowed();
      expect(result).toBe(false);
    });
    it('should return true (default) if no record found (though unlikely for id=1)', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await globalSettingsRepository.isUserAiConfigAllowed();
      expect(result).toBe(true);
    });
  });
  describe('isVersionCheckEnabled', () => {
    it.each([true, false])(
      'returns the stored enable_version_check (%s)',
      async (stored) => {
        mockClient.query.mockResolvedValue({
          rows: [{ enable_version_check: stored }],
        });
        await expect(
          globalSettingsRepository.isVersionCheckEnabled()
        ).resolves.toBe(stored);
        expect(mockClient.query).toHaveBeenCalledWith(
          'SELECT enable_version_check FROM global_settings WHERE id = 1'
        );
        expect(mockClient.release).toHaveBeenCalled();
      }
    );
  });
  describe('getMfaMandatorySetting', () => {
    it('should return mfa_mandatory value', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ mfa_mandatory: true }] });
      const result = await globalSettingsRepository.getMfaMandatorySetting();
      expect(result).toBe(true);
    });
    it('should return false if no record found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await globalSettingsRepository.getMfaMandatorySetting();
      expect(result).toBe(false);
    });
  });
  describe('setMfaMandatorySetting', () => {
    it('should update mfa_mandatory setting', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ mfa_mandatory: true }] });
      const result =
        await globalSettingsRepository.setMfaMandatorySetting(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE global_settings SET mfa_mandatory = $1'
        ),
        [true]
      );
      expect(result).toEqual({ mfa_mandatory: true });
    });
  });
});
