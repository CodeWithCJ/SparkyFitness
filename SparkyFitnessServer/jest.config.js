export const testEnvironment = 'node';
export const testMatch = ['**/tests/**/*.test.js', '**/__tests__/**/*.js'];
export const collectCoverage = false;
export const collectCoverageFrom = [
  'models/**/*.js',
  'services/**/*.js',
  'routes/**/*.js',
  'middleware/**/*.js',
  'utils/**/*.js',
  '!**/node_modules/**',
  '!**/tests/**',
  '!**/__tests__/**',
];
export const coverageDirectory = 'coverage';
export const coverageReporters = ['text', 'lcov', 'html'];
export const testTimeout = 10000;
export const moduleNameMapper = {
  '^@workspace/shared$': '<rootDir>/../shared/src/index.ts',
  '^@workspace/shared/(.*)$': '<rootDir>/../shared/src/$1',
};
export const transform = {
  '\\.js$': 'babel-jest',
  '\\.ts$': '<rootDir>/jest-ts-transform.js',
};
export const transformIgnorePatterns = [
  'node_modules/(?!(uuid|@workspace/shared)/)',
];
export const setupFilesAfterEnv = ['<rootDir>/jest.setup.js'];
export const clearMocks = true;
export const verbose = true;
export default {
  testEnvironment,
  testMatch,
  collectCoverage,
  collectCoverageFrom,
  coverageDirectory,
  coverageReporters,
  testTimeout,
  moduleNameMapper,
  transform,
  transformIgnorePatterns,
  setupFilesAfterEnv,
  clearMocks,
  verbose,
};
