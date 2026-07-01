import { interleaveTopMatches } from '@/utils/topMatches';
import type {
  ExternalResultWrapper,
  ProviderFoodSearchResult,
} from '@/hooks/Foods/useAllProvidersFoodSearch';
import type { DataProvider } from '@/types/settings';
import type { Food } from '@/types/food';

const provider = (id: string): DataProvider =>
  ({
    id,
    name: id,
    provider_type: id,
    provider_name: id.toUpperCase(),
    is_active: true,
    app_key: '',
  }) as DataProvider;

const item = (name: string): ExternalResultWrapper =>
  ({
    provider_type: 'usda',
    food: { name, provider_external_id: name } as Food,
  }) as ExternalResultWrapper;

const result = (id: string, names: string[]): ProviderFoodSearchResult => ({
  provider: provider(id),
  items: names.map(item),
  totalCount: names.length,
  isLoading: false,
  isError: false,
  refetch: () => {},
});

describe('interleaveTopMatches', () => {
  it('round-robins by rank across providers', () => {
    const out = interleaveTopMatches(
      [result('a', ['a1', 'a2', 'a3']), result('b', ['b1', 'b2'])],
      2,
      10
    );
    // rank 0: a1, b1 ; rank 1: a2, b2
    expect(out.map((m) => m.result.food.name)).toEqual([
      'a1',
      'b1',
      'a2',
      'b2',
    ]);
    expect(out[0]?.providerId).toBe('a');
    expect(out[1]?.providerId).toBe('b');
  });

  it('skips providers that ran out of items at a given rank', () => {
    const out = interleaveTopMatches(
      [result('a', ['a1', 'a2']), result('b', ['b1'])],
      2,
      10
    );
    expect(out.map((m) => m.result.food.name)).toEqual(['a1', 'b1', 'a2']);
  });

  it('caps at baseCap but never below the number of contributing providers', () => {
    const providers = ['a', 'b', 'c', 'd'].map((id) => result(id, [`${id}1`]));
    // baseCap 2 but 4 providers returned results -> keep all 4 first-rank items
    const out = interleaveTopMatches(providers, 2, 2);
    expect(out).toHaveLength(4);
    expect(out.map((m) => m.providerId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores empty providers when computing the floor', () => {
    const out = interleaveTopMatches(
      [result('a', ['a1', 'a2', 'a3']), result('b', [])],
      2,
      2
    );
    // only provider a contributes -> floor is 1, cap stays at baseCap 2
    expect(out.map((m) => m.result.food.name)).toEqual(['a1', 'a2']);
  });
});
