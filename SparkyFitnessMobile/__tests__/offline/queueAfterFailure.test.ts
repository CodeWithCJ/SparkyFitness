import { ApiError } from '../../src/services/api/errors';
import { queueAfterConnectionFailure } from '../../src/offline/queueAfterFailure';
import { TimeoutError } from '../../src/utils/concurrency';

describe('queueAfterConnectionFailure', () => {
  it('keeps the change on the phone when the server could not be reached', async () => {
    const queue = jest.fn(async () => true);

    expect(
      await queueAfterConnectionFailure(
        new TypeError('Network request failed'),
        queue
      )
    ).toBe(true);
    expect(
      await queueAfterConnectionFailure(
        new Error('fetch failed: java.net.UnknownHostException'),
        queue
      )
    ).toBe(true);
    expect(queue).toHaveBeenCalledTimes(2);
  });

  it('reports false when queueing itself did not work', async () => {
    expect(
      await queueAfterConnectionFailure(
        new TypeError('Network request failed'),
        async () => false
      )
    ).toBe(false);
  });

  it('does not queue after a timeout, an answer from the server or an app error', async () => {
    const queue = jest.fn(async () => true);

    expect(
      await queueAfterConnectionFailure(
        new TimeoutError('request', 5000),
        queue
      )
    ).toBe(false);
    expect(
      await queueAfterConnectionFailure(new ApiError('invalid', 400), queue)
    ).toBe(false);
    expect(
      await queueAfterConnectionFailure(new Error('Validation failed'), queue)
    ).toBe(false);
    expect(queue).not.toHaveBeenCalled();
  });

  it('does not queue after a read timeout, which the server may have processed', async () => {
    const queue = jest.fn(async () => true);

    expect(
      await queueAfterConnectionFailure(
        new Error(
          'fetch failed: java.net.SocketTimeoutException: Read timed out'
        ),
        queue
      )
    ).toBe(false);
    expect(queue).not.toHaveBeenCalled();

    expect(
      await queueAfterConnectionFailure(
        new Error(
          'fetch failed: java.net.SocketTimeoutException: connect timed out'
        ),
        queue
      )
    ).toBe(true);
  });
});
