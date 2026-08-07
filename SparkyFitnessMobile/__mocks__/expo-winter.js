'use strict';
// Mock for expo/src/winter — the real runtime.native.ts installs lazy getters on
// globalThis that trigger native module resolution and fail under Jest + pnpm.
// The actual polyfill values are already set in jest.setup.js via Object.defineProperty.
module.exports = {};
