import { buildProviderColorMap } from '../../src/utils/providerColor';
import type { ExternalProvider } from '../../src/types/externalProviders';

const provider = (id: string): ExternalProvider =>
  ({ id, provider_name: id, provider_type: id, is_active: true }) as ExternalProvider;

const PALETTE = ['c0', 'c1', 'c2', 'c3'];

describe('buildProviderColorMap', () => {
  it('assigns colours by list position', () => {
    const map = buildProviderColorMap(
      [provider('a'), provider('b'), provider('c')],
      PALETTE,
    );
    expect(map.get('a')).toBe('c0');
    expect(map.get('b')).toBe('c1');
    expect(map.get('c')).toBe('c2');
  });

  it('gives every provider a distinct colour when they fit the palette', () => {
    const providers = PALETTE.map((_, i) => provider(`p${i}`));
    const map = buildProviderColorMap(providers, PALETTE);
    const colours = providers.map((p) => map.get(p.id));
    expect(new Set(colours).size).toBe(providers.length);
  });

  it('wraps around once providers exceed the palette', () => {
    const map = buildProviderColorMap(
      [provider('a'), provider('b'), provider('c'), provider('d'), provider('e')],
      PALETTE,
    );
    // 5th provider wraps back to the first colour.
    expect(map.get('e')).toBe('c0');
    expect(map.get('e')).toBe(map.get('a'));
  });

  it('returns an empty map when the palette has not resolved yet', () => {
    expect(buildProviderColorMap([provider('a')], []).size).toBe(0);
  });
});
