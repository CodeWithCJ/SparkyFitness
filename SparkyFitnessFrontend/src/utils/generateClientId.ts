const formatUuidFromBytes = (bytes: Uint8Array) => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
};

export const generateClientId = () => {
  const cryptoObject = globalThis.crypto;

  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));

    const versionByte = bytes[6] ?? 0;
    const variantByte = bytes[8] ?? 0;

    bytes[6] = (versionByte & 0x0f) | 0x40;
    bytes[8] = (variantByte & 0x3f) | 0x80;

    return formatUuidFromBytes(bytes);
  }

  return `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};
