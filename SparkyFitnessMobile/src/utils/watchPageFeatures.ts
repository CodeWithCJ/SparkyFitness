import {
  isFeatureEnabled,
  type ChoiceFeatureKey,
  type FeatureChoicesResponse,
} from '@workspace/shared';
import {
  WATCH_PAGE_FEATURES,
  WATCH_PAGE_KEYS,
  type WatchPageKey,
} from '../constants/watchPages';

/** The optional features the watch has pages or tiles of. */
const WATCH_FEATURES: readonly ChoiceFeatureKey[] = [
  ...new Set(
    WATCH_PAGE_KEYS.flatMap((page) => WATCH_PAGE_FEATURES[page] ?? [])
  ),
];

/**
 * The watch's features that are off in this app (#3487), from the choices
 * `useFeatureChoicesQuery` gives. Undefined while they are not known (loading,
 * or the read failed): the watch then keeps what it last had, so a page does
 * not come back for a moment each time the app starts. A server older than
 * Features (null) leaves every feature at its default.
 */
export function watchOffFeatures(
  response: FeatureChoicesResponse | null | undefined
): ChoiceFeatureKey[] | undefined {
  if (response === undefined) return undefined;
  const sources = {
    choices: response?.feature_choices,
    cycleEnabled: undefined,
  };
  return WATCH_FEATURES.filter(
    (key) => !isFeatureEnabled(key, 'mobile', sources)
  );
}

/**
 * The pages the watch hides: the ones hidden in Watch settings plus those of
 * features that are off. Never every page: when the off features would leave
 * nothing, Goals shows. Watch builds that do not know `offFeatures` follow
 * this list too. The stored setting is not changed, so turning a feature back
 * on brings its page back where it was.
 */
export function watchHiddenPagesForContext(
  hidden: readonly WatchPageKey[],
  offFeatures: readonly ChoiceFeatureKey[]
): WatchPageKey[] {
  const off = new Set(offFeatures);
  const offPages = WATCH_PAGE_KEYS.filter((page) => {
    const feature = WATCH_PAGE_FEATURES[page];
    return feature !== undefined && off.has(feature) && !hidden.includes(page);
  });
  if (offPages.length === 0) return [...hidden];
  const folded = [...hidden, ...offPages];
  const anyShown = WATCH_PAGE_KEYS.some((page) => !folded.includes(page));
  return anyShown ? folded : folded.filter((page) => page !== 'goals');
}
