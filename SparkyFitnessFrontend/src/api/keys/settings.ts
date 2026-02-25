export const externalProviderKeys = {
  all: ['externalProviders'] as const,
  lists: () => [...externalProviderKeys.all, 'list'] as const,
};

export const customCategoryKeys = {
  all: ['customCategories'] as const,
  lists: () => [...customCategoryKeys.all, 'list'] as const,
};

export const familyAccessKeys = {
  all: ['familyAccess'] as const,
  lists: () => [...familyAccessKeys.all, 'list'] as const,
  userSearch: (email: string) =>
    [...familyAccessKeys.all, 'search', email] as const,
};

export const passkeyKeys = {
  all: ['passkeys'] as const,
  lists: () => [...passkeyKeys.all, 'list'] as const,
};

export const waterContainerKeys = {
  all: ['waterContainers'] as const,
  lists: () => [...waterContainerKeys.all, 'list'] as const,
  primary: () => [...waterContainerKeys.all, 'primary'] as const,
};

export const apiKeyKeys = {
  all: ['apiKeys'] as const,
  lists: () => [...apiKeyKeys.all, 'list'] as const,
};

export const profileKeys = {
  all: ['profile'] as const,
  avatar: (url: string) => [...profileKeys.all, 'avatar', url] as const,
};
