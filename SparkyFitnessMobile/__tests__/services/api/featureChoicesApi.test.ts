import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';
import {
  fetchFeatureChoices,
  updateFeatureChoices,
} from '../../../src/services/api/featureChoicesApi';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const request = jest.mocked(apiFetch);

beforeEach(() => jest.resetAllMocks());

it('sends a change to the server it was made for, not whichever is active', async () => {
  const config = {
    id: 'owner',
    url: 'https://example.test',
    apiKey: 'synthetic-test-key',
  };
  request.mockResolvedValue({ feature_choices: {} });

  await updateFeatureChoices({ mobile: { labResults: false } }, config);

  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: '/api/user-preferences/features',
      method: 'PATCH',
      body: { mobile: { labResults: false } },
      serverConfig: config,
    })
  );
});

it('reads the choices from the active server', async () => {
  request.mockResolvedValue({ feature_choices: {} });

  await fetchFeatureChoices();

  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({ endpoint: '/api/user-preferences/features' })
  );
  expect(request.mock.calls[0][0]).not.toHaveProperty('serverConfig');
});

it('answers null only for the 404 of a server older than Features', async () => {
  request.mockRejectedValueOnce(new ApiError('Not found', 404));
  await expect(fetchFeatureChoices()).resolves.toBeNull();

  // Anything else throws, so the choices stay unknown.
  const serverError = new ApiError('Server error', 500);
  request.mockRejectedValueOnce(serverError);
  await expect(fetchFeatureChoices()).rejects.toBe(serverError);

  const offline = new TypeError('Network request failed');
  request.mockRejectedValueOnce(offline);
  await expect(fetchFeatureChoices()).rejects.toBe(offline);
});
