export const challengeKeys = {
  all: ['challenges'] as const,
  /** Whether the admin switch is on (any signed-in person may ask). */
  status: () => [...challengeKeys.all, 'status'] as const,
  list: () => [...challengeKeys.all, 'list'] as const,
  detail: (id: string) => [...challengeKeys.all, 'detail', id] as const,
  /** Every period's standings of one challenge. */
  standingsOf: (id: string) => [...challengeKeys.all, 'standings', id] as const,
  /** Standings of the period holding `date` (null: the current period). */
  standings: (id: string, date: string | null) =>
    [...challengeKeys.all, 'standings', id, date ?? 'current'] as const,
  ruleChanges: (id: string) =>
    [...challengeKeys.all, 'ruleChanges', id] as const,
};
