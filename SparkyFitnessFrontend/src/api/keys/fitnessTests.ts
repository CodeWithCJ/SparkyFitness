export const fitnessTestKeys = {
  all: ['fitnessTests'] as const,
  list: () => [...fitnessTestKeys.all, 'list'] as const,
};
