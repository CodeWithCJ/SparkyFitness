export const reviewKeys = {
  all: ['review'] as const,
  items: () => [...reviewKeys.all, 'items'] as const,
  count: () => [...reviewKeys.all, 'count'] as const,
};
