import { interleaveTopMatches } from '../../src/utils/topMatches';
import type { ProviderSearchResult } from '../../src/hooks/useAllProvidersSearch';
import type { ExternalProvider } from '../../src/types/externalProviders';
import type { ExternalFoodItem } from '../../src/types/externalFoods';

const provider = (id: string): ExternalProvider =>
  ({ id, provider_name: `Name ${id}`, provider_type: id }) as ExternalProvider;

const item = (id: string): ExternalFoodItem =>
  ({ id, name: `Food ${id}`, source: id }) as ExternalFoodItem;

const result = (
  id: string,
  items: ExternalFoodItem[],
  overrides: Partial<ProviderSearchResult> = {},
): ProviderSearchResult => ({
  provider: provider(id),
  items,
  totalCount: items.length,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...overrides,
});

describe('interleaveTopMatches', () => {
  it('round-robins rank 0 of every provider before rank 1', () => {
    const out = interleaveTopMatches([
      result('a', [item('a0'), item('a1')]),
      result('b', [item('b0'), item('b1')]),
    ]);
    expect(out.map((m) => m.online.id)).toEqual(['a0', 'b0', 'a1', 'b1']);
  });

  it('tags each match with its provider name and id', () => {
    const [first] = interleaveTopMatches([result('a', [item('a0')])]);
    expect(first).toMatchObject({
      providerId: 'a',
      providerName: 'Name a',
      online: { id: 'a0' },
    });
  });

  it('caps the list at 5 by default', () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      result(`p${i}`, [item(`p${i}-0`), item(`p${i}-1`)]),
    );
    expect(interleaveTopMatches(many)).toHaveLength(5);
  });

  it('takes at most perProvider ranks from any single provider', () => {
    const out = interleaveTopMatches(
      [result('a', [item('a0'), item('a1'), item('a2'), item('a3')])],
      2,
      10,
    );
    expect(out.map((m) => m.online.id)).toEqual(['a0', 'a1']);
  });

  it('shows at least one match per provider even past the base cap', () => {
    // 8 providers with one item each: every provider should appear, despite the
    // base cap of 5.
    const providers = Array.from({ length: 8 }, (_, i) =>
      result(`p${i}`, [item(`p${i}-0`)]),
    );
    const out = interleaveTopMatches(providers);
    expect(out).toHaveLength(8);
    expect(new Set(out.map((m) => m.providerId)).size).toBe(8);
  });

  it('only counts providers that returned results toward the minimum', () => {
    const out = interleaveTopMatches([
      result('a', [item('a0'), item('a1')]),
      result('b', [], { isError: true }),
      result('c', [item('c0'), item('c1')]),
    ]);
    // Two contributing providers, so the base cap of 5 still applies.
    expect(out).toHaveLength(4);
  });

  it('skips empty or failed providers without breaking the order', () => {
    const out = interleaveTopMatches([
      result('a', [item('a0'), item('a1')]),
      result('b', [], { isError: true }),
      result('c', [item('c0')]),
    ]);
    expect(out.map((m) => m.online.id)).toEqual(['a0', 'c0', 'a1']);
  });

  it('returns an empty list when no provider has results', () => {
    expect(
      interleaveTopMatches([
        result('a', [], { isLoading: true }),
        result('b', [], { isError: true }),
      ]),
    ).toEqual([]);
  });
});
