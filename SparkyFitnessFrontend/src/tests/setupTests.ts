import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder in jsdom
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}