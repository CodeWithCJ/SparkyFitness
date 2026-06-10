import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dispatchAiRequest,
  toStrictJsonSchema,
  type DispatchRequest,
  type JsonSchemaNode,
  type ProviderConfig,
} from '../ai/providerDispatch.js';

// Mock the undici Agent so the Ollama path never constructs a real agent.
// (global.fetch is mocked per-test; the dispatcher option is ignored by it.)
vi.mock('undici', () => {
  // Regular function (not arrow) so it is constructable via `new Agent(...)`.
  const Agent = vi.fn(function () {
    return { destroy: vi.fn() };
  });
  return { default: { Agent }, Agent };
});

const SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    nested: {
      type: 'object',
      properties: { x: { type: 'number' } },
      required: ['x'],
    },
  },
  required: ['answer', 'nested'],
  propertyOrdering: ['answer', 'nested'],
  additionalProperties: false,
};

const SAMPLE = { answer: 'hello', nested: { x: 1 } };
const SCHEMA_NAME = 'my_schema';
const IMG = { base64: 'aW1nMQ==', mimeType: 'image/jpeg' };

function makeProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    service_type: 'openai',
    api_key: 'sk-test',
    model_name: 'gpt-4o-mini',
    ...overrides,
  };
}

function baseRequest(
  overrides: Partial<DispatchRequest> = {}
): DispatchRequest {
  return {
    provider: makeProvider(),
    prompt: 'Do the thing.',
    jsonSchema: SCHEMA,
    schemaName: SCHEMA_NAME,
    ...overrides,
  };
}

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(
  jsonBody: unknown,
  init: { ok?: boolean; status?: number } = {}
): FetchMock {
  const m = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => (typeof jsonBody === 'string' ? jsonBody : ''),
    json: async () => jsonBody,
  });
  global.fetch = m as typeof global.fetch;
  return m;
}

function googleBody(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: payload }] } }] };
}
function openAiBody(payload: unknown, extra: Record<string, unknown> = {}) {
  return {
    choices: [
      { finish_reason: 'stop', message: { content: payload, ...extra } },
    ],
  };
}
function anthropicToolBody(payload: unknown, name = SCHEMA_NAME) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name, input: payload }],
  };
}
function ollamaBody(payload: unknown) {
  return { message: { content: payload } };
}

