const globalSettingsRepository = require('../models/globalSettingsRepository');
const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

// Mock dependencies
jest.mock('../db/poolManager', () => ({
    getSystemClient: jest.fn(),
}));

jest.mock('../config/logging', () => ({
    log: jest.fn(),
}));

describe('globalSettingsRepository', () => {
    let mockClient;

    beforeEach(() => {
        mockClient = {
            query: jest.fn(),
            release: jest.fn(),
        };
        getSystemClient.mockResolvedValue(mockClient);
        jest.clearAllMocks();
    });

    describe('getGlobalSettings', () => {
        it('should return global settings when found', async () => {
            const mockSettings = {
                id: 1,
                mfa_mandatory: true,
                allow_user_ai_config: false,
                is_oidc_active: true
            };
            mockClient.query.mockResolvedValue({ rows: [mockSettings] });

            const result = await globalSettingsRepository.getGlobalSettings();

            expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM global_settings WHERE id = 1');
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
                allow_user_ai_config: null
            };
            mockClient.query.mockResolvedValue({ rows: [mockSettings] });

            const result = await globalSettingsRepository.getGlobalSettings();

            expect(result.allow_user_ai_config).toBe(true);
        });

        it('should handle database errors', async () => {
            const error = new Error('DB Error');
            mockClient.query.mockRejectedValue(error);

            await expect(globalSettingsRepository.getGlobalSettings()).rejects.toThrow('DB Error');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('saveGlobalSettings', () => {
        it('should update and return global settings', async () => {
            const inputSettings = {
                enable_email_password_login: true,
                is_oidc_active: false,
                is_mfa_mandatory: true, // frontend property name
                allow_user_ai_config: false
            };

            const savedSettings = {
                id: 1,
                enable_email_password_login: true,
                is_oidc_active: false,
                mfa_mandatory: true,
                allow_user_ai_config: false
            };

            mockClient.query.mockResolvedValue({ rows: [savedSettings] });

            const result = await globalSettingsRepository.saveGlobalSettings(inputSettings);

            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE global_settings'),
                [true, false, true, false]
            );
            expect(result).toEqual({
                ...savedSettings,
                is_mfa_mandatory: true,
            });
        });

        it('should default allow_user_ai_config to true if undefined in update', async () => {
            const inputSettings = {
                enable_email_password_login: true,
                is_oidc_active: false,
                is_mfa_mandatory: true
                // allow_user_ai_config is missing
            };

            const savedSettings = {
                id: 1,
                allow_user_ai_config: true,
                mfa_mandatory: true
            };

            mockClient.query.mockResolvedValue({ rows: [savedSettings] });

            await globalSettingsRepository.saveGlobalSettings(inputSettings);

            // Check the 4th parameter of the query call
            const queryCalls = mockClient.query.mock.calls[0];
            const params = queryCalls[1];
            expect(params[3]).toBe(true);
        });
    });

    describe('isUserAiConfigAllowed', () => {
        it('should return the value from the database', async () => {
            mockClient.query.mockResolvedValue({ rows: [{ allow_user_ai_config: false }] });
            const result = await globalSettingsRepository.isUserAiConfigAllowed();
            expect(result).toBe(false);
        });

        it('should return true (default) if no record found (though unlikely for id=1)', async () => {
            mockClient.query.mockResolvedValue({ rows: [] });
            const result = await globalSettingsRepository.isUserAiConfigAllowed();
            expect(result).toBe(true);
        });
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
            const result = await globalSettingsRepository.setMfaMandatorySetting(true);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE global_settings SET mfa_mandatory = $1'),
                [true]
            );
            expect(result).toEqual({ mfa_mandatory: true });
        });
    });
});
