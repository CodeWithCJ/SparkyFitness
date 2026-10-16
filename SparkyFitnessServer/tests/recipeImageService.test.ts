import { beforeEach, expect, it, vi } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import { readRecipeImage } from '../services/recipeImageService.js';

vi.mock('../models/chatRepository.js', () => ({
  default: {
    getActiveVisionAiServiceSetting: vi.fn(),
    getAiServiceSettingForBackend: vi.fn(),
  },
}));
vi.mock('../ai/providerDispatch.js', () => ({ dispatchAiRequest: vi.fn() }));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveAiNetworkPolicy: vi
    .fn()
    .mockResolvedValue({ allowPrivateNetwork: false }),
  createGuardedFetch: vi.fn().mockReturnValue(vi.fn()),
  PUBLIC_ONLY_AI_NETWORK_POLICY: {},
}));
const image = 'data:image/png;base64,aGVsbG8=';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
    id: 'vision',
    service_type: 'openai',
    model_name: 'gpt-6-astra',
    reasoning_effort: 'high',
    api_key: 'test',
    custom_url: null,
  });
});
it('prefers the independently configured vision service over the text chat service', async () => {
  vi.mocked(
    chatRepository.getActiveVisionAiServiceSetting
  ).mockResolvedValueOnce({ id: 'vision' });
  vi.mocked(dispatchAiRequest).mockResolvedValueOnce({
    ok: true,
    text: '',
    json: {
      name: null,
      yield: null,
      instructions: null,
      ingredients: ['Flour'],
      issues: [],
    },
  });
  await readRecipeImage('owner', image, 'text-only');
  expect(chatRepository.getAiServiceSettingForBackend).toHaveBeenCalledWith(
    'vision',
    'owner'
  );
});
it('rejects more than 8 MiB of decoded image data before making a request', async () => {
  const tooLarge = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}`;
  await expect(readRecipeImage('owner', tooLarge, 'vision')).rejects.toThrow(
    'at most 8 MB'
  );
  expect(dispatchAiRequest).not.toHaveBeenCalled();
});
it('transcribes only the attached image with the selected model and preserves unreadable ingredient lines', async () => {
  const source = {
    name: 'Bread',
    yield: '2 loaves',
    ingredients: ['250 g flour', '[Unreadable ingredient line]'],
    instructions: 'Mix',
    issues: ['Clarify second ingredient'],
  };
  vi.mocked(dispatchAiRequest).mockResolvedValue({
    ok: true,
    text: JSON.stringify(source),
    json: source,
  });
  expect(await readRecipeImage('owner', image, 'vision')).toEqual(source);
  expect(chatRepository.getAiServiceSettingForBackend).toHaveBeenCalledWith(
    'vision',
    'owner'
  );
  expect(dispatchAiRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: expect.objectContaining({
        model_name: 'gpt-6-astra',
        reasoning_effort: 'high',
      }),
      images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }],
      schemaName: 'recipe_transcription',
    })
  );
});
it('rejects a guessed external image URL before loading credentials or making an AI request', async () => {
  await expect(
    readRecipeImage('owner', 'https://example.com/recipe.png', 'vision')
  ).rejects.toThrow('Attach a recipe image');
  expect(chatRepository.getAiServiceSettingForBackend).not.toHaveBeenCalled();
  expect(dispatchAiRequest).not.toHaveBeenCalled();
});
it('returns a clear failure instead of an empty or invented draft when image recognition fails', async () => {
  vi.mocked(dispatchAiRequest).mockResolvedValue({
    ok: false,
    category: 'timeout',
    detail: 'Timed out',
  });
  await expect(readRecipeImage('owner', image, 'vision')).rejects.toThrow(
    'could not be read'
  );
  vi.mocked(dispatchAiRequest).mockResolvedValue({
    ok: true,
    text: '{}',
    json: { ingredients: [] },
  });
  await expect(readRecipeImage('owner', image, 'vision')).rejects.toThrow(
    'No complete ingredient list'
  );
});