function captured(m: FetchMock): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const call = m.mock.calls[0];
  const init = call[1] as { headers: Record<string, string>; body: string };
  return {
    url: call[0] as string,
    headers: init.headers,
    body: JSON.parse(init.body) as Record<string, unknown>,
  };
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe('dispatchAiRequest — preconditions', () => {
  it('returns unsupported_provider for an unknown service_type', async () => {
    const m = vi.fn();
    global.fetch = m as typeof global.fetch;
    const result = await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ service_type: 'cohere' }) })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('unsupported_provider');
    expect(m).not.toHaveBeenCalled();
  });

  it.each(['openai', 'google', 'anthropic', 'groq'])(
    'returns api_key_missing for %s without an api_key',
    async (serviceType) => {
      const m = vi.fn();
      global.fetch = m as typeof global.fetch;
      const result = await dispatchAiRequest(
        baseRequest({
          provider: makeProvider({
            service_type: serviceType,
            api_key: undefined,
          }),
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe('api_key_missing');
      expect(m).not.toHaveBeenCalled();
    }
  );

  it('does NOT require an api_key for ollama', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    expect(result.ok).toBe(true);
    expect(m).toHaveBeenCalled();
  });

  it.each(['ollama', 'openai_compatible', 'custom'])(
    'returns custom_url_missing for %s with a blank custom_url',
    async (serviceType) => {
      const m = vi.fn();
      global.fetch = m as typeof global.fetch;
      const result = await dispatchAiRequest(
        baseRequest({
          provider: makeProvider({
            service_type: serviceType,
            api_key: serviceType === 'ollama' ? undefined : 'sk-test',
            custom_url: '   ',
          }),
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe('custom_url_missing');
      expect(m).not.toHaveBeenCalled();
    }
  );

  it('returns unsupported_media when HEIC is sent to a non-Gemini provider', async () => {
    const m = vi.fn();
    global.fetch = m as typeof global.fetch;
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'anthropic' }),
        images: [{ base64: 'aGVsbG8=', mimeType: 'image/heic' }],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('unsupported_media');
    expect(m).not.toHaveBeenCalled();
  });

  it('allows HEIC for google (Gemini accepts it)', async () => {
    mockFetch(googleBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
        images: [{ base64: 'aGVsbG8=', mimeType: 'image/heic' }],
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe('dispatchAiRequest — text-only structured request shapes', () => {
  it('openai sends strict json_schema with a strict-transformed schema', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(baseRequest());
    const { url, headers, body } = captured(m);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer sk-test');
    const rf = body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: JsonSchemaNode };
    };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe(SCHEMA_NAME);
    expect(rf.json_schema.strict).toBe(true);
    // Strict transform: additionalProperties:false everywhere, propertyOrdering gone.
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.properties?.nested?.additionalProperties).toBe(
      false
    );
    expect(rf.json_schema.schema.propertyOrdering).toBeUndefined();
    // Text-only: content is a plain string, not an array of blocks.
    const messages = body.messages as Array<{ content: unknown }>;
    expect(typeof messages[0].content).toBe('string');
    expect(body.provider).toBeUndefined();
  });

  it('groq mirrors openai strict json_schema but without provider.require_parameters', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ service_type: 'groq' }) })
    );
    const { url, body } = captured(m);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((body.response_format as { type: string }).type).toBe('json_schema');
    expect(body.provider).toBeUndefined();
  });

  it('openrouter sends strict json_schema, provider.require_parameters, and attribution headers', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ service_type: 'openrouter' }) })
    );
    const { url, headers, body } = captured(m);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(headers['HTTP-Referer']).toBe('https://sparky-fitness.com');
    expect(headers['X-Title']).toBe('Sparky Fitness');
    expect((body.response_format as { type: string }).type).toBe('json_schema');
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('mistral mirrors openai strict json_schema but without provider.require_parameters', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ service_type: 'mistral' }) })
    );
    const { url, body } = captured(m);
    expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    expect((body.response_format as { type: string }).type).toBe('json_schema');
    expect(body.provider).toBeUndefined();
    // Strict mode carries the schema; the prompt stays clean.
    const messages = body.messages as Array<{ content: string }>;
    expect(messages[0].content).toBe('Do the thing.');
  });

  it('openai_compatible appends /chat/completions to custom_url and uses json_object with the schema embedded in the prompt', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'openai_compatible',
          custom_url: 'https://example.local/v1',
        }),
      })
    );
    const { url, body } = captured(m);
    expect(url).toBe('https://example.local/v1/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // json_object mode does not carry the schema, so the prompt must.
    const messages = body.messages as Array<{ content: string }>;
    expect(messages[0].content).toContain('Do the thing.');
    expect(messages[0].content).toContain(
      JSON.stringify(toStrictJsonSchema(SCHEMA))
    );
  });

  it('custom uses the user-supplied URL as-is and json_object with the schema embedded in the prompt', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'custom',
          custom_url: 'https://example.local/api/foo',
        }),
      })
    );
    const { url, body } = captured(m);
    expect(url).toBe('https://example.local/api/foo');
    expect(body.response_format).toEqual({ type: 'json_object' });
    const messages = body.messages as Array<{ content: string }>;
    expect(messages[0].content).toContain(
      JSON.stringify(toStrictJsonSchema(SCHEMA))
    );
  });

  it('gemini sends responseMimeType + responseSchema with additionalProperties stripped, propertyOrdering kept', async () => {
    const m = mockFetch(googleBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
      })
    );
    const { url, headers, body } = captured(m);
    expect(url).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models/'
    );
    // Key travels in the header, not the URL.
    expect(url).not.toContain('key=');
    expect(headers['x-goog-api-key']).toBe('gem-key');
    const gc = body.generationConfig as {
      responseMimeType: string;
      responseSchema: JsonSchemaNode;
    };
    expect(gc.responseMimeType).toBe('application/json');
    expect(gc.responseSchema.additionalProperties).toBeUndefined();
    expect(gc.responseSchema.propertyOrdering).toEqual(['answer', 'nested']);
  });

  it('anthropic forces a tool_use call with a strict input_schema', async () => {
    const m = mockFetch(anthropicToolBody(SAMPLE));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
      })
    );
    const { url, headers, body } = captured(m);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers['x-api-key']).toBe('anth-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(body.tool_choice).toEqual({ type: 'tool', name: SCHEMA_NAME });
    const tools = body.tools as Array<{
      name: string;
      strict: boolean;
      input_schema: JsonSchemaNode;
    }>;
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe(SCHEMA_NAME);
    expect(tools[0].strict).toBe(true);
    expect(tools[0].input_schema.additionalProperties).toBe(false);
    expect(tools[0].input_schema.properties?.nested?.additionalProperties).toBe(
      false
    );
  });

  it('ollama sends the raw schema as format on /api/chat with no auth header', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    const { url, headers, body } = captured(m);
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(headers.Authorization).toBeUndefined();
    expect(body.stream).toBe(false);
    expect(body.format).toEqual(SCHEMA);
  });
});

