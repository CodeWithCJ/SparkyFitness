import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import { vi, describe, expect, it } from 'vitest';
import {
  buildChatProviderOptions,
  buildChatSystem,
  createChatModelInstance,
} from '../services/chatService.js';

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
  it.each(['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol'])(
    'uses supported reasoning and cache fields for %s',
    (model) => {
      expect(
        buildChatProviderOptions('openai', 'user-1', model, 'high')
      ).toEqual({
        openai: {
          promptCacheKey: 'sparky-chat-user-1',
          reasoningEffort: 'high',
          promptCacheOptions: { ttl: '30m' },
          store: false,
        },
      });
    }
  );
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

  it('turns on Anthropic automatic caching', () => {
    expect(
      buildChatProviderOptions('anthropic', 'user-1', 'claude-sonnet-5')
    ).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } });
  });

  it('returns undefined for unrelated non-openai service types', () => {
    for (const serviceType of [
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

describe('Anthropic prompt caching', () => {
  it('marks the system prompt and the request for caching', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const model = createAnthropic({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      },
    })('claude-sonnet-5');

    await generateText({
      model,
      system: buildChatSystem('anthropic', 'Sparky system prompt'),
      prompt: 'Hello',
      providerOptions: buildChatProviderOptions(
        'anthropic',
        'user-1',
        'claude-sonnet-5'
      ),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].system).toEqual([
      {
        type: 'text',
        text: 'Sparky system prompt',
        cache_control: { type: 'ephemeral' },
      },
    ]);
    expect(requests[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('leaves the system prompt a plain string for other providers', () => {
    expect(buildChatSystem('openai', 'Sparky system prompt')).toBe(
      'Sparky system prompt'
    );
  });
});

describe('OpenRouter prompt caching', () => {
  const policy = { allowPrivateNetwork: true, reason: 'admin' } as const;

  async function captureRequest(
    service: { service_type: string; custom_url?: string },
    modelName: string
  ) {
    const requests: Array<Record<string, unknown>> = [];
    const recording = createRecordingFetch(requests as RecordedOpenAiRequest[]);
    vi.stubGlobal('fetch', recording);
    try {
      const model = createChatModelInstance(
        { ...service, api_key: 'test-key' },
        modelName,
        policy
      );
      await generateText({
        model,
        system: 'Sparky system prompt',
        prompt: 'Hello',
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(requests).toHaveLength(1);
    return requests[0];
  }

  const cachedSystem = [
    {
      type: 'text',
      text: 'Sparky system prompt',
      cache_control: { type: 'ephemeral' },
    },
  ];

  it('marks Claude requests on OpenRouter for caching', async () => {
    const body = await captureRequest(
      { service_type: 'openrouter' },
      'anthropic/claude-sonnet-5'
    );
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages).toEqual([
      { role: 'system', content: cachedSystem },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('marks Claude on a custom service pointed at OpenRouter', async () => {
    const body = await captureRequest(
      {
        service_type: 'openai_compatible',
        custom_url: 'https://openrouter.ai/api/v1',
      },
      'anthropic/claude-sonnet-5'
    );
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
    expect((body.messages as unknown[])[0]).toEqual({
      role: 'system',
      content: cachedSystem,
    });
  });

  it('leaves models that cache on their own untouched', async () => {
    const body = await captureRequest(
      { service_type: 'openrouter' },
      'openai/gpt-5.5'
    );
    expect(body).not.toHaveProperty('cache_control');
    expect((body.messages as unknown[])[0]).toEqual({
      role: 'system',
      content: 'Sparky system prompt',
    });
  });

  it('never adds cache fields for other OpenAI-compatible servers', async () => {
    for (const service of [
      { service_type: 'ollama', custom_url: 'http://127.0.0.1:11434' },
      {
        service_type: 'openai_compatible',
        custom_url: 'http://127.0.0.1:8000/v1',
      },
      { service_type: 'custom', custom_url: 'http://127.0.0.1:1234/v1' },
    ]) {
      const body = await captureRequest(service, 'claude-sonnet-5');
      expect(body, service.service_type).not.toHaveProperty('cache_control');
      expect(JSON.stringify(body), service.service_type).not.toContain(
        'cache_control'
      );
    }
  });
});
