import {
  buildProviderColorMap,
  makeProviderColorResolver,
  PROVIDER_COLOR_PALETTE,
} from '@/utils/providerColor';
import type { DataProvider } from '@/types/settings';

const provider = (id: string): DataProvider =>
  ({
    id,
    name: id,
    provider_type: id,
    provider_name: id,
    is_active: true,
    app_key: '',
  }) as DataProvider;

describe('buildProviderColorMap', () => {
  it('assigns colours by list index (collision-free within palette)', () => {
    const providers = [provider('a'), provider('b'), provider('c')];
    const map = buildProviderColorMap(providers);
    expect(map.get('a')).toBe(PROVIDER_COLOR_PALETTE[0]);
    expect(map.get('b')).toBe(PROVIDER_COLOR_PALETTE[1]);
    expect(map.get('c')).toBe(PROVIDER_COLOR_PALETTE[2]);
    // All distinct
    expect(new Set([map.get('a'), map.get('b'), map.get('c')]).size).toBe(3);
  });

  it('wraps around the palette when providers exceed its length', () => {
    const providers = Array.from(
      { length: PROVIDER_COLOR_PALETTE.length + 1 },
      (_, i) => provider(`p${i}`)
    );
    const map = buildProviderColorMap(providers);
    expect(map.get('p0')).toBe(map.get(`p${PROVIDER_COLOR_PALETTE.length}`));
  });

  it('returns an empty map for an empty palette', () => {
    expect(buildProviderColorMap([provider('a')], []).size).toBe(0);
  });
});

describe('makeProviderColorResolver', () => {
  it('resolves known providers to their assigned colour', () => {
    const resolve = makeProviderColorResolver([provider('a'), provider('b')]);
    expect(resolve('a')).toBe(PROVIDER_COLOR_PALETTE[0]);
    expect(resolve('b')).toBe(PROVIDER_COLOR_PALETTE[1]);
  });

  it('falls back for unknown or missing ids', () => {
    const resolve = makeProviderColorResolver([provider('a')]);
    const fallback = resolve('unknown');
    expect(fallback).toBe(resolve(null));
    expect(fallback).toBe(resolve(undefined));
    expect(fallback).not.toBe(PROVIDER_COLOR_PALETTE[0]);
  });
});