describe('dispatchAiRequest — vision request shapes', () => {
  it('gemini sends inline_data parts followed by the prompt text', async () => {
    const m = mockFetch(googleBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
        images: [IMG],
      })
    );
    const { body } = captured(m);
    const parts = (
      body.contents as Array<{ parts: Array<Record<string, unknown>> }>
    )[0].parts;
    const imagePart = parts.find((p) => p.inline_data !== undefined) as {
      inline_data: { mime_type: string; data: string };
    };
    expect(imagePart.inline_data.data).toBe(IMG.base64);
    expect(imagePart.inline_data.mime_type).toBe(IMG.mimeType);
    expect(typeof parts[parts.length - 1].text).toBe('string');
  });

  it('openai sends a data-URI image_url content part', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(baseRequest({ images: [IMG] }));
    const { body } = captured(m);
    const content = (
      body.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0].content;
    const imagePart = content.find((p) => p.type === 'image_url') as {
      image_url: { url: string };
    };
    expect(imagePart.image_url.url).toBe(
      `data:${IMG.mimeType};base64,${IMG.base64}`
    );
  });

  it('json_object fallback embeds the schema in the text part alongside images', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'openai_compatible',
          custom_url: 'https://example.local/v1',
        }),
        images: [IMG],
      })
    );
    const { body } = captured(m);
    const content = (
      body.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0].content;
    const textPart = content.find((p) => p.type === 'text') as {
      text: string;
    };
    expect(textPart.text).toContain('Do the thing.');
    expect(textPart.text).toContain(JSON.stringify(toStrictJsonSchema(SCHEMA)));
  });

  it('anthropic sends a base64 image source block', async () => {
    const m = mockFetch(anthropicToolBody(SAMPLE));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
        images: [IMG],
      })
    );
    const { body } = captured(m);
    const content = (
      body.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0].content;
    const imagePart = content.find((p) => p.type === 'image') as {
      source: { type: string; media_type: string; data: string };
    };
    expect(imagePart.source.type).toBe('base64');
    expect(imagePart.source.media_type).toBe(IMG.mimeType);
    expect(imagePart.source.data).toBe(IMG.base64);
  });

  it('ollama puts base64 images on the message images[] array', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
        images: [IMG],
      })
    );
    const { body } = captured(m);
    const message = (
      body.messages as Array<{ images?: string[]; content: string }>
    )[0];
    expect(message.images).toEqual([IMG.base64]);
    expect(message.content).toBe('Do the thing.');
  });
});

