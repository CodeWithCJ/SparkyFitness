import { useCSSVariable } from 'uniwind';
import { ExternalProvider } from '../types/externalProviders';

// Per-provider signature colours used to tell sources apart at a glance in the
// All Providers search: a tinted badge behind Top Matches rows and a dot before
// each By Source provider. Colours are drawn from the theme's category palette
// in global.css (the same contrast-tuned vars used for the settings icons)
// rather than hardcoded hex, so they stay consistent with the rest of the app
// and adapt to light/dark/amoled themes.
const PROVIDER_PALETTE_VARS = [
  '--color-cat-green',
  '--color-cat-violet',
  '--color-cat-pink',
  '--color-cat-blue',
  '--color-cat-teal',
  '--color-cat-amber',
];

// Returns a resolver mapping a provider id to a theme colour. Providers are
// assigned colours by their position in the active list (palette[i % length]),
// not by a hash of their type: with only a handful of palette entries a hash
// has a real collision chance (birthday paradox), and any collision defeats the
// point of telling sources apart. Index assignment is collision-free as long as
// the active providers fit the palette, and still covers providers that have no
// dedicated colour. It is not stable across reordering, which is fine for
// at-a-glance grouping. Read the palette through uniwind so the values follow
// the active theme; call this at the top of a component and use the returned
// function while rendering rows.
// Maps each provider id to a palette colour by list position. Collision-free
// while the active providers fit the palette; wraps past that.
export function buildProviderColorMap(
  providers: ExternalProvider[],
  palette: string[],
): Map<string, string> {
  const byId = new Map<string, string>();
  if (palette.length > 0) {
    providers.forEach((p, i) => {
      byId.set(p.id, palette[i % palette.length]);
    });
  }
  return byId;
}

export function useProviderColor(
  providers: ExternalProvider[],
): (providerId?: string | null) => string {
  const palette = useCSSVariable(PROVIDER_PALETTE_VARS) as string[];
  const fallback = String(useCSSVariable('--color-text-muted'));

  const byId = buildProviderColorMap(providers, palette);

  return (providerId?: string | null): string => {
    if (!providerId) return fallback;
    return byId.get(providerId) ?? fallback;
  };
}
