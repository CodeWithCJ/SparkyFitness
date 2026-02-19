export const backupKeys = {
  all: ['backupSettings'] as const,
};
export const oidcKeys = {
  all: ['oidc-providers'] as const,
};

export const settingsKeys = {
  all: ['settings'] as const,
};

export const userKeys = {
  all: ['users'] as const,

  list: (filters: { searchTerm: string; sortBy: string; sortOrder: string }) =>
    [...userKeys.all, filters] as const,
  profile: (userId: string) => [...userKeys.all, 'profile', userId] as const,
};

export const aiServiceKeys = {
  all: ['aiServices'] as const,
  user: () => [...aiServiceKeys.all, 'user'] as const,
  global: () => [...aiServiceKeys.all, 'global'] as const,
  active: () => [...aiServiceKeys.all, 'active'] as const,
  one: (serviceId: string) => [...aiServiceKeys.all, serviceId] as const,
};

export const userPreferencesKeys = {
  all: ['userPreferences'] as const,
  ai: () => [...userPreferencesKeys.all, 'ai'] as const,
};

export const userAiConfigKeys = {
  all: ['userAiConfigAllowed'] as const,
};