describe('dispatchAiRequest — extraction & success', () => {
  it('google happy path returns parsed json', async () => {
    mockFetch(googleBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
      })
    );
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
  });

  it('openai happy path returns parsed json', async () => {
    mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(baseRequest());
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
  });

  it('ollama happy path returns parsed json', async () => {
    mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
  });

  it('plain-text request (no schema, no parseJson) returns text with json null', async () => {
    mockFetch(openAiBody('just some prose'));
    const result = await dispatchAiRequest(
      baseRequest({ jsonSchema: undefined, schemaName: undefined })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe('just some prose');
      expect(result.json).toBeNull();
    }
  });

  it('parseJson populates json from unstructured text', async () => {
    mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    const result = await dispatchAiRequest(
      baseRequest({
        jsonSchema: undefined,
        schemaName: undefined,
        parseJson: true,
      })
    );
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
  });
});

describe('dispatchAiRequest — anthropic tool_use extraction', () => {
  const anthropicReq = (body: unknown) => {
    mockFetch(body);
    return dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
      })
    );
  };

  it('returns the tool_use input object directly (not a re-parsed string)', async () => {
    const result = await anthropicReq(anthropicToolBody(SAMPLE));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.json).toEqual(SAMPLE);
      expect(typeof result.json).toBe('object');
      // text is the stringification of the object payload.
      expect(result.text).toBe(JSON.stringify(SAMPLE));
    }
  });

  it('maps stop_reason refusal → refused', async () => {
    const result = await anthropicReq({ stop_reason: 'refusal', content: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('refused');
  });

  it('maps stop_reason max_tokens → truncated', async () => {
    const result = await anthropicReq({
      stop_reason: 'max_tokens',
      content: [
        { type: 'tool_use', name: SCHEMA_NAME, input: { partial: true } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('truncated');
  });

  it('maps stop_reason end_turn (no tool call) → no_content', async () => {
    const result = await anthropicReq({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('no_content');
  });

  it('maps a malformed tool_use block → upstream_error', async () => {
    const result = await anthropicReq({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', name: SCHEMA_NAME, input: 'not-an-object' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('upstream_error');
  });

  it('extracts plain text when no schema is requested (label-scan style)', async () => {
    mockFetch({ content: [{ type: 'text', text: JSON.stringify(SAMPLE) }] });
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
        jsonSchema: undefined,
        schemaName: undefined,
        parseJson: true,
      })
    );
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
  });
});

describe('dispatchAiRequest — error categories', () => {
  it('non-2xx → upstream_error with status', async () => {
    mockFetch('internal error', { ok: false, status: 500 });
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('upstream_error');
      expect(result.status).toBe(500);
    }
  });

  it('non-JSON success body → upstream_error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => {
        throw new Error('not json');
      },
    }) as typeof global.fetch;
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('upstream_error');
  });

  it.each(['TimeoutError', 'AbortError'])(
    'fetch rejecting with %s → timeout',
    async (errorName) => {
      const err = new Error('aborted');
      err.name = errorName;
      global.fetch = vi.fn().mockRejectedValue(err) as typeof global.fetch;
      const result = await dispatchAiRequest(baseRequest());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe('timeout');
    }
  );

  it('generic fetch rejection → upstream_error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network down')) as typeof global.fetch;
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('upstream_error');
  });

  it('openai message.refusal → refused', async () => {
    mockFetch(openAiBody('', { refusal: "I can't help with that" }));
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('refused');
  });

  it('openai finish_reason content_filter → refused', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        choices: [
          { finish_reason: 'content_filter', message: { content: '' } },
        ],
      }),
    }) as typeof global.fetch;
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('refused');
  });

  it('openai finish_reason length → truncated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        choices: [
          { finish_reason: 'length', message: { content: '{"answer":' } },
        ],
      }),
    }) as typeof global.fetch;
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('truncated');
  });

  it('empty content → no_content', async () => {
    mockFetch(openAiBody(''));
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('no_content');
  });

  it('invalid JSON when JSON requested → parse_error', async () => {
    mockFetch(openAiBody('this is not json'));
    const result = await dispatchAiRequest(baseRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('parse_error');
  });
});

