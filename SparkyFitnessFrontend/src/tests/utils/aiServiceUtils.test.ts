import {
  getModelOptions,
  getServiceTypes,
  isCustomModelName,
  providerDetailText,
  requiresApiKey,
} from '@/utils/aiServiceUtils';

describe('providerDetailText', () => {
  it('drops the HTTP status prefix and shows the JSON error message', () => {
    expect(
      providerDetailText(
        'AI service returned status 401: {"error":{"message":"Invalid API key","type":"auth"}}'
      )
    ).toBe('Invalid API key');
  });

  it('uses a top-level JSON message field', () => {
    expect(
      providerDetailText(
        'AI service returned status 400: {"message":"Bad model"}'
      )
    ).toBe('Bad model');
  });

  it('uses a string error field', () => {
    expect(
      providerDetailText(
        'AI service returned status 400: {"error":"Quota hit"}'
      )
    ).toBe('Quota hit');
  });

  it('shows the response text when the body is not JSON', () => {
    expect(
      providerDetailText('AI service returned status 502: Bad Gateway')
    ).toBe('Bad Gateway');
  });

  it('shows the whole JSON when it has no message field', () => {
    expect(
      providerDetailText('AI service returned status 500: {"code":42}')
    ).toBe('{"code":42}');
  });

  it('removes HTML so only text remains', () => {
    expect(
      providerDetailText(
        'AI service returned status 502: <html><body><h1>Bad gateway</h1><script>x()</script></body></html>'
      )
    ).toBe('Bad gateway x()');
  });

  it('truncates long responses', () => {
    const result = providerDetailText(
      `AI service returned status 500: ${'a'.repeat(1000)}`
    );
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(301);
  });

  it('returns a plain sentence unchanged', () => {
    expect(
      providerDetailText(
        'The image is too large for AI analysis. Please try another photo.'
      )
    ).toBe('The image is too large for AI analysis. Please try another photo.');
  });
});

describe('getServiceTypes', () => {
  it('includes OpenCode Go as a selectable AI service', () => {
    expect(getServiceTypes((key) => key)).toContainEqual({
      value: 'opencode_go',
      label: 'settings.aiService.serviceTypes.opencodeGo',
    });
  });
});

describe('getModelOptions', () => {
  // Regression: 'openai_compatible' and 'custom' point at arbitrary user-hosted
  // servers, so the form must NOT suggest OpenAI model names (which won't exist
  // on most compatible servers). Returning [] makes the form fall back to the
  // custom-model text input. Previously 'openai_compatible' shared OpenAI's list
  // and auto-selected 'gpt-4o-mini', which failed against non-OpenAI endpoints.
  it.each(['openai_compatible', 'custom'])(
    'returns no preset models for %s',
    (serviceType) => {
      expect(getModelOptions(serviceType)).toEqual([]);
    }
  );

  it('does not leak OpenAI model names into openai_compatible', () => {
    expect(getModelOptions('openai_compatible')).not.toContain('gpt-4o-mini');
  });

  it('still returns the OpenAI list for openai (unchanged)', () => {
    const options = getModelOptions('openai');
    expect(options[0]).toBe('gpt-6-astra');
    expect(options).toEqual(
      expect.arrayContaining(['gpt-6.1-sol', 'gpt-6-sol', 'gpt-4o-mini'])
    );
    expect(options.length).toBeGreaterThan(1);
  });

  it('returns an empty list for an unknown service type', () => {
    expect(getModelOptions('totally-unknown')).toEqual([]);
  });

  it('leaves OpenCode Go models to its runtime model endpoint', () => {
    expect(getModelOptions('opencode_go')).toEqual([]);
    expect(requiresApiKey('opencode_go')).toBe(true);
  });

  it('returns the Muse Spark preset for meta', () => {
    expect(getModelOptions('meta')).toEqual(['muse-spark-1.1']);
  });

  it('returns presets for perplexity', () => {
    expect(getModelOptions('perplexity')).toEqual([
      'fast',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('includes Perplexity models in the OpenRouter preset list', () => {
    const options = getModelOptions('openrouter');
    expect(options).toContain('perplexity/sonar');
    expect(options).toContain('perplexity/sonar-pro');
  });
});

describe('requiresApiKey', () => {
  // Regression: keyless local servers (LM Studio, llama.cpp, Ollama) must be
  // savable without an API key. The add/edit forms previously exempted only
  // 'ollama', blocking openai_compatible/custom even though the server's
  // dispatcher and test-connection path tolerate a blank key.
  it.each(['ollama', 'openai_compatible', 'custom'])(
    'does not require a key for keyless local type %s',
    (serviceType) => {
      expect(requiresApiKey(serviceType)).toBe(false);
    }
  );

  it.each([
    'openai',
    'anthropic',
    'google',
    'mistral',
    'groq',
    'openrouter',
    'xai',
    'perplexity',
    'meta',
  ])('requires a key for cloud provider %s', (serviceType) => {
    expect(requiresApiKey(serviceType)).toBe(true);
  });
});

describe('isCustomModelName', () => {
  it('keeps a saved OpenCode Go model out of custom mode', () => {
    expect(isCustomModelName('opencode_go', 'glm-5.3-flash')).toBe(false);
  });

  it('treats a model outside a static preset list as custom', () => {
    expect(isCustomModelName('openai_compatible', 'my-local-model')).toBe(true);
    expect(isCustomModelName('openai', 'gpt-4o')).toBe(false);
  });

  it('is not custom when no model is saved', () => {
    expect(isCustomModelName('openai_compatible', '')).toBe(false);
    expect(isCustomModelName('openai', null)).toBe(false);
  });
});
