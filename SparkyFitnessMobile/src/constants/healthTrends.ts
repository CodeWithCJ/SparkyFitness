/**
 * Every graph the Health Trends pager can show, in factory-default order.
 *
 * This is the single place a new graph is registered. Adding a key here makes it appear
 * — at the end of the list — for existing users too, because a saved order is reconciled
 * against this array rather than replacing it (see `resolveHealthTrendOrder`).
 *
 * The order deliberately matches the order the pager shipped with, so a user who never
 * opens the settings screen sees exactly what they saw before.
 */
export const HEALTH_TREND_KEYS = ['steps', 'weight', 'sleep'] as const;

export type HealthTrendKey = (typeof HEALTH_TREND_KEYS)[number];

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A graph's display name, shared with its chart card title.
 *
 * Resolvers rather than key strings because the i18n audit rejects a dynamic `t()` key;
 * the literal key has to appear at the call site. Typed as a total record so registering
 * a graph without naming it is a compile error.
 */
export const HEALTH_TREND_LABELS: Record<
  HealthTrendKey,
  (t: Translator) => string
> = {
  steps: (t) => t('charts.steps.title', { defaultValue: 'Steps' }),
  weight: (t) => t('charts.weight.title', { defaultValue: 'Weight' }),
  sleep: (t) => t('charts.sleep.title', { defaultValue: 'Sleep' }),
};