describe('dispatchAiRequest — ollama undici timeout handling', () => {
  it.each(['HeadersTimeoutError', 'BodyTimeoutError'])(
    'ollama fetch rejecting with %s → timeout',
    async (errorName) => {
      const err = new Error('ollama timed out');
      err.name = errorName;
      global.fetch = vi.fn().mockRejectedValue(err) as typeof global.fetch;
      const result = await dispatchAiRequest(
        baseRequest({
          provider: makeProvider({
            service_type: 'ollama',
            api_key: undefined,
            custom_url: 'http://localhost:11434',
          }),
        })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.category).toBe('timeout');
    }
  );

  it('generic ollama fetch rejection → upstream_error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(
        new Error('connection refused')
      ) as typeof global.fetch;
    const result = await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('upstream_error');
  });
});

describe('dispatchAiRequest — fence stripping', () => {
  it('strips ```json fences before parsing under parseJson', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``;
    mockFetch(openAiBody(fenced));
    const result = await dispatchAiRequest(
      baseRequest({
        jsonSchema: undefined,
        schemaName: undefined,
        parseJson: true,
      })
    );
    expect(result).toMatchObject({ ok: true, json: SAMPLE });
    if (result.ok) {
      // text preserves the raw (still-fenced) extracted string.
      expect(result.text).toBe(fenced);
    }
  });
});

describe('dispatchAiRequest — MIME normalization', () => {
  it("rewrites 'image/jpg' to 'image/jpeg' in the anthropic media_type", async () => {
    const m = mockFetch({
      content: [{ type: 'text', text: JSON.stringify(SAMPLE) }],
    });
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
        jsonSchema: undefined,
        schemaName: undefined,
        parseJson: true,
        images: [{ base64: 'aW1n', mimeType: 'image/jpg' }],
      })
    );
    const { body } = captured(m);
    const content = (
      body.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0].content;
    const imagePart = content.find((p) => p.type === 'image') as {
      source: { media_type: string };
    };
    expect(imagePart.source.media_type).toBe('image/jpeg');
  });

  it("rewrites 'image/jpg' to 'image/jpeg' in the openai data-URI", async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        jsonSchema: undefined,
        schemaName: undefined,
        parseJson: true,
        images: [{ base64: 'aW1n', mimeType: 'image/jpg' }],
      })
    );
    const { body } = captured(m);
    const content = (
      body.messages as Array<{ content: Array<Record<string, unknown>> }>
    )[0].content;
    const imagePart = content.find((p) => p.type === 'image_url') as {
      image_url: { url: string };
    };
    expect(imagePart.image_url.url).toBe('data:image/jpeg;base64,aW1n');
  });
});

describe('dispatchAiRequest — model defaulting', () => {
  it('uses the user-configured model_name when present', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ model_name: 'gpt-4.1' }) })
    );
    expect(captured(m).body.model).toBe('gpt-4.1');
  });

  it('falls back to the vision default when images are present and model_name is unset', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ model_name: undefined }),
        images: [IMG],
      })
    );
    // openai vision default
    expect(captured(m).body.model).toBe('gpt-4.1-mini');
  });

  it('falls back to the text default when no images and model_name is unset', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({ provider: makeProvider({ model_name: undefined }) })
    );
    // openai text default
    expect(captured(m).body.model).toBe('gpt-4o-mini');
  });

  it('ollama vision falls back to llava', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          model_name: undefined,
          custom_url: 'http://localhost:11434',
        }),
        images: [IMG],
      })
    );
    expect(captured(m).body.model).toBe('llava');
  });

  // Shared default: getDefaultModel also feeds normal, food-options, and
  // streaming chat (chatService), so this pins the value where it's consumed.
  it('ollama text falls back to llama3.2', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          model_name: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    expect(captured(m).body.model).toBe('llama3.2');
  });
});

