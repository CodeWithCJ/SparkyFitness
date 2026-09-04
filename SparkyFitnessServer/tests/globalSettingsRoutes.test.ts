import { vi, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
import express from 'express';
import globalSettingsRoutes from '../routes/globalSettingsRoutes.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import {
  getOpenFoodFactsAdminSyncStatus,
  saveGlobalSettingsWithOpenFoodFactsSync,
} from '../services/openFoodFactsSyncSettingsService.js';
// Mock dependencies
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: {
    getGlobalSettings: vi.fn(),
    saveGlobalSettings: vi.fn(),
    isUserAiConfigAllowed: vi.fn(),
  },
}));
vi.mock('../services/openFoodFactsSyncSettingsService.js', () => ({
  getOpenFoodFactsAdminSyncStatus: vi.fn(),
  saveGlobalSettingsWithOpenFoodFactsSync: vi.fn(),
}));
vi.mock('../middleware/authMiddleware', () => ({
  isAdmin: vi.fn((req, res, next) => next()), // Mock authenticate/admin success
  authenticate: vi.fn((req, res, next) => next()),
}));
const app = express();
app.use(express.json());
app.use('/admin/global-settings', globalSettingsRoutes);
describe('Global Settings Routes', () => {
  describe('GET /admin/global-settings', () => {
    it('should return global settings', async () => {
      const mockSettings = { id: 1, allow_user_ai_config: false };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      globalSettingsRepository.getGlobalSettings.mockResolvedValue(
        mockSettings
      );
      const res = await request(app).get('/admin/global-settings');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockSettings);
      expect(globalSettingsRepository.getGlobalSettings).toHaveBeenCalled();
    });
    it('should handle repository errors', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      globalSettingsRepository.getGlobalSettings.mockRejectedValue(
        new Error('DB Error')
      );
      const res = await request(app).get('/admin/global-settings');
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        message: 'Error retrieving global auth settings',
      });
    });
  });
  describe('PUT /admin/global-settings', () => {
    it('should update and return global settings', async () => {
      const inputSettings = { allow_user_ai_config: true };
      const savedSettings = { id: 1, allow_user_ai_config: true };
      vi.mocked(saveGlobalSettingsWithOpenFoodFactsSync).mockResolvedValue(
        savedSettings
      );
      const res = await request(app)
        .put('/admin/global-settings')
        .send(inputSettings);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(savedSettings);
      expect(saveGlobalSettingsWithOpenFoodFactsSync).toHaveBeenCalledWith(
        inputSettings
      );
    });
    it('should handle repository errors during save', async () => {
      vi.mocked(saveGlobalSettingsWithOpenFoodFactsSync).mockRejectedValue(
        new Error('Update failed')
      );
      const res = await request(app).put('/admin/global-settings').send({});
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        message: 'Error updating global auth settings',
      });
    });
  });
  describe('GET /admin/global-settings/openfoodfacts-contributions/status', () => {
    it('returns aggregate automatic contribution status to an admin', async () => {
      vi.mocked(getOpenFoodFactsAdminSyncStatus).mockResolvedValue({
        enabled: true,
        status: { pending: 1, processing: 0, failed: 2, succeeded: 3 },
        recentFailures: [],
      });

      const res = await request(app).get(
        '/admin/global-settings/openfoodfacts-contributions/status'
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.status.failed).toBe(2);
    });
  });
  describe('GET /admin/global-settings/allow-user-ai-config', () => {
    it('should return user AI config permission', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      globalSettingsRepository.isUserAiConfigAllowed.mockResolvedValue(true);
      const res = await request(app).get(
        '/admin/global-settings/allow-user-ai-config'
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ allow_user_ai_config: true });
    });
    it('should handle errors', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      globalSettingsRepository.isUserAiConfigAllowed.mockRejectedValue(
        new Error('Check failed')
      );
      const res = await request(app).get(
        '/admin/global-settings/allow-user-ai-config'
      );
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        message: 'Error checking user AI config permission',
      });
    });
  });
});
