import { fetchShoes } from '../../src/services/api/shoesApi';
import { findShoeThatReachedLimit } from '../../src/services/shoeWear';

jest.mock('../../src/services/api/shoesApi');

const mockedFetchShoes = jest.mocked(fetchShoes);
const shoe = (id: string, isWornOut: boolean) =>
  ({ id, is_worn_out: isWornOut }) as Awaited<
    ReturnType<typeof fetchShoes>
  >[number];

describe('findShoeThatReachedLimit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the pair when this run took it over its limit', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('a', false), shoe('b', true)]);
    await expect(findShoeThatReachedLimit('b', false)).resolves.toEqual(
      expect.objectContaining({ id: 'b' })
    );
    expect(mockedFetchShoes).toHaveBeenCalledWith('active');
  });

  it('returns null when the pair is still under its limit', async () => {
    mockedFetchShoes.mockResolvedValue([shoe('a', false)]);
    await expect(findShoeThatReachedLimit('a', false)).resolves.toBeNull();
  });

  it('does not ask again about a pair that was already over its limit', async () => {
    await expect(findShoeThatReachedLimit('a', true)).resolves.toBeNull();
    expect(mockedFetchShoes).not.toHaveBeenCalled();
  });

  it('returns null when the pair is no longer active', async () => {
    mockedFetchShoes.mockResolvedValue([]);
    await expect(findShoeThatReachedLimit('a', false)).resolves.toBeNull();
  });
});
