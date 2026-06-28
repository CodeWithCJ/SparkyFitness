import { getModelOptions } from '@/utils/aiServiceUtils';

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
    expect(options[0]).toBe('gpt-4o-mini');
    expect(options.length).toBeGreaterThan(1);
  });

  it('returns an empty list for an unknown service type', () => {
    expect(getModelOptions('totally-unknown')).toEqual([]);
  });
});
