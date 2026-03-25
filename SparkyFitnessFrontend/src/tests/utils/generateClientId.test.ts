import { generateClientId } from '@/utils/generateClientId';

describe('generateClientId', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = jest.fn().mockReturnValue('uuid-from-randomUUID');

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID } as unknown as Crypto,
    });

    expect(generateClientId()).toBe('uuid-from-randomUUID');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = jest.fn((buffer: Uint8Array) => {
      buffer.set([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
        0x0c, 0x0d, 0x0e, 0x0f,
      ]);

      return buffer;
    });

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues } as unknown as Crypto,
    });

    expect(generateClientId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('returns a temporary id when crypto is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    expect(generateClientId()).toMatch(/^temp-[a-z0-9]+-[a-z0-9]+$/i);
  });
});
