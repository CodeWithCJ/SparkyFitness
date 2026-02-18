const chatService = require('../services/chatService');
const chatRepository = require('../models/chatRepository');
const userRepository = require('../models/userRepository');
const measurementRepository = require('../models/measurementRepository');
const { log } = require('../config/logging');

// Mock dependencies
jest.mock('../models/chatRepository');
jest.mock('../models/userRepository');
jest.mock('../models/measurementRepository');
jest.mock('../config/logging', () => ({
    log: jest.fn(),
}));

describe('chatService', () => {
    const mockUserId = 'user-123';
    const mockTargetUserId = 'user-456';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleAiServiceSettings', () => {
        it('should save AI service settings', async () => {
            const serviceData = { service_type: 'openai', api_key: 'sk-...' };
            const savedSetting = { id: 'setting-1', ...serviceData };

            chatRepository.upsertAiServiceSetting.mockResolvedValue(savedSetting);

            const result = await chatService.handleAiServiceSettings('save_ai_service_settings', serviceData, mockUserId);

            expect(chatRepository.upsertAiServiceSetting).toHaveBeenCalledWith({ ...serviceData, user_id: mockUserId });
            expect(result).toEqual({ message: 'AI service settings saved successfully.', setting: savedSetting });
        });

        it('should throw error for unsupported action', async () => {
            await expect(chatService.handleAiServiceSettings('unknown_action', {}, mockUserId))
                .rejects.toThrow('Unsupported action for AI service settings.');
        });
    });

    describe('getAiServiceSettings', () => {
        it('should return settings for a user', async () => {
            const mockSettings = [{ id: 'setting-1', service_type: 'openai' }];
            chatRepository.getAiServiceSettingsByUserId.mockResolvedValue(mockSettings);

            const result = await chatService.getAiServiceSettings(mockUserId, mockTargetUserId);

            expect(chatRepository.getAiServiceSettingsByUserId).toHaveBeenCalledWith(mockTargetUserId);
            expect(result).toEqual(mockSettings);
        });

        it('should return empty array on error', async () => {
            chatRepository.getAiServiceSettingsByUserId.mockRejectedValue(new Error('DB Error'));

            const result = await chatService.getAiServiceSettings(mockUserId, mockTargetUserId);

            expect(result).toEqual([]);
            expect(log).toHaveBeenCalledWith('error', expect.stringContaining('Error fetching AI'), expect.any(Error));
        });
    });

    describe('getActiveAiServiceSetting', () => {
        it('should return active setting', async () => {
            const mockSetting = { id: 'setting-1', source: 'user' };
            chatRepository.getActiveAiServiceSetting.mockResolvedValue(mockSetting);

            const result = await chatService.getActiveAiServiceSetting(mockUserId, mockTargetUserId);

            expect(chatRepository.getActiveAiServiceSetting).toHaveBeenCalledWith(mockTargetUserId);
            expect(result).toEqual(mockSetting);
        });

        it('should return null on error', async () => {
            chatRepository.getActiveAiServiceSetting.mockRejectedValue(new Error('DB Error'));

            const result = await chatService.getActiveAiServiceSetting(mockUserId, mockTargetUserId);

            expect(result).toBeNull();
        });
    });

    describe('deleteAiServiceSetting', () => {
        it('should delete setting if owned by user', async () => {
            const settingId = 'setting-1';
            chatRepository.getAiServiceSettingById.mockResolvedValue({ id: settingId, user_id: mockUserId });
            chatRepository.deleteAiServiceSetting.mockResolvedValue(true);

            const result = await chatService.deleteAiServiceSetting(mockUserId, settingId);

            expect(chatRepository.getAiServiceSettingById).toHaveBeenCalledWith(settingId, mockUserId);
            expect(chatRepository.deleteAiServiceSetting).toHaveBeenCalledWith(settingId, mockUserId);
            expect(result).toEqual({ message: 'AI service setting deleted successfully.' });
        });

        it('should throw error if setting not found', async () => {
            chatRepository.getAiServiceSettingById.mockResolvedValue(null);

            await expect(chatService.deleteAiServiceSetting(mockUserId, 'setting-1'))
                .rejects.toThrow('AI service setting not found.');

            expect(chatRepository.deleteAiServiceSetting).not.toHaveBeenCalled();
        });
    });

    describe('clearOldChatHistory', () => {
        it('should clear old chat history', async () => {
            chatRepository.clearOldChatHistory.mockResolvedValue();

            await chatService.clearOldChatHistory(mockUserId);

            expect(chatRepository.clearOldChatHistory).toHaveBeenCalledWith(mockUserId);
        });
    });

    describe('Chat History Operations', () => {
        const historyId = 'hist-1';

        it('should get chat history by user', async () => {
            const mockHistory = [{ id: historyId, message: 'hi' }];
            chatRepository.getChatHistoryByUserId.mockResolvedValue(mockHistory);

            const result = await chatService.getSparkyChatHistory(mockUserId, mockTargetUserId);
            expect(result).toEqual(mockHistory);
        });

        it('should get chat history entry by id', async () => {
            chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
            const mockEntry = { id: historyId, message: 'hi' };
            chatRepository.getChatHistoryEntryById.mockResolvedValue(mockEntry);

            const result = await chatService.getSparkyChatHistoryEntry(mockUserId, historyId);
            expect(result).toEqual(mockEntry);
        });

        it('should update chat history entry', async () => {
            chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
            const updateData = { message: 'hello' };
            const updatedEntry = { id: historyId, ...updateData };
            chatRepository.updateChatHistoryEntry.mockResolvedValue(updatedEntry);

            const result = await chatService.updateSparkyChatHistoryEntry(mockUserId, historyId, updateData);
            expect(result).toEqual(updatedEntry);
        });

        it('should delete chat history entry', async () => {
            chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
            chatRepository.deleteChatHistoryEntry.mockResolvedValue(true);

            const result = await chatService.deleteSparkyChatHistoryEntry(mockUserId, historyId);
            expect(result).toEqual({ message: 'Chat history entry deleted successfully.' });
        });

        it('should save chat history', async () => {
            const historyData = { message: 'new message' };
            chatRepository.saveChatHistory.mockResolvedValue();

            const result = await chatService.saveSparkyChatHistory(mockUserId, historyData);
            expect(chatRepository.saveChatHistory).toHaveBeenCalledWith({ ...historyData, user_id: mockUserId });
            expect(result).toEqual({ message: 'Chat history saved successfully.' });
        });
    });
});
