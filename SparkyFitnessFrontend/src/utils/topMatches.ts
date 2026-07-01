import type {
  ExternalResultWrapper,
  ProviderFoodSearchResult,
} from '@/hooks/Foods/useAllProvidersFoodSearch';

export interface TopMatch {
  result: ExternalResultWrapper;
  providerName: string;
  providerId: string;
}

// Round-robin interleave of each provider's top results for the All Providers
// "Top Matches" section: take rank 0 from every provider, then rank 1, and so
// on up to perProvider ranks, then cap the list. This keeps Top Matches
// balanced across sources instead of letting one fast/large provider dominate.
// A provider that returned fewer items than the current rank is simply skipped,
// so empty or failed providers contribute nothing without breaking the order.
// The cap never drops below the number of providers that returned results:
// because the round robin emits every provider's first item before any second
// item, this guarantees at least one match from every contributing provider, so
// the user always sees that each of their configured providers was searched.
export function interleaveTopMatches(
  providerResults: ProviderFoodSearchResult[],
  perProvider = 2,
  baseCap = 5
): TopMatch[] {
  const out: TopMatch[] = [];
  for (let rank = 0; rank < perProvider; rank++) {
    for (const r of providerResults) {
      const item = r.items[rank];
      if (item) {
        out.push({
          result: item,
          providerName: r.provider.provider_name,
          providerId: r.provider.id,
        });
      }
    }
  }
  const providersWithResults = providerResults.filter(
    (r) => r.items.length > 0
  ).length;
  return out.slice(0, Math.max(baseCap, providersWithResults));
}
