import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder in jsdom
if (typeof globalThis.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
