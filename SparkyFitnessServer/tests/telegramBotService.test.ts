const telegramBotService = require('../integrations/telegram/telegramBotService');
import { log } from '../config/logging';
import globalSettingsRepository from '../models/globalSettingsRepository';
import poolManager from '../db/poolManager';

jest.mock('../models/globalSettingsRepository');
jest.mock('../db/poolManager');
jest.mock('../services/chatService');
jest.mock('../models/chatRepository');
jest.mock('../models/exerciseEntry');
jest.mock('node-telegram-bot-api');
jest.mock('../config/logging', () => ({
  log: jest.fn(),
}));

describe('TelegramBotService', () => {
  const mockChatId = 123456789;
  const mockUserId = 'user-uuid';
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (poolManager.getSystemClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('findUserAndLanguageByChatId', () => {
    it('should return user info if found in database', async () => {
      const mockUser = { id: mockUserId, name: 'Test User', language: 'en', telegram_chat_id: String(mockChatId) };
      mockClient.query.mockResolvedValue({ rows: [mockUser] });

      // Accessing private method for testing
      const result = await (telegramBotService as any).findUserAndLanguageByChatId(mockChatId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, language, telegram_chat_id'),
        [String(mockChatId)]
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await (telegramBotService as any).findUserAndLanguageByChatId(mockChatId);

      expect(result).toBeNull();
    });
  });

  describe('getTranslations', () => {
    it('should return English translations by default', () => {
      const t = (telegramBotService as any).getTranslations('en');
      expect(t.greeting).toBeDefined();
    });

    it('should return Ukrainian translations for "uk"', () => {
      const t = (telegramBotService as any).getTranslations('uk');
      expect(t.greeting).toBe('Привіт');
    });

    it('should fallback to English for unknown language', () => {
      const t = (telegramBotService as any).getTranslations('fr');
      expect(t.greeting).toBe('Hello');
    });
  });

  describe('handleLink', () => {
    it('should link user account when valid code is provided', async () => {
      const mockCode = 'ABCDEF';
      const mockUser = { id: mockUserId, name: 'Test User', language: 'en' };
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // First query (find user)
        .mockResolvedValueOnce({}); // Second query (update user)

      // Mock bot.sendMessage
      (telegramBotService as any).bot = { sendMessage: jest.fn() };
      (telegramBotService as any).getMainMenuKeyboard = jest.fn().mockReturnValue({});

      await telegramBotService.handleLink(mockChatId, mockCode);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, language FROM public."user"'),
        [mockCode]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public."user" SET telegram_chat_id'),
        [String(mockChatId), mockUserId]
      );
      expect((telegramBotService as any).bot.sendMessage).toHaveBeenCalledWith(
        mockChatId,
        expect.stringContaining('Success'),
        expect.any(Object)
      );
    });

    it('should send error message for invalid code', async () => {
        const mockCode = 'INVALID';
        mockClient.query.mockResolvedValue({ rows: [] });
  
        (telegramBotService as any).bot = { sendMessage: jest.fn() };
  
        await telegramBotService.handleLink(mockChatId, mockCode);
  
        expect((telegramBotService as any).bot.sendMessage).toHaveBeenCalledWith(
          mockChatId,
          expect.stringContaining('Invalid linking code')
        );
      });
  });
});
