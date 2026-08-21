import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { vi, describe, expect, it } from 'vitest';
import { buildChatProviderOptions } from '../services/chatService.js';

// Loading the real foodEntryService (pulled in transitively via the chatbot
// tool registry) trips on a deep '@workspace/shared' subpath import; this pure
// helper never touches it.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

interface RecordedOpenAiRequest {
  messages?: Array<{ role?: string; content?: unknown }>;
  stream?: boolean;
}

function createRecordingFetch(requests: RecordedOpenAiRequest[]): typeof fetch {
  return async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as RecordedOpenAiRequest;
    requests.push(request);

    if (request.stream) {
      const chunk = {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'gpt-5.6-sol',
        choices: [
          { index: 0, delta: { content: 'ok' }, finish_reason: 'stop' },
        ],
      };
      return new Response(
        `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } }
      );
    }

    return Response.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-5.6-sol',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };
}

function expectSystemMessage(request: RecordedOpenAiRequest) {
  expect(request.messages?.[0]).toEqual({
    role: 'system',
    content: 'Keep this as a system message.',
  });
}

describe('buildChatProviderOptions', () => {
  // Provider-gating: only the canonical 'openai' service type gets the
  // openai-namespaced prompt_cache_* options. OpenAI-compatible services share
  // the namespace but receive only adapter-level compatibility options.
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

  // gpt-5.6 deprecated `prompt_cache_retention` in favor of
  // `prompt_cache_options.ttl`, and the adapter forwards the field ungated, so
  // sending it to 5.6+ risks a rejected chat turn. Omitting it only costs cache
  // hits, so newer models must stay off the list until they're known to take it.
  it.each([
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-5.9',
    'gpt-5',
    'gpt-5.0',
    'gpt-4o',
    'gpt-4o-mini',
  ])('withholds 24h retention from %s', (model) => {
    expect(buildChatProviderOptions('openai', 'user-1', model)).toEqual({
      openai: { promptCacheKey: 'sparky-chat-user-1' },
    });
  });

  it('keeps system instructions as the system role for OpenAI-compatible backends', () => {
    expect(
      buildChatProviderOptions('openai_compatible', 'user-1', 'gpt-5.6-sol')
    ).toEqual({
      openai: { systemMessageMode: 'system' },
    });
  });

  it('returns undefined for unrelated non-openai service types', () => {
    for (const serviceType of [
      'anthropic',
      'google',
      'groq',
      'mistral',
      'openrouter',
      'ollama',
      'custom',
    ]) {
      expect(
        buildChatProviderOptions(serviceType, 'user-1', 'gpt-4o-mini'),
        serviceType
      ).toBeUndefined();
    }
  });
});

describe('OpenAI-compatible system role requests', () => {
  it('serializes the blocking system prompt with role system', async () => {
    const requests: RecordedOpenAiRequest[] = [];
    const model = createOpenAI({
      apiKey: 'test-key',
      baseURL: 'https://openai-compatible.test/v1',
      fetch: createRecordingFetch(requests),
    }).chat('gpt-5.6-sol');

    await generateText({
      model,
      system: 'Keep this as a system message.',
      prompt: 'Hello',
      providerOptions: buildChatProviderOptions(
        'openai_compatible',
        'user-1',
        'gpt-5.6-sol'
      ),
    });

    expect(requests).toHaveLength(1);
    expectSystemMessage(requests[0]);
  });

  it('serializes the streaming system prompt with role system', async () => {
    const requests: RecordedOpenAiRequest[] = [];
    const model = createOpenAI({
      apiKey: 'test-key',
      baseURL: 'https://openai-compatible.test/v1',
      fetch: createRecordingFetch(requests),
    }).chat('gpt-5.6-sol');

    const result = streamText({
      model,
      system: 'Keep this as a system message.',
      prompt: 'Hello',
      providerOptions: buildChatProviderOptions(
        'openai_compatible',
        'user-1',
        'gpt-5.6-sol'
      ),
    });
    await result.text;

    expect(requests).toHaveLength(1);
    expectSystemMessage(requests[0]);
  });
});
