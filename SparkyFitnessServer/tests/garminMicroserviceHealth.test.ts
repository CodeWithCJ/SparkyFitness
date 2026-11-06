import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', async (importActual) => {
  const actual = await importActual<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: () => ({ post: vi.fn() }),
      get,
    },
  };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { checkGarminMicroserviceHealth } =
  await import('../integrations/garminconnect/garminConnectService.js');

describe('checkGarminMicroserviceHealth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is true when the root route answers, with a short timeout', async () => {
    get.mockResolvedValue({ status: 200, data: { message: 'running' } });

    await expect(checkGarminMicroserviceHealth()).resolves.toBe(true);
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/$/), {
      timeout: 3000,
    });
  });

  it('is false on a timeout', async () => {
    get.mockRejectedValue(
      new AxiosError('timeout of 3000ms exceeded', 'ECONNABORTED')
    );

    await expect(checkGarminMicroserviceHealth()).resolves.toBe(false);
  });

  it('is false when the connection is refused', async () => {
    get.mockRejectedValue(new AxiosError('', 'ECONNREFUSED'));

    await expect(checkGarminMicroserviceHealth()).resolves.toBe(false);
  });

  it('shares one request between concurrent checks', async () => {
    let answer!: (value: unknown) => void;
    get.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const first = checkGarminMicroserviceHealth();
    const second = checkGarminMicroserviceHealth();
    answer({ status: 200 });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('asks again once the previous check has finished', async () => {
    get.mockRejectedValueOnce(new AxiosError('', 'ECONNREFUSED'));
    await expect(checkGarminMicroserviceHealth()).resolves.toBe(false);

    get.mockResolvedValueOnce({ status: 200 });
    await expect(checkGarminMicroserviceHealth()).resolves.toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
