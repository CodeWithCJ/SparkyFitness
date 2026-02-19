const request = require('supertest');
const express = require('express');
const globalSettingsRoutes = require('../routes/globalSettingsRoutes');
const globalSettingsRepository = require('../models/globalSettingsRepository');
const { isAdmin, authenticate } = require('../middleware/authMiddleware');

// Mock dependencies
jest.mock('../models/globalSettingsRepository', () => ({
    getGlobalSettings: jest.fn(),
    saveGlobalSettings: jest.fn(),
    isUserAiConfigAllowed: jest.fn(),
    // others as needed
}));

jest.mock('../middleware/authMiddleware', () => ({
    isAdmin: jest.fn((req, res, next) => next()), // Mock authenticate/admin success
    authenticate: jest.fn((req, res, next) => next()),
}));

const app = express();
app.use(express.json());
app.use('/admin/global-settings', globalSettingsRoutes);

describe('Global Settings Routes', () => {

    describe('GET /admin/global-settings', () => {
        it('should return global settings', async () => {
            const mockSettings = { id: 1, allow_user_ai_config: false };
            globalSettingsRepository.getGlobalSettings.mockResolvedValue(mockSettings);

            const res = await request(app).get('/admin/global-settings');

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(mockSettings);
            expect(globalSettingsRepository.getGlobalSettings).toHaveBeenCalled();
        });

        it('should handle repository errors', async () => {
            globalSettingsRepository.getGlobalSettings.mockRejectedValue(new Error('DB Error'));

            const res = await request(app).get('/admin/global-settings');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ message: 'Error retrieving global auth settings' });
        });
    });

    describe('PUT /admin/global-settings', () => {
        it('should update and return global settings', async () => {
            const inputSettings = { allow_user_ai_config: true };
            const savedSettings = { id: 1, allow_user_ai_config: true };
            globalSettingsRepository.saveGlobalSettings.mockResolvedValue(savedSettings);

            const res = await request(app)
                .put('/admin/global-settings')
                .send(inputSettings);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual(savedSettings);
            expect(globalSettingsRepository.saveGlobalSettings).toHaveBeenCalledWith(inputSettings);
        });

        it('should handle repository errors during save', async () => {
            globalSettingsRepository.saveGlobalSettings.mockRejectedValue(new Error('Update failed'));

            const res = await request(app)
                .put('/admin/global-settings')
                .send({});

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ message: 'Error updating global auth settings' });
        });
    });

    describe('GET /admin/global-settings/allow-user-ai-config', () => {
        it('should return user AI config permission', async () => {
            globalSettingsRepository.isUserAiConfigAllowed.mockResolvedValue(true);

            const res = await request(app).get('/admin/global-settings/allow-user-ai-config');

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ allow_user_ai_config: true });
        });

        it('should handle errors', async () => {
            globalSettingsRepository.isUserAiConfigAllowed.mockRejectedValue(new Error('Check failed'));

            const res = await request(app).get('/admin/global-settings/allow-user-ai-config');

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ message: 'Error checking user AI config permission' });
        });
    });

});
