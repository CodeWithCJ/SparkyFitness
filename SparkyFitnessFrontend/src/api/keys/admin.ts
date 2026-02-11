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
