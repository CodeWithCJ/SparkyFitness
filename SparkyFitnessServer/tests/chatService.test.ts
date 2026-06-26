import { vi, beforeEach, describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { simulateReadableStream } from 'ai';
import type { UIMessageChunk } from 'ai';
import chatService, { mapUsageToMetadata } from '../services/chatService.js';
import chatRepository from '../models/chatRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryService from '../services/foodEntryService.js';
import { log } from '../config/logging.js';
// Mock dependencies
vi.mock('../models/chatRepository');
vi.mock('../models/userRepository');
vi.mock('../models/measurementRepository');
vi.mock('../models/preferenceRepository', () => ({
  default: {
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));
// Loading the real foodEntryService trips on a deep '@workspace/shared'
// subpath import under vitest; the stub doubles as the log_food seam.
vi.mock('../services/foodEntryService', () => ({
  default: {
    createFoodEntry: vi.fn(),
  },
}));
vi.mock('../models/foodRepository', () => ({
  default: {
    getFoodsWithPagination: vi.fn(),
    countFoods: vi.fn(),
    getFoodById: vi.fn(),
  },
}));
vi.mock('../services/preferenceService', () => ({
  default: {
    getUserPreferences: vi.fn(),
  },
}));

// processChatMessage builds its model from DB config via createOpenAI();
// route the provider to a per-test scripted MockLanguageModelV3.
const mockModelHolder = vi.hoisted(() => ({
  current: undefined as unknown,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() =>
    Object.assign(() => mockModelHolder.current, {
      chat: () => mockModelHolder.current,
    })
  ),
}));
describe('chatService', () => {
  const mockUserId = 'user-123';
  const mockTargetUserId = 'user-456';
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('handleAiServiceSettings', () => {
    it('should save AI service settings', async () => {
      const serviceData = { service_type: 'openai', api_key: 'sk-...' };
      const savedSetting = { id: 'setting-1', ...serviceData };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.upsertAiServiceSetting.mockResolvedValue(savedSetting);
      const result = await chatService.handleAiServiceSettings(
        'save_ai_service_settings',
        serviceData,
        mockUserId
      );
      expect(chatRepository.upsertAiServiceSetting).toHaveBeenCalledWith({
        ...serviceData,
        user_id: mockUserId,
      });
      expect(result).toEqual({
        message: 'AI service settings saved successfully.',
        setting: savedSetting,
      });
    });
    it('should throw error for unsupported action', async () => {
      await expect(
        chatService.handleAiServiceSettings('unknown_action', {}, mockUserId)
      ).rejects.toThrow('Unsupported action for AI service settings.');
    });
    it('auto-selects the saved service as active when no provider is selected yet', async () => {
      const serviceData = { service_type: 'openai', is_active: true };
      const savedSetting = { id: 'setting-1', ...serviceData };
      vi.mocked(chatRepository.upsertAiServiceSetting).mockResolvedValue(
        savedSetting
      );
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        active_ai_service_id: null,
      });

      await chatService.handleAiServiceSettings(
        'save_ai_service_settings',
        serviceData,
        mockUserId
      );

      expect(preferenceRepository.updateUserPreferences).toHaveBeenCalledWith(
        mockUserId,
        { active_ai_service_id: 'setting-1' }
      );
    });
    it('preserves an existing active selection when another service is enabled', async () => {
      const serviceData = { service_type: 'anthropic', is_active: true };
      const savedSetting = { id: 'setting-2', ...serviceData };
      vi.mocked(chatRepository.upsertAiServiceSetting).mockResolvedValue(
        savedSetting
      );
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        active_ai_service_id: 'setting-1',
      });

      await chatService.handleAiServiceSettings(
        'save_ai_service_settings',
        serviceData,
        mockUserId
      );

      // Enabling a second service must not hijack the existing selection.
      expect(preferenceRepository.updateUserPreferences).not.toHaveBeenCalled();
    });
    it('clears the active pointer when the currently-active service is disabled', async () => {
      const serviceData = { service_type: 'openai', is_active: false };
      const savedSetting = { id: 'setting-1', ...serviceData };
      vi.mocked(chatRepository.upsertAiServiceSetting).mockResolvedValue(
        savedSetting
      );
      vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
        active_ai_service_id: 'setting-1',
      });

      await chatService.handleAiServiceSettings(
        'save_ai_service_settings',
        serviceData,
        mockUserId
      );

      expect(preferenceRepository.updateUserPreferences).toHaveBeenCalledWith(
        mockUserId,
        { active_ai_service_id: null }
      );
    });
  });
  describe('getAiServiceSettings', () => {
    it('should return settings for a user', async () => {
      const mockSettings = [{ id: 'setting-1', service_type: 'openai' }];
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getAiServiceSettingsByUserId.mockResolvedValue(
        mockSettings
      );
      const result = await chatService.getAiServiceSettings(
        mockUserId,
        mockTargetUserId
      );
      expect(chatRepository.getAiServiceSettingsByUserId).toHaveBeenCalledWith(
        mockTargetUserId
      );
      expect(result).toEqual(mockSettings);
    });
    it('should return empty array on error', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getAiServiceSettingsByUserId.mockRejectedValue(
        new Error('DB Error')
      );
      const result = await chatService.getAiServiceSettings(
        mockUserId,
        mockTargetUserId
      );
      expect(result).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Error fetching AI'),
        expect.any(Error)
      );
    });
  });
  describe('getActiveAiServiceSetting', () => {
    it('should return active setting', async () => {
      const mockSetting = { id: 'setting-1', source: 'user' };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getActiveAiServiceSetting.mockResolvedValue(mockSetting);
      const result = await chatService.getActiveAiServiceSetting(
        mockUserId,
        mockTargetUserId
      );
      expect(chatRepository.getActiveAiServiceSetting).toHaveBeenCalledWith(
        mockTargetUserId
      );
      expect(result).toEqual(mockSetting);
    });
    it('should return null on error', async () => {
      // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getActiveAiServiceSetting.mockRejectedValue(
        new Error('DB Error')
      );
      const result = await chatService.getActiveAiServiceSetting(
        mockUserId,
        mockTargetUserId
      );
      expect(result).toBeNull();
    });
  });
  describe('deleteAiServiceSetting', () => {
    it('should delete setting if owned by user', async () => {
      const settingId = 'setting-1';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getAiServiceSettingById.mockResolvedValue({
        id: settingId,
        user_id: mockUserId,
      });
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.deleteAiServiceSetting.mockResolvedValue(true);
      const result = await chatService.deleteAiServiceSetting(
        mockUserId,
        settingId
      );
      expect(chatRepository.getAiServiceSettingById).toHaveBeenCalledWith(
        settingId,
        mockUserId
      );
      expect(chatRepository.deleteAiServiceSetting).toHaveBeenCalledWith(
        settingId,
        mockUserId
      );
      expect(result).toEqual({
        message: 'AI service setting deleted successfully.',
      });
    });
    it('should throw error if setting not found', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getAiServiceSettingById.mockResolvedValue(null);
      await expect(
        chatService.deleteAiServiceSetting(mockUserId, 'setting-1')
      ).rejects.toThrow('AI service setting not found.');
      expect(chatRepository.deleteAiServiceSetting).not.toHaveBeenCalled();
    });
  });
  describe('clearOldChatHistory', () => {
    it('should clear old chat history', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.clearOldChatHistory.mockResolvedValue();
      await chatService.clearOldChatHistory(mockUserId);
      expect(chatRepository.clearOldChatHistory).toHaveBeenCalledWith(
        mockUserId
      );
    });
  });
  describe('Chat History Operations', () => {
    const historyId = 'hist-1';
    it('should get chat history by user', async () => {
      const mockHistory = [{ id: historyId, message: 'hi' }];
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getChatHistoryByUserId.mockResolvedValue(mockHistory);
      const result = await chatService.getSparkyChatHistory(
        mockUserId,
        mockTargetUserId
      );
      expect(result).toEqual(mockHistory);
    });
    it('should get chat history entry by id', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
      const mockEntry = { id: historyId, message: 'hi' };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getChatHistoryEntryById.mockResolvedValue(mockEntry);
      const result = await chatService.getSparkyChatHistoryEntry(
        mockUserId,
        historyId
      );
      expect(result).toEqual(mockEntry);
    });
    it('should update chat history entry', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
      const updateData = { message: 'hello' };
      const updatedEntry = { id: historyId, ...updateData };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.updateChatHistoryEntry.mockResolvedValue(updatedEntry);
      const result = await chatService.updateSparkyChatHistoryEntry(
        mockUserId,
        historyId,
        updateData
      );
      expect(result).toEqual(updatedEntry);
    });
    it('should delete chat history entry', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.getChatHistoryEntryOwnerId.mockResolvedValue(mockUserId);
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.deleteChatHistoryEntry.mockResolvedValue(true);
      const result = await chatService.deleteSparkyChatHistoryEntry(
        mockUserId,
        historyId
      );
      expect(result).toEqual({
        message: 'Chat history entry deleted successfully.',
      });
    });
    it('should save chat history', async () => {
      const historyData = { message: 'new message' };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      chatRepository.saveChatHistory.mockResolvedValue();
      const result = await chatService.saveSparkyChatHistory(
        mockUserId,
        historyData
      );
      expect(chatRepository.saveChatHistory).toHaveBeenCalledWith({
        ...historyData,
        user_id: mockUserId,
      });
      expect(result).toEqual({ message: 'Chat history saved successfully.' });
    });
  });
  describe('processChatMessage (in-process tool integration)', () => {
    const FOOD_ID = '11111111-1111-4111-8111-111111111111';
    const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
    // History is saved under the active user; tools act as the logged-in
    // actor (the MCP path scoped tools to the session-authenticated user).
    const activeUserId = 'user-123';
    const actorUserId = 'actor-456';

    const aiServiceSetting = {
      id: 'svc-1',
      service_type: 'openai',
      api_key: 'sk-test',
      model_name: 'gpt-test',
      source: 'user',
    };

    const eggsRow = {
      id: FOOD_ID,
      name: 'Eggs',
      brand: 'Farm Fresh',
      user_id: actorUserId,
      default_variant: {
        id: VARIANT_ID,
        serving_size: 100,
        serving_unit: 'g',
        calories: 155,
        protein: 13,
        carbs: 1.1,
        fat: 11,
      },
    };

    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    };

    const toolCallStep = (input: Record<string, unknown>) => ({
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage,
      content: [
        {
          type: 'tool-call' as const,
          toolCallId: 'call-1',
          toolName: 'sparky_manage_food',
          input: JSON.stringify(input),
        },
      ],
      warnings: [],
    });

    const textStep = (text: string) => ({
      finishReason: { unified: 'stop' as const, raw: undefined },
      usage,
      content: [{ type: 'text' as const, text }],
      warnings: [],
    });

    const scriptModel = (
      steps: Array<
        ReturnType<typeof toolCallStep> | ReturnType<typeof textStep>
      >
    ) => {
      const queue = [...steps];
      const model = new MockLanguageModelV3({
        doGenerate: async () => {
          const step = queue.shift();
          if (!step) {
            throw new Error('MockLanguageModelV3: no scripted step left.');
          }
          return step;
        },
      });
      mockModelHolder.current = model;
      return model;
    };

    beforeEach(() => {
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        aiServiceSetting
      );
      vi.mocked(chatRepository.saveChatHistory).mockResolvedValue(true);
      vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue(
        []
      );
    });

    it('executes a log_food tool call in-process, derives food_added from call input, and saves history', async () => {
      vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
        eggsRow,
      ]);
      vi.mocked(foodEntryService.createFoodEntry).mockResolvedValue({
        id: 'entry-1',
        food_name: 'Eggs',
      });
      const logFoodArgs = {
        action: 'log_food',
        food_name: 'Eggs',
        quantity: 2,
        unit: 'serving',
        meal_type: 'breakfast',
        entry_date: '2026-06-10',
      };
      scriptModel([
        toolCallStep(logFoodArgs),
        textStep('Logged 2 eggs for breakfast!'),
      ]);

      const result = await chatService.processChatMessage(
        [{ role: 'user', content: 'log 2 eggs for breakfast' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(result.content).toBe('Logged 2 eggs for breakfast!');
      expect(result.action).toBe('food_added');
      expect(result.executedTools).toEqual([
        { name: 'sparky_manage_food', args: logFoodArgs },
      ]);
      // Tool handlers act as the authenticated user, not the active user.
      expect(foodEntryService.createFoodEntry).toHaveBeenCalledWith(
        actorUserId,
        actorUserId,
        {
          user_id: actorUserId,
          food_id: FOOD_ID,
          variant_id: VARIANT_ID,
          entry_date: '2026-06-10',
          quantity: 2,
          unit: 'serving',
          meal_type: 'breakfast',
        }
      );
      expect(chatRepository.saveChatHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: activeUserId,
          messageType: 'user',
          content: 'log 2 eggs for breakfast',
        })
      );
      expect(chatRepository.saveChatHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: activeUserId,
          messageType: 'assistant',
          content: 'Logged 2 eggs for breakfast!',
        })
      );
    });

    it('completes with an ERRORS string as the tool result when a backing service throws', async () => {
      vi.mocked(foodRepository.getFoodsWithPagination).mockRejectedValue(
        new Error('connection refused')
      );
      const model = scriptModel([
        toolCallStep({
          action: 'search_food',
          food_name: 'egg',
          search_type: 'broad',
        }),
        textStep('Sorry, I could not search foods right now.'),
      ]);

      const result = await chatService.processChatMessage(
        [{ role: 'user', content: 'find eggs' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(result.content).toBe('Sorry, I could not search foods right now.');
      expect(result.action).toBe('advice');
      expect(result.executedTools).toEqual([
        {
          name: 'sparky_manage_food',
          args: {
            action: 'search_food',
            food_name: 'egg',
            search_type: 'broad',
          },
        },
      ]);
      // The handler never throws; the ERRORS string reaches the model as the
      // tool result on the follow-up generation step.
      expect(model.doGenerateCalls).toHaveLength(2);
      expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain(
        'Error [DB_ERROR]: A database error occurred.'
      );
    });

    it('forwards a per-user OpenAI prompt cache key into the blocking model call', async () => {
      // The pure builder is unit-tested separately; this guards that the
      // blocking call site actually wires providerOptions into generateText.
      const model = scriptModel([textStep('Hi there!')]);

      await chatService.processChatMessage(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(
        model.doGenerateCalls[0].providerOptions?.openai?.promptCacheKey
      ).toBe(`sparky-chat-${actorUserId}`);
    });

    it('ships the trimmed core tool set when an Ollama service opts into the core profile', async () => {
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        {
          ...aiServiceSetting,
          service_type: 'ollama',
          chat_tool_profile: 'core',
        }
      );
      scriptModel([textStep('Hi there!')]);

      await chatService.processChatMessage(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(log).toHaveBeenCalledWith(
        'info',
        expect.stringMatching(/Loaded 18 core tools/)
      );
    });

    it('ships the full tool set for an Ollama service left on the full profile', async () => {
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        {
          ...aiServiceSetting,
          service_type: 'ollama',
          chat_tool_profile: 'full',
        }
      );
      scriptModel([textStep('Hi there!')]);

      await chatService.processChatMessage(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(log).toHaveBeenCalledWith(
        'info',
        expect.stringMatching(/Loaded 35 full tools/)
      );
    });

    it('defaults to the full tool set when an Ollama service has no stored profile', async () => {
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        {
          ...aiServiceSetting,
          service_type: 'ollama',
        }
      );
      scriptModel([textStep('Hi there!')]);

      await chatService.processChatMessage(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(log).toHaveBeenCalledWith(
        'info',
        expect.stringMatching(/Loaded 35 full tools/)
      );
    });

    it('never trims a non-Ollama service even with a stale core profile stored', async () => {
      // The profile gate keys on service_type, so a service that was Ollama+core
      // and later switched to OpenAI still loads the full 35-tool surface.
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        {
          ...aiServiceSetting,
          service_type: 'openai',
          chat_tool_profile: 'core',
        }
      );
      scriptModel([textStep('Hi there!')]);

      await chatService.processChatMessage(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );

      expect(log).toHaveBeenCalledWith(
        'info',
        expect.stringMatching(/Loaded 35 full tools/)
      );
    });
  });

  describe('processChatMessageStream (empty completion handling)', () => {
    const activeUserId = 'user-123';
    const actorUserId = 'actor-456';

    const aiServiceSetting = {
      id: 'svc-1',
      service_type: 'openai',
      api_key: 'sk-test',
      model_name: 'gpt-test',
      source: 'user',
    };

    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    };

    const streamModel = (parts: unknown[]) => {
      const model = new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: parts as never[],
          }),
        }),
      });
      mockModelHolder.current = model;
      return model;
    };

    const drainStream = async (stream: ReadableStream<UIMessageChunk>) => {
      const chunks: UIMessageChunk[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return chunks;
    };

    beforeEach(() => {
      vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue(
        aiServiceSetting
      );
      vi.mocked(chatRepository.saveChatHistory).mockResolvedValue(true);
      vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue(
        []
      );
    });

    it('injects an error chunk and skips the assistant save when the model errors out with an empty completion', async () => {
      // Gemini's MALFORMED_FUNCTION_CALL surfaces as finishReason 'error' with
      // no content instead of a thrown error.
      streamModel([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'error', raw: 'MALFORMED_FUNCTION_CALL' },
          usage,
        },
      ]);

      const { stream } = await chatService.processChatMessageStream(
        [{ role: 'user', content: 'Show my goal timeline' }],
        'svc-1',
        activeUserId,
        actorUserId
      );
      const chunks = await drainStream(stream);

      expect(chunks).toContainEqual({
        type: 'error',
        errorText:
          'The AI service returned an empty response. Please try again.',
      });

      await vi.waitFor(() =>
        expect(log).toHaveBeenCalledWith(
          'warn',
          expect.stringContaining('Skipping empty assistant chat history')
        )
      );
      expect(chatRepository.saveChatHistory).toHaveBeenCalledTimes(1);
      expect(chatRepository.saveChatHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: activeUserId,
          messageType: 'user',
          content: 'Show my goal timeline',
        })
      );
    });

    it('injects an error chunk when the stream finishes without any content even on a normal stop', async () => {
      streamModel([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]);

      const { stream } = await chatService.processChatMessageStream(
        [{ role: 'user', content: 'Show my goal timeline' }],
        'svc-1',
        activeUserId,
        actorUserId
      );
      const chunks = await drainStream(stream);

      expect(chunks).toContainEqual({
        type: 'error',
        errorText:
          'The AI service returned an empty response. Please try again.',
      });
    });

    it('passes a normal completion through untouched and saves both history rows', async () => {
      streamModel([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Here is your timeline.' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]);

      const { stream } = await chatService.processChatMessageStream(
        [{ role: 'user', content: 'Show my goal timeline' }],
        'svc-1',
        activeUserId,
        actorUserId
      );
      const chunks = await drainStream(stream);

      expect(chunks.some((chunk) => chunk.type === 'error')).toBe(false);
      expect(chunks).toContainEqual(
        expect.objectContaining({
          type: 'text-delta',
          delta: 'Here is your timeline.',
        })
      );

      await vi.waitFor(() =>
        expect(chatRepository.saveChatHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            messageType: 'assistant',
            content: 'Here is your timeline.',
          })
        )
      );
      expect(chatRepository.saveChatHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'user',
          content: 'Show my goal timeline',
        })
      );
    });

    it('attaches token usage including cached input to the streamed finish metadata', async () => {
      // Proves the mapper, toUIMessageStream({ messageMetadata }), and
      // withEmptyCompletionGuard all cooperate to land usage on the finish chunk
      // the chat UI reads. cacheRead must survive as cachedInputTokens.
      streamModel([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Here is your timeline.' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: {
              total: 1240,
              noCache: 260,
              cacheRead: 980,
              cacheWrite: 0,
            },
            outputTokens: { total: 380, text: 380, reasoning: 0 },
          },
        },
      ]);

      const { stream } = await chatService.processChatMessageStream(
        [{ role: 'user', content: 'Show my goal timeline' }],
        'svc-1',
        activeUserId,
        actorUserId
      );
      const chunks = await drainStream(stream);

      const finishChunk = chunks.find((chunk) => chunk.type === 'finish');
      expect(
        (finishChunk as { messageMetadata?: unknown }).messageMetadata
      ).toEqual({
        custom: {
          usage: {
            inputTokens: 1240,
            outputTokens: 380,
            totalTokens: 1620,
            cachedInputTokens: 980,
          },
        },
      });
    });

    it('forwards a per-user OpenAI prompt cache key into the streaming model call', async () => {
      // Mirrors the blocking-path guard: the streaming call site must also wire
      // providerOptions into streamText (the two paths diverge subtly).
      const model = streamModel([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Hi!' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]);

      const { stream } = await chatService.processChatMessageStream(
        [{ role: 'user', content: 'hello' }],
        'svc-1',
        activeUserId,
        actorUserId
      );
      await drainStream(stream);

      expect(
        model.doStreamCalls[0].providerOptions?.openai?.promptCacheKey
      ).toBe(`sparky-chat-${actorUserId}`);
    });

    it('strips images from earlier turns but keeps the current-turn image', async () => {
      // Vision images are large and otherwise re-sent inside the window on every
      // turn; only the latest user turn needs to carry the image, earlier turns
      // keep just their text (the assistant reply already captured the analysis).
      const model = streamModel([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'ok' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]);

      const pngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

      const { stream } = await chatService.processChatMessageStream(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this food?' },
              { type: 'image', image: pngDataUrl },
            ],
          },
          { role: 'assistant', content: 'That looks like an apple.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'And this one?' },
              { type: 'image', image: pngDataUrl },
            ],
          },
        ],
        'svc-1',
        activeUserId,
        actorUserId
      );
      await drainStream(stream);

      const prompt = model.doStreamCalls[0].prompt;
      const userMessages = prompt.filter((m) => m.role === 'user');
      const nonTextParts = (content: unknown) =>
        Array.isArray(content)
          ? content.filter((p) => (p as { type: string }).type !== 'text')
          : [];
      const textParts = (content: unknown) =>
        Array.isArray(content)
          ? content.filter((p) => (p as { type: string }).type === 'text')
          : [];

      expect(userMessages).toHaveLength(2);
      // Earlier turn: image dropped, text retained.
      expect(nonTextParts(userMessages[0].content)).toHaveLength(0);
      expect(textParts(userMessages[0].content).length).toBeGreaterThan(0);
      // Current turn: image preserved for live vision analysis.
      expect(nonTextParts(userMessages[1].content)).toHaveLength(1);
    });

    it('trims old history to a token budget but always keeps the current turn', async () => {
      const model = streamModel([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'ok' },
        { type: 'text-end', id: 't1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]);

      // Each filler message is ~2K estimated tokens; several of them blow past
      // the 6K budget so the oldest must be dropped, while the short final user
      // turn is always retained.
      const filler = 'a'.repeat(8000);
      const { stream } = await chatService.processChatMessageStream(
        [
          { role: 'user', content: `OLDEST ${filler}` },
          { role: 'assistant', content: filler },
          { role: 'user', content: filler },
          { role: 'assistant', content: filler },
          { role: 'user', content: 'CURRENT what is my total?' },
        ],
        'svc-1',
        activeUserId,
        actorUserId
      );
      await drainStream(stream);

      const prompt = model.doStreamCalls[0].prompt;
      const convoMessages = prompt.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      );
      const allText = convoMessages
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .map((p) => (p as { text?: string }).text ?? '')
        .join(' ');

      // Oldest turn evicted by the budget; current question always survives.
      expect(convoMessages.length).toBeLessThan(5);
      expect(allText).not.toContain('OLDEST');
      expect(allText).toContain('CURRENT what is my total?');
    });
  });

  describe('mapUsageToMetadata', () => {
    it('nests usage under custom and maps cacheReadTokens to cachedInputTokens', () => {
      // `custom` is the metadata key assistant-ui's fromThreadMessageLike
      // preserves; a bare top-level `usage` would be stripped before reaching
      // the thread message.
      expect(
        mapUsageToMetadata({
          inputTokens: 1240,
          outputTokens: 380,
          totalTokens: 1620,
          inputTokenDetails: {
            noCacheTokens: 260,
            cacheReadTokens: 980,
            cacheWriteTokens: 0,
          },
        } as never)
      ).toEqual({
        custom: {
          usage: {
            inputTokens: 1240,
            outputTokens: 380,
            totalTokens: 1620,
            cachedInputTokens: 980,
          },
        },
      });
    });

    it('leaves missing fields undefined for the adapter to drop', () => {
      // Providers reporting no cache details: cachedInputTokens must be
      // undefined (not 0) so the adapter's normalizeUsage omits it.
      expect(
        mapUsageToMetadata({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        } as never).custom.usage
      ).toEqual({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: undefined,
      });
    });
  });
});
