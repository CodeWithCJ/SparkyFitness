module.exports = {
  // Node environment (not jsdom - this is backend code)
  testEnvironment: 'node',

  // Test file patterns
  testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.js'],

  // Coverage configuration
  collectCoverage: false, // Enable via --coverage flag
  collectCoverageFrom: [
    'models/**/*.js',
    'services/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Timeout for async tests
  testTimeout: 10000,

  // Module name mapping for workspace packages
  moduleNameMapper: {
    '^@workspace/shared$': '<rootDir>/../shared/src/index.ts',
    '^@workspace/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },

  // Transform TypeScript files using the built-in typescript package
  // (keep the default babel-jest for .js so jest.mock hoisting still works)
  transform: {
    '\\.js$': 'babel-jest',
    '\\.ts$': '<rootDir>/jest-ts-transform.js',
  },

  // Transform ES modules from node_modules
  transformIgnorePatterns: ['node_modules/(?!(uuid|@workspace/shared)/)'],

  // Setup file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,
};
