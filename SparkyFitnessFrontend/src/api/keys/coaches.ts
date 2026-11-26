export const coachKeys = {
  all: ['coaches'] as const,
  settings: () => [...coachKeys.all, 'settings'] as const,
  unread: () => [...coachKeys.all, 'unread'] as const,
  nudges: (coachId: string) => [...coachKeys.all, 'nudges', coachId] as const,
  knowledge: () => [...coachKeys.all, 'knowledge'] as const,
  preview: (key: string) => [...coachKeys.all, 'preview', key] as const,
};
