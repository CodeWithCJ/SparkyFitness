import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { FeatureChoicesResponse } from '@workspace/shared';
import { useFeatureOnState } from '../../src/hooks/useFeatureOnState';
import { fetchFeatureChoices } from '../../src/services/api/featureChoicesApi';
import { getSettings } from '../../src/services/api/cycleApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/featureChoicesApi', () => ({
  fetchFeatureChoices: jest.fn(),
  updateFeatureChoices: jest.fn(),
}));

jest.mock('../../src/services/api/cycleApi', () => ({
  getSettings: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const getMock = jest.mocked(fetchFeatureChoices);

let queryClient: QueryClient;

function setup(feature: 'medications' | 'oralCare' = 'medications') {
  return renderHook(() => useFeatureOnState(feature), {
    wrapper: createQueryWrapper(queryClient),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  queryClient = createTestQueryClient();
});

afterEach(() => {
  queryClient.clear();
});

it('is unknown while the choices load, then follows the app choice', async () => {
  let answer!: (value: FeatureChoicesResponse) => void;
  getMock.mockReturnValueOnce(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  const { result } = setup();
  expect(result.current.state).toBe('unknown');

  await act(async () => {
    answer({ feature_choices: { mobile: { medications: false } } });
  });
  await waitFor(() => expect(result.current.state).toBe('off'));
  // The reminders at the app root never load the cycle settings.
  expect(getSettings).not.toHaveBeenCalled();
});

it('stays unknown when the read fails', async () => {
  getMock.mockRejectedValue(new Error('offline'));
  const { result } = setup();

  await waitFor(() => expect(getMock).toHaveBeenCalled());
  await act(async () => {});
  expect(result.current.state).toBe('unknown');
});

it('reads the choices again on refetch', async () => {
  getMock.mockResolvedValueOnce({ feature_choices: {} });
  const { result } = setup();
  await waitFor(() => expect(result.current.state).toBe('on'));

  getMock.mockResolvedValueOnce({
    feature_choices: { mobile: { medications: false } },
  });
  await act(async () => {
    await result.current.refetch();
  });

  await waitFor(() => expect(result.current.state).toBe('off'));
  expect(getMock).toHaveBeenCalledTimes(2);
});

it('reads the state of the feature it is asked about', async () => {
  getMock.mockResolvedValue({
    feature_choices: { mobile: { oralCare: false } },
  });
  const oralCare = setup('oralCare');
  await waitFor(() => expect(oralCare.result.current.state).toBe('off'));
  const medications = setup('medications');
  await waitFor(() => expect(medications.result.current.state).toBe('on'));
});
