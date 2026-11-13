// How far back Compare reads by day and by week: the span presets the apps offer, the default
// one, and the longest custom span the endpoint takes. The apps, the endpoint's query schema and
// the AI tool all read these, so a default or a limit cannot drift between them.

/** The modes read over a span of days; since mode runs from its start date instead. */
export type CompareSpanMode = 'day' | 'week';

export type CompareSpan = '30d' | '60d' | '90d' | '6m' | '1y' | 'custom';

export const COMPARE_SPANS: Record<CompareSpanMode, readonly CompareSpan[]> = {
  day: ['30d', '60d', '90d', 'custom'],
  week: ['6m', '1y', 'custom'],
};

export const DEFAULT_COMPARE_SPAN: Record<
  CompareSpanMode,
  Exclude<CompareSpan, 'custom'>
> = {
  day: '90d',
  week: '6m',
};

/** Calendar days in each preset span, counting both ends. */
export const COMPARE_SPAN_DAYS: Record<
  Exclude<CompareSpan, 'custom'>,
  number
> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '6m': 182,
  '1y': 364,
};

/** The longest span the endpoint accepts, counting both ends; a custom span is held to it. */
export const MAX_CUSTOM_DAYS: Record<CompareSpanMode, number> = {
  day: 180,
  week: 366,
};
