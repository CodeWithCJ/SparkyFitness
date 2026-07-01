import type { DataProvider } from '@/types/settings';

// Per-provider signature colours used to tell sources apart at a glance in the
// "All Providers" aggregated search: a tinted badge behind Top Matches rows and
// a dot before each By Source provider. Colours are assigned by the provider's
// position in the active list (palette[i % length]), not by a hash of its type:
// with only a handful of palette entries a hash has a real collision chance
// (birthday paradox), and any collision defeats the point of telling sources
// apart. Index assignment is collision-free as long as the active providers fit
// the palette, and still covers providers past that by wrapping. It is not
// stable across reordering, which is fine for at-a-glance grouping.
//
// The palette reuses the hex values already used by the web app's report charts
// (see NutritionChartsGrid / FastingReport) so provider colours look native to
// the rest of the UI. These are static hex values (like the existing chart
// palettes) and intentionally do not adapt to light/dark themes.
export const PROVIDER_COLOR_PALETTE = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#22a6b3', // Teal
  '#f59e0b', // Amber
  '#e056fd', // Violet
  '#22c55e', // Green
  '#ef4444', // Red
  '#45B7D1', // Blue
];

const FALLBACK_COLOR = '#94a3b8'; // slate-400, matches muted-foreground tone

// Maps each provider id to a palette colour by list position. Collision-free
// while the active providers fit the palette; wraps past that.
export function buildProviderColorMap(
  providers: DataProvider[],
  palette: string[] = PROVIDER_COLOR_PALETTE
): Map<string, string> {
  const byId = new Map<string, string>();
  if (palette.length > 0) {
    providers.forEach((p, i) => {
      byId.set(p.id, palette[i % palette.length] ?? FALLBACK_COLOR);
    });
  }
  return byId;
}

// Returns a resolver mapping a provider id to its assigned colour. Build the map
// once (e.g. via useMemo on the providers list) and call the returned function
// while rendering rows.
export function makeProviderColorResolver(
  providers: DataProvider[],
  palette: string[] = PROVIDER_COLOR_PALETTE
): (providerId?: string | null) => string {
  const byId = buildProviderColorMap(providers, palette);
  return (providerId?: string | null): string => {
    if (!providerId) return FALLBACK_COLOR;
    return byId.get(providerId) ?? FALLBACK_COLOR;
  };
}
