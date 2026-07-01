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
// The palette reuses hex values already used by the web app's report charts and
// nutrient config (see NutritionChartsGrid / FastingReport / CENTRAL_NUTRIENT_CONFIG)
// so provider colours look native to the rest of the UI. These are static hex
// values (like the existing chart palettes) and intentionally do not adapt to
// light/dark themes.
//
// Ordering matters: colours are assigned by list position, so the sequence is
// arranged to keep *adjacent* entries in clearly different hue families (e.g.
// indigo -> amber -> green -> pink -> cyan). This avoids the earlier problem
// where neighbouring providers landed on near-identical cyan/teal swatches that
// were hard to tell apart, especially as small dots on a dark background.
export const PROVIDER_COLOR_PALETTE = [
  '#6366f1', // Indigo (indigo-500)
  '#f59e0b', // Amber (amber-500)
  '#22c55e', // Green (green-500)
  '#ec4899', // Pink (pink-500)
  '#06b6d4', // Cyan (cyan-500)
  '#a855f7', // Purple (purple-500)
  '#ef4444', // Red (red-500)
  '#eab308', // Yellow (yellow-500)
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