describe('dispatchAiRequest — temperature', () => {
  // `temperature: 0` is the load-bearing case for every family: a truthy guard
  // instead of `!== undefined` would silently drop it.
  it('openai-family sends temperature 0 in the body', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(baseRequest({ temperature: 0 }));
    expect(captured(m).body.temperature).toBe(0);
  });

  it('openai-family sends a non-zero temperature in the body', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(baseRequest({ temperature: 0.2 }));
    expect(captured(m).body.temperature).toBe(0.2);
  });

  it('openai-family omits temperature when unset', async () => {
    const m = mockFetch(openAiBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(baseRequest());
    expect(captured(m).body.temperature).toBeUndefined();
  });

  it('google sends generationConfig.temperature 0 alongside the schema config', async () => {
    const m = mockFetch(googleBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
        temperature: 0,
      })
    );
    const gc = captured(m).body.generationConfig as {
      temperature: number;
      responseMimeType: string;
    };
    expect(gc.temperature).toBe(0);
    expect(gc.responseMimeType).toBe('application/json');
  });

  it('google sends a temperature-only generationConfig without schema/parseJson', async () => {
    const m = mockFetch(googleBody('just some prose'));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
        jsonSchema: undefined,
        schemaName: undefined,
        temperature: 0,
      })
    );
    expect(captured(m).body.generationConfig).toEqual({ temperature: 0 });
  });

  it('google omits generationConfig entirely for plain-text requests without temperature', async () => {
    const m = mockFetch(googleBody('just some prose'));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({ service_type: 'google', api_key: 'gem-key' }),
        jsonSchema: undefined,
        schemaName: undefined,
      })
    );
    expect(captured(m).body.generationConfig).toBeUndefined();
  });

  it('anthropic sends temperature 0 in the body', async () => {
    const m = mockFetch(anthropicToolBody(SAMPLE));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
        temperature: 0,
      })
    );
    expect(captured(m).body.temperature).toBe(0);
  });

  it('anthropic omits temperature when unset', async () => {
    const m = mockFetch(anthropicToolBody(SAMPLE));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'anthropic',
          api_key: 'anth-key',
        }),
      })
    );
    expect(captured(m).body.temperature).toBeUndefined();
  });

  it('ollama sends temperature 0 via options', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
        temperature: 0,
      })
    );
    expect(captured(m).body.options).toEqual({ temperature: 0 });
  });

  it('ollama omits options when temperature is unset', async () => {
    const m = mockFetch(ollamaBody(JSON.stringify(SAMPLE)));
    await dispatchAiRequest(
      baseRequest({
        provider: makeProvider({
          service_type: 'ollama',
          api_key: undefined,
          custom_url: 'http://localhost:11434',
        }),
      })
    );
    expect(captured(m).body.options).toBeUndefined();
  });
});

describe('toStrictJsonSchema', () => {
  it('adds additionalProperties:false to every object node and strips propertyOrdering', () => {
    const strict = toStrictJsonSchema(SCHEMA);
    expect(strict.additionalProperties).toBe(false);
    expect(strict.properties?.nested?.additionalProperties).toBe(false);
    expect(strict.propertyOrdering).toBeUndefined();
  });

  it('does not mutate the source schema', () => {
    const before = JSON.stringify(SCHEMA);
    toStrictJsonSchema(SCHEMA);
    expect(JSON.stringify(SCHEMA)).toBe(before);
  });
});
