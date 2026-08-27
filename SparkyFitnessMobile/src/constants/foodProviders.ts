/**
 * Sentinel provider id for the aggregated "All Providers" food search. It is not a
 * real provider id, so anything that resolves or validates a provider selection
 * has to let it through explicitly.
 *
 * Shared rather than redeclared per screen: the search screen and the settings
 * screen both have to agree on it, and the web side already had a second copy
 * drift out of sync with its resolver once.
 */
export const ALL_PROVIDERS_VALUE = '__all__';

