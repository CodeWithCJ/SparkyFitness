import { vi, describe, expect, it } from 'vitest';
import { buildChatProviderOptions } from '../services/chatService.js';

// Loading the real foodEntryService (pulled in transitively via the chatbot
// tool registry) trips on a deep '@workspace/shared' subpath import; this pure
// helper never touches it.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

describe('buildChatProviderOptions', () => {
  // Provider-gating: only the canonical 'openai' service type gets the
  // openai-namespaced prompt_cache_* options. The OpenAI-compatible types share
  // the `openai` namespace via createOpenAI(), so leaking these to them could
  // send prompt_cache_key to backends that reject it.
  it('sets a per-user promptCacheKey for openai without retention on the default model', () => {
    expect(buildChatProviderOptions('openai', 'user-1', 'gpt-4o-mini')).toEqual(
      {
        openai: { promptCacheKey: 'sparky-chat-user-1' },
      }
    );
  });

  // Model-gating: 24h retention is only forwarded for the gpt-5.1+ families,
  // mirroring @ai-sdk/openai's own family check; sending it on gpt-4o-mini risks
  // a 400.
  it('adds 24h retention for the gpt-5.1 family', () => {
    expect(buildChatProviderOptions('openai', 'user-1', 'gpt-5.1')).toEqual({
      openai: {
        promptCacheKey: 'sparky-chat-user-1',
        promptCacheRetention: '24h',
      },
    });
  });

  it('adds 24h retention for a dated gpt-5.5 model id', () => {
    expect(
      buildChatProviderOptions('openai', 'user-1', 'gpt-5.5-2026-04-23')
    ).toEqual({
      openai: {
        promptCacheKey: 'sparky-chat-user-1',
        promptCacheRetention: '24h',
      },
    });
  });

  it('returns undefined for every non-openai service type', () => {
    for (const serviceType of [
      'anthropic',
      'google',
      'groq',
      'mistral',
      'openrouter',
      'ollama',
      'openai_compatible',
      'custom',
    ]) {
      expect(
        buildChatProviderOptions(serviceType, 'user-1', 'gpt-4o-mini'),
        serviceType
      ).toBeUndefined();
    }
  });
});
