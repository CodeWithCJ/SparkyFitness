export const shoeKeys = {
  all: ['shoes'] as const,
  lists: () => [...shoeKeys.all, 'list'] as const,
  list: (status?: string) => [...shoeKeys.lists(), status ?? 'all'] as const,
};
