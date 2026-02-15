export const authKeys = {
  settings: ['auth', 'settings'] as const,
  oidcProviders: ['auth', 'oidcProviders'] as const,
  mfaFactors: (email: string) => ['auth', 'mfaFactors', email] as const,
};
