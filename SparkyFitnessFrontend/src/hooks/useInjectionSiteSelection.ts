import { useState, useMemo } from 'react';
import { INJECTION_SITES } from '@workspace/shared';
import { useSiteSuggestion } from '@/hooks/useMedications';

/**
 * Shared injection-site selection state: rotation suggestion, the user's active
 * site set (ordered), resting sites, and the effective selection (user tap,
 * falling back to the suggested site). Used by the Cabinet log form and the
 * Log-tab quick prompt so the behavior stays identical in both.
 */
export function useInjectionSiteSelection(medId: string) {
  const sitesQ = useSiteSuggestion(medId);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const suggestedSite = sitesQ.data?.suggestedSiteId ?? null;
  const restingSites = useMemo(
    () => new Set(sitesQ.data?.restingSiteIds ?? []),
    [sitesQ.data]
  );
  const mapSites = useMemo(() => {
    const active = sitesQ.data?.activeSiteIds;
    if (!active || active.length === 0) return undefined;
    const order = new Map(active.map((id, i) => [id, i] as const));
    return INJECTION_SITES.filter((s) => order.has(s.id)).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    );
  }, [sitesQ.data]);

  const site = selectedSite ?? suggestedSite;

  return {
    sitesQ,
    site,
    setSelectedSite,
    suggestedSite,
    restingSites,
    mapSites,
  };
}

export type InjectionSiteSelection = ReturnType<
  typeof useInjectionSiteSelection
>;
