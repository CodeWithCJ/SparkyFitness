import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectRejectedParam,
  describeRejectedParam,
  isParamRejected,
  recordRejectedParam,
  resetLearnedRejections,
  supportsTemperature,
} from '../ai/modelCapabilities.js';

// The exact body OpenAI returns for a gpt-5.6 model, from issue #2165.
const ISSUE_2165_BODY = JSON.stringify({
  error: {
    message:
      "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.",
    type: 'invalid_request_error',
    param: 'temperature',
    code: 'unsupported_value',
  },
});

beforeEach(() => {
  resetLearnedRejections();
});

describe('detectRejectedParam', () => {
  it('names temperature from the issue #2165 body', () => {
    expect(detectRejectedParam(400, ISSUE_2165_BODY)).toBe('temperature');
  });

  it('names temperature from an Anthropic-style body with no param field', () => {
    const body = JSON.stringify({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'temperature: Extra inputs are not permitted',
      },
    });
    expect(detectRejectedParam(400, body)).toBe('temperature');
  });

  it('names top_p, the other droppable sampling hint', () => {
    const body = JSON.stringify({
      error: {
        message: "Unsupported value: 'top_p' is not supported with this model.",
        param: 'top_p',
        code: 'unsupported_value',
      },
    });
    expect(detectRejectedParam(400, body)).toBe('top_p');
  });

  // Dropping max_tokens would trade one failure for another (Anthropic
  // requires it), so it must never be self-healed away.
  it('refuses to name max_tokens even when the provider rejects it', () => {
    const body = JSON.stringify({
      error: {
        message: "Unsupported parameter: 'max_tokens' is not supported.",
        param: 'max_tokens',
        code: 'unsupported_parameter',
      },
    });
    expect(detectRejectedParam(400, body)).toBeNull();
  });

  it('ignores a 400 that is not a parameter rejection', () => {
    const body = JSON.stringify({
      error: {
        message: 'The model `gpt-9` does not exist.',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    expect(detectRejectedParam(400, body)).toBeNull();
  });

  it('ignores non-400 statuses and unparseable bodies', () => {
    expect(detectRejectedParam(401, ISSUE_2165_BODY)).toBeNull();
    expect(detectRejectedParam(500, ISSUE_2165_BODY)).toBeNull();
    expect(detectRejectedParam(400, '<html>Bad Gateway</html>')).toBeNull();
    expect(detectRejectedParam(400, '')).toBeNull();
  });

  it('skips a body too large to be an error payload', () => {
    expect(detectRejectedParam(400, 'x'.repeat(9000))).toBeNull();
  });
});

describe('describeRejectedParam', () => {
  it('names the parameter for a readable error message', () => {
    expect(describeRejectedParam(400, ISSUE_2165_BODY)).toBe('temperature');
  });

  it('returns null for an unrelated 400', () => {
    const body = JSON.stringify({ error: { message: 'Invalid API key.' } });
    expect(describeRejectedParam(400, body)).toBeNull();
  });
});

describe('supportsTemperature — static gate', () => {
  it.each([
    ['gpt-5.6-luna', false],
    ['gpt-5.6-terra', false],
    ['gpt-5.6-sol', false],
    ['gpt-5.4-mini', false],
    ['o1-mini', false],
    ['o3', false],
    ['o4-mini', false],
    ['gpt-4o-mini', true],
    ['gpt-4.1-mini', true],
    ['gpt-4o', true],
  ])('openai %s -> %s', (model, expected) => {
    expect(supportsTemperature('openai', model)).toBe(expected);
  });

  it.each([
    ['claude-opus-5', false],
    ['claude-opus-4-7', false],
    ['claude-opus-4-8', false],
    ['claude-sonnet-5', false],
    ['claude-fable-5', false],
    ['claude-mythos-5', false],
    ['claude-sonnet-4-6', true],
    ['claude-haiku-4-5', true],
  ])('anthropic %s -> %s', (model, expected) => {
    expect(supportsTemperature('anthropic', model)).toBe(expected);
  });

  // A gateway may serve an OpenAI-looking id through a shim that does accept
  // temperature, so compatible types are left to the runtime gate instead.
  it('does not statically block gpt-5 ids on gateway service types', () => {
    expect(supportsTemperature('openai_compatible', 'gpt-5.6-luna')).toBe(true);
    expect(supportsTemperature('custom', 'gpt-5.6-luna')).toBe(true);
    expect(supportsTemperature('openrouter', 'openai/gpt-5.6-luna')).toBe(true);
  });

  it('leaves unknown providers and models alone', () => {
    expect(supportsTemperature('ollama', 'llama3.2')).toBe(true);
    expect(supportsTemperature('google', 'gemini-2.5-flash')).toBe(true);
  });
});

describe('supportsTemperature — learned gate', () => {
  it('blocks a model after it has rejected temperature once', () => {
    expect(supportsTemperature('openai_compatible', 'mystery-1')).toBe(true);
    recordRejectedParam('openai_compatible', 'mystery-1', 'temperature');
    expect(supportsTemperature('openai_compatible', 'mystery-1')).toBe(false);
    expect(
      isParamRejected('openai_compatible', 'mystery-1', 'temperature')
    ).toBe(true);
  });

  it('scopes the rejection to that service type and model', () => {
    recordRejectedParam('openai_compatible', 'mystery-1', 'temperature');
    expect(supportsTemperature('openai_compatible', 'mystery-2')).toBe(true);
    expect(supportsTemperature('custom', 'mystery-1')).toBe(true);
  });

  it('records multiple params for the same model', () => {
    recordRejectedParam('custom', 'm', 'temperature');
    recordRejectedParam('custom', 'm', 'top_p');
    expect(isParamRejected('custom', 'm', 'temperature')).toBe(true);
    expect(isParamRejected('custom', 'm', 'top_p')).toBe(true);
  });

  // Model names come from user-editable settings, so the cache must be bounded.
  it('evicts the oldest entry past the cap instead of growing forever', () => {
    for (let i = 0; i < 505; i++) {
      recordRejectedParam('custom', `model-${i}`, 'temperature');
    }
    expect(isParamRejected('custom', 'model-0', 'temperature')).toBe(false);
    expect(isParamRejected('custom', 'model-504', 'temperature')).toBe(true);
  });
});
