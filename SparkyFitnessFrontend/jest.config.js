export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.ts'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@workspace/shared$': '<rootDir>/../shared/src/index.ts',
    '^@workspace/shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^better-auth$': '<rootDir>/src/__mocks__/better-auth.ts',
    '^better-auth/react$': '<rootDir>/src/__mocks__/better-auth-react.ts',
    '^better-auth/client/plugins$': '<rootDir>/src/__mocks__/better-auth-plugins.ts',
    '^@better-auth/api-key/client$': '<rootDir>/src/__mocks__/better-auth-api-key.ts',
    '^@better-auth/sso/client$': '<rootDir>/src/__mocks__/better-auth-sso.ts',
    '^@better-auth/passkey/client$': '<rootDir>/src/__mocks__/better-auth-passkey.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          module: 'ESNext',
          moduleResolution: 'node',
          types: ['jest', '@testing-library/jest-dom', 'node'],
          isolatedModules: true,
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transformIgnorePatterns: ['node_modules/(?!(better-auth|@better-auth)/)'],
};
