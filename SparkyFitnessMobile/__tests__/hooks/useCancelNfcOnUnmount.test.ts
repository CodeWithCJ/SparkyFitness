import { renderHook } from '@testing-library/react-native';
import { useCancelNfcOnUnmount } from '../../src/hooks/useCancelNfcOnUnmount';
import { cancelNfcRequest } from '../../src/services/nfc/nfcService';

jest.mock('../../src/services/nfc/nfcService', () => ({
  cancelNfcRequest: jest.fn(() => Promise.resolve()),
}));

describe('useCancelNfcOnUnmount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels a request that is still waiting when the screen goes away', () => {
    const { unmount } = renderHook(() => useCancelNfcOnUnmount(true));
    unmount();
    expect(cancelNfcRequest).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no tag was being waited for', () => {
    const { unmount } = renderHook(() => useCancelNfcOnUnmount(false));
    unmount();
    expect(cancelNfcRequest).not.toHaveBeenCalled();
  });

  it('follows the latest state, so a finished request is not cancelled again', () => {
    const { rerender, unmount } = renderHook(
      ({ waiting }) => useCancelNfcOnUnmount(waiting),
      { initialProps: { waiting: true } }
    );
    rerender({ waiting: false });
    unmount();
    expect(cancelNfcRequest).not.toHaveBeenCalled();
  });
});
