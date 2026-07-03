export const generalKeys = {
  appVersion: ['appVersion'] as const,
  githubVersion: ['githubVersion'] as const,
  githubStars: (owner: string, repo: string) =>
    ['github', owner, repo, 'stars'] as const,
};
