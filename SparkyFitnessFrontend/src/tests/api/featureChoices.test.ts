import { apiCall, HttpApiError } from '@/api/api';
import {
  getFeatureChoices,
  updateFeatureChoices,
} from '@/api/Settings/featureChoices';

jest.mock('@/api/api', () => {
  const actual = jest.requireActual('@/api/api');
  return { ...actual, apiCall: jest.fn() };
});

const mockedApiCall = apiCall as jest.MockedFunction<typeof apiCall>;

describe('getFeatureChoices', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the choices without a toast, which Settings shows in place', async () => {
    mockedApiCall.mockResolvedValue({ feature_choices: { web: {} } });
    await expect(getFeatureChoices()).resolves.toEqual({
      feature_choices: { web: {} },
    });
    expect(mockedApiCall).toHaveBeenCalledWith('/user-preferences/features', {
      method: 'GET',
      suppressErrorToast: true,
    });
  });

  it('answers null from a server older than the route', async () => {
    mockedApiCall.mockRejectedValue(new HttpApiError('Not found', 404));
    await expect(getFeatureChoices()).resolves.toBeNull();
  });

  it('passes any other failure on, so it can be retried', async () => {
    const failure = new HttpApiError('Server error', 500);
    mockedApiCall.mockRejectedValue(failure);
    await expect(getFeatureChoices()).rejects.toBe(failure);
  });
});

describe('updateFeatureChoices', () => {
  it('sends only the change', async () => {
    mockedApiCall.mockResolvedValue({ feature_choices: {} });
    await updateFeatureChoices({ web: { labResults: false } });
    expect(mockedApiCall).toHaveBeenCalledWith('/user-preferences/features', {
      method: 'PATCH',
      body: { web: { labResults: false } },
    });
  });
});
